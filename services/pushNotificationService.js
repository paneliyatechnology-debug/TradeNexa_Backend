/**
 * Cross-platform chat push notifications via Firebase Cloud Messaging (FCM).
 *
 * Flow:
 * 1. Clients send device_type + device_token on verify-otp / register (or POST /auth/device)
 * 2. Tokens are stored one-per-platform per user (android | ios | web — max 3)
 * 3. On every new chat message, emitNewMessage triggers sendChatMessagePush
 * 4. All registered platforms for the recipient(s) receive an FCM message
 *
 * Platform notes (parity with working web):
 * - web     → notification + data (no webpush block; avoids invalid-argument)
 * - android → notification + data + android.channelId (chat_messages)
 * - ios     → notification + data + APNs alert / sound / badge
 *
 * FCM data keys must NOT include reserved names: from, message_type, google.*, gcm.*
 */
const userModel = require('../models/userModel');
const chatMessageModel = require('../models/chatMessageModel');
const chatConversationModel = require('../models/chatConversationModel');
const firebase = require('../utils/firebase');
const config = require('../config');
const logger = require('../utils/logger');
const { DEVICE_TYPES, DEVICE_TYPE_VALUES } = require('../constants');
const { CHAT_MESSAGE_TYPE } = require('../constants/chat');

// ==========================================
// Active-conversation hook (optional)
// ==========================================

/**
 * Optional checker: (userId, conversationId) => boolean.
 * Wired from sockets/index.js when a client joins a conversation room.
 * Currently unused for skip logic (all platforms always get FCM); kept for future UX.
 */
let isUserActiveInConversationFn = null;

/**
 * Register a function that reports whether a user is viewing a conversation.
 * @param {Function|null} fn
 */
const setActiveConversationChecker = (fn) => {
  isUserActiveInConversationFn = typeof fn === 'function' ? fn : null;
};

// ==========================================
// Payload helpers
// ==========================================

/**
 * Strip control characters and truncate notification text for FCM limits.
 * @param {*} value
 * @param {number} [maxLen=250]
 * @returns {string}
 */
const sanitizeText = (value, maxLen = 250) => {
  const text = String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
};

/**
 * Convert a plain object into FCM `data` map (all string values).
 * Drops FCM-reserved keys that cause messaging/invalid-argument.
 * @param {Object} [data]
 * @returns {Object<string, string>}
 */
const stringifyData = (data = {}) => {
  const RESERVED = new Set(['from', 'message_type']);
  const out = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const k = String(key);
    if (!k || RESERVED.has(k) || k.startsWith('google.') || k.startsWith('gcm.')) {
      return;
    }
    const str = String(value);
    if (!str) return;
    out[k] = str.length > 500 ? str.slice(0, 500) : str;
  });
  return out;
};

/**
 * Normalize client device_type to android | ios | web (or null if unknown).
 * @param {string|null|undefined} deviceType
 * @returns {string|null}
 */
const normalizeDeviceType = (deviceType) => {
  const type = String(deviceType || '')
    .toLowerCase()
    .trim();
  return DEVICE_TYPE_VALUES.includes(type) ? type : null;
};

/**
 * Heuristic: reject obvious mock / placeholder tokens (e.g. Android `dev_token_…`).
 * Real FCM registration tokens are long (typically 100+ chars) and never use that prefix.
 * @param {string} token
 * @returns {boolean}
 */
const looksLikeValidFcmToken = (token) => {
  const t = String(token || '').trim();
  if (t.length < 80) return false;
  if (/^dev[_-]?token/i.test(t)) return false;
  if (/^mock[-_]/i.test(t)) return false;
  if (/^test[-_]/i.test(t)) return false;
  return true;
};

/**
 * Resolve which participant(s) should receive push for a message.
 * Sender is excluded; SYSTEM messages without a sender notify both sides.
 * @param {Object} conversation
 * @param {Object} message
 * @returns {number[]}
 */
const resolveRecipientIds = (conversation, message) => {
  const buyerId = Number(conversation.buyer_id);
  const sellerId = Number(conversation.seller_id);
  const senderId = message.sender_id != null ? Number(message.sender_id) : null;

  if (senderId == null) {
    return [buyerId, sellerId].filter(Boolean);
  }

  if (senderId === buyerId) return [sellerId].filter(Boolean);
  if (senderId === sellerId) return [buyerId].filter(Boolean);
  return [buyerId, sellerId].filter((id) => id && id !== senderId);
};

/** Notification title: company name → user name → fallback. */
const buildChatNotificationTitle = (message) =>
  sanitizeText(
    message.sender_company_name || message.sender_name || 'New message',
    100,
  ) || 'New message';

/** Notification body: text preview or type label (Image, Quotation, …). */
const buildChatNotificationBody = (message) => {
  const preview = chatMessageModel.buildPreview(
    message.message_type,
    message.content || message.message,
    message.metadata,
  );
  return sanitizeText(preview || 'You have a new message', 250) || 'You have a new message';
};

/**
 * HTTPS deep link for web notification click (optional; stored in data.click_url).
 * @param {number|string} conversationId
 * @returns {string|null}
 */
