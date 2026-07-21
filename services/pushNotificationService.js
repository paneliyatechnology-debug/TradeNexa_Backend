/**
 * Cross-platform push notifications via Firebase Cloud Messaging (FCM).
 *
 * Supports Android, iOS, and Web. Tokens are saved from verify-otp / register.
 */
const userModel = require('../models/userModel');
const chatMessageModel = require('../models/chatMessageModel');
const chatConversationModel = require('../models/chatConversationModel');
const firebase = require('../utils/firebase');
const config = require('../config');
const logger = require('../utils/logger');
const { DEVICE_TYPES, DEVICE_TYPE_VALUES } = require('../constants');
const { CHAT_MESSAGE_TYPE } = require('../constants/chat');

/** Optional: set by sockets/index.js — (userId, conversationId) => boolean. */
let isUserActiveInConversationFn = null;

const setActiveConversationChecker = (fn) => {
  isUserActiveInConversationFn = typeof fn === 'function' ? fn : null;
};

const sanitizeText = (value, maxLen = 250) => {
  const text = String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
};

const stringifyData = (data = {}) => {
  // FCM reserves: from, message_type, google.*, gcm.*
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

const normalizeDeviceType = (deviceType) => {
  const type = String(deviceType || '')
    .toLowerCase()
    .trim();
  return DEVICE_TYPE_VALUES.includes(type) ? type : null;
};

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

const buildChatNotificationTitle = (message) =>
  sanitizeText(
    message.sender_company_name || message.sender_name || 'New message',
    100,
  ) || 'New message';

const buildChatNotificationBody = (message) => {
  const preview = chatMessageModel.buildPreview(
    message.message_type,
    message.content || message.message,
    message.metadata,
  );
  return sanitizeText(preview || 'You have a new message', 250) || 'You have a new message';
};

const buildWebChatLink = (conversationId) => {
  const base = String(config.frontend?.url || '').replace(/\/$/, '');
  if (!base || !conversationId) return null;
  if (!/^https:\/\//i.test(base)) return null; // FCM web links must be https
  const path = String(config.frontend?.chatPath || '/chats').replace(/\/$/, '');
  return `${base}${path}/${conversationId}`;
};

/**
 * Build an FCM payload tailored to the client platform.
 * Web uses notification + data only (no webpush block — avoids invalid-argument).
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
        },
      },
    };
  }

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

  // WEB + unknown: minimal payload only.
  // Do NOT send webpush / fcmOptions.link — those commonly cause messaging/invalid-argument
  // when the domain is not registered in Firebase or the link shape is rejected.
  const clickUrl = type === DEVICE_TYPES.WEB ? buildWebChatLink(conversationId) : null;
  return {
    notification,
    data: stringifyData({
      ...commonData,
      ...(clickUrl ? { click_url: clickUrl } : {}),
    }),
  };
};

/**
 * Send FCM push for a new chat message to all devices of the other participant(s).
 * Uses tokens saved from verify-otp / register. Fire-and-forget — never throws.
 */
const sendChatMessagePush = async (conversation, message) => {
  try {
    if (!conversation?.id || !message) return;

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
    const baseData = {
      type: 'chat_message',
      conversation_id: conversation.id,
      message_id: message.id,
      // FCM reserves the key "message_type" — use chat_message_type instead
      chat_message_type: message.message_type,
      sender_id: message.sender_id,
      sender_name: message.sender_name,
      context_type: conversation.last_context_type,
      context_id: conversation.last_context_id,
      click_action: 'OPEN_CHAT',
    };

    await Promise.all(
      recipientIds.map(async (recipientId) => {
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
          // ignore
        }

        await Promise.all(
          devices.map(async (device) => {
            const tokenLen = String(device.device_token || '').length;
            if (tokenLen < 20) {
              logger.warn('Chat push skipped: device token looks invalid', {
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
};