const buildWebChatLink = (conversationId) => {
  const base = String(config.frontend?.url || '').replace(/\/$/, '');
  if (!base || !conversationId) return null;
  if (!/^https:\/\//i.test(base)) return null;
  const path = String(config.frontend?.chatPath || '/chats').replace(/\/$/, '');
  return `${base}${path}/${conversationId}`;
};

// ==========================================
// Platform-specific FCM payloads
// ==========================================

/**
 * Build an FCM message body for the given device_type.
 * Shared notification + data for all platforms; android/ios add native extras.
 *
 * @param {string|null} deviceType - android | ios | web
 * @param {{ title: string, body: string, data: Object, badge: number, conversationId: number|string }} opts
 * @returns {{ notification: Object, data: Object, android?: Object, apns?: Object }}
 */
const buildPlatformPushPayload = (deviceType, { title, body, data, badge, conversationId }) => {
  const type = normalizeDeviceType(deviceType);
  const safeTitle = sanitizeText(title, 100) || 'New message';
  const safeBody = sanitizeText(body, 250) || 'You have a new message';

  const commonData = stringifyData({
    ...data,
    title: safeTitle,
    body: safeBody,
    platform: type || 'unknown',
  });

  const notification = { title: safeTitle, body: safeBody };

  // ---------- Android ----------
  // Clients should create a notification channel with id `chat_messages`.
  if (type === DEVICE_TYPES.ANDROID) {
    return {
      notification,
      data: commonData,
      android: {
        priority: 'high',
        notification: {
          title: safeTitle,
          body: safeBody,
          channelId: 'chat_messages',
          sound: 'default',
          clickAction: 'OPEN_CHAT',
          defaultSound: true,
        },
      },
    };
  }

  // ---------- iOS (APNs via FCM) ----------
  // Requires APNs key/cert uploaded in Firebase Console for the iOS app.
  if (type === DEVICE_TYPES.IOS) {
    return {
      notification,
      data: commonData,
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'alert',
        },
        payload: {
          aps: {
            alert: { title: safeTitle, body: safeBody },
            sound: 'default',
            badge: Number.isFinite(badge) ? badge : 1,
          },
        },
      },
    };
  }

  // ---------- Web (and unknown) ----------
  // Minimal notification + data only. Do not send `webpush` / fcmOptions.link —
  // those caused messaging/invalid-argument in production.
  const clickUrl = type === DEVICE_TYPES.WEB ? buildWebChatLink(conversationId) : null;
  return {
    notification,
    data: stringifyData({
      ...commonData,
      ...(clickUrl ? { click_url: clickUrl } : {}),
    }),
  };
};

// ==========================================
// Send chat push
// ==========================================

/**
 * Send FCM push for a new chat message to every registered device of the recipient(s).
 * Fire-and-forget safe — never throws to callers (REST / socket message path).
 *
 * @param {Object} conversation - chat_conversations row (needs buyer_id, seller_id, id)
 * @param {Object} message - formatted chat message (needs id, sender_id, message_type, …)
 */
const sendChatMessagePush = async (conversation, message) => {
  try {
    if (!conversation?.id || !message) return;

    // Allow system seeds to opt out via metadata.skip_push
    if (message.message_type === CHAT_MESSAGE_TYPE.SYSTEM && message.metadata?.skip_push) {
      return;
    }

    const recipientIds = resolveRecipientIds(conversation, message);
    logger.info('Chat push starting', {
      conversationId: conversation.id,
      messageId: message.id,
      senderId: message.sender_id,
      recipientIds,
    });

    if (!recipientIds.length) return;

    const title = buildChatNotificationTitle(message);
    const body = buildChatNotificationBody(message);

    // Shared data map for all platforms (string values only after stringifyData)
    const baseData = {
      type: 'chat_message',
      conversation_id: conversation.id,
      message_id: message.id,
      // FCM reserves "message_type" — use chat_message_type
      chat_message_type: message.message_type,
      sender_id: message.sender_id,
      sender_name: message.sender_name,
      context_type: conversation.last_context_type,
      context_id: conversation.last_context_id,
      click_action: 'OPEN_CHAT',
    };

    await Promise.all(
      recipientIds.map(async (recipientId) => {
        // Up to 3 devices: android + ios + web
        const devices = await userModel.findDevicesByUserId(recipientId);
        if (!devices.length) {
          logger.warn('Chat push skipped: no device token registered', {
            recipientId,
            conversationId: conversation.id,
          });
          return;
        }

        let badge = 1;
        try {
          const unread = await chatConversationModel.getTotalUnreadCount(recipientId);
          badge = Math.max(1, unread?.total || 1);
        } catch {
          // Badge is best-effort (mainly for iOS)
        }

        await Promise.all(
          devices.map(async (device) => {
            const tokenLen = String(device.device_token || '').length;

            if (!looksLikeValidFcmToken(device.device_token)) {
              logger.warn('Chat push skipped: device token is not a real FCM token', {
                recipientId,
                deviceType: device.device_type,
                tokenLen,
              });
              return;
            }

            const payload = buildPlatformPushPayload(device.device_type, {
              title,
              body,
              data: baseData,
              badge,
              conversationId: conversation.id,
            });

            const result = await firebase.sendPushToToken(device.device_token, payload);

            if (result.success) {
              logger.info('Chat push sent', {
                recipientId,
                deviceType: device.device_type,
                conversationId: conversation.id,
                messageId: message.id,
                messageIdFcm: result.messageId,
              });
              return;
            }

            logger.warn('Chat push failed', {
              recipientId,
              deviceType: device.device_type,
              conversationId: conversation.id,
              errorCode: result.errorCode,
              errorMessage: result.errorMessage,
              tokenLen,
            });

            // Clean up permanently invalid registrations only
            if (firebase.isInvalidFcmTokenError(result.errorCode)) {
              await userModel.deleteDeviceByToken(device.device_token);
              logger.info('Removed invalid FCM device token', {
                recipientId,
                deviceType: device.device_type,
                errorCode: result.errorCode,
              });
            }
          }),
        );
      }),
    );
  } catch (error) {
    logger.warn('Chat push notification failed', { error: error.message, stack: error.stack });
  }
};

module.exports = {
  setActiveConversationChecker,
  sendChatMessagePush,
  buildPlatformPushPayload,
  normalizeDeviceType,
  looksLikeValidFcmToken,
};
