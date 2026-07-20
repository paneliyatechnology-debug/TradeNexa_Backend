/**
 * Cross-platform push notifications via Firebase Cloud Messaging (FCM).
 *
 * Supports Android, iOS, and Web. Sends to every registered device for the
 * recipient. Skips push when the recipient is actively viewing the conversation.
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

const stringifyData = (data = {}) => {
  const out = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    out[key] = String(value);
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
  message.sender_company_name || message.sender_name || 'New message';

const buildChatNotificationBody = (message) => {
  const preview = chatMessageModel.buildPreview(
    message.message_type,
    message.content || message.message,
    message.metadata,
  );
  return preview || 'You have a new message';
};

const buildWebChatLink = (conversationId) => {
  const base = String(config.frontend?.url || '').replace(/\/$/, '');
  if (!base || !conversationId) return null;
  const path = String(config.frontend?.chatPath || '/chats').replace(/\/$/, '');
  return `${base}${path}/${conversationId}`;
};

/**
 * Build an FCM payload tailored to the client platform.
 * @param {string|null} deviceType
 * @param {{ title: string, body: string, data: Object, badge: number, conversationId: number|string }} opts
 */
const buildPlatformPushPayload = (deviceType, { title, body, data, badge, conversationId }) => {
  const type = normalizeDeviceType(deviceType);
  const commonData = stringifyData({
    ...data,
    platform: type || 'unknown',
  });

  const notification = { title, body };

  if (type === DEVICE_TYPES.ANDROID) {
    return {
      notification,
      data: commonData,
      android: {
        priority: 'high',
        notification: {
          title,
          body,
          channelId: 'chat_messages',
          sound: 'default',
          clickAction: 'OPEN_CHAT',
          defaultSound: true,
          notificationCount: badge,
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
            alert: { title, body },
            sound: 'default',
            badge,
            'mutable-content': 1,
          },
        },
      },
    };
  }

  if (type === DEVICE_TYPES.WEB) {
    const link = buildWebChatLink(conversationId);
    return {
      notification,
      data: commonData,
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          title,
          body,
          icon: config.frontend.pushIcon,
          badge: config.frontend.pushBadge,
          requireInteraction: true,
          tag: `chat-${conversationId}`,
        },
        ...(link ? { fcmOptions: { link } } : {}),
      },
    };
  }

  // Unknown platform — notification + data only (FCM routes by token type)
  return { notification, data: commonData };
};

/**
 * Send FCM push for a new chat message to all devices of the other participant(s).
 * Fire-and-forget safe — never throws to callers.
 * @param {Object} conversation
 * @param {Object} message
 */
const sendChatMessagePush = async (conversation, message) => {
  try {
    if (!conversation?.id || !message) return;

    if (message.message_type === CHAT_MESSAGE_TYPE.SYSTEM && message.metadata?.skip_push) {
      return;
    }

    const recipientIds = resolveRecipientIds(conversation, message);
    if (!recipientIds.length) return;

    const title = buildChatNotificationTitle(message);
    const body = buildChatNotificationBody(message);
    const baseData = {
      type: 'chat_message',
      conversation_id: conversation.id,
      message_id: message.id,
      message_type: message.message_type,
      sender_id: message.sender_id,
      sender_name: message.sender_name,
      context_type: conversation.last_context_type,
      context_id: conversation.last_context_id,
      click_action: 'OPEN_CHAT',
    };

    await Promise.all(
      recipientIds.map(async (recipientId) => {
        if (
          isUserActiveInConversationFn &&
          isUserActiveInConversationFn(recipientId, conversation.id)
        ) {
          return;
        }

        const devices = await userModel.findDevicesByUserId(recipientId);
        if (!devices.length) return;

        let badge = 1;
        try {
          const unread = await chatConversationModel.getTotalUnreadCount(recipientId);
          badge = Math.max(1, unread?.total || 1);
        } catch {
          // ignore badge lookup failures
        }

        await Promise.all(
          devices.map(async (device) => {
            const payload = buildPlatformPushPayload(device.device_type, {
              title,
              body,
              data: baseData,
              badge,
              conversationId: conversation.id,
            });

            const result = await firebase.sendPushToToken(device.device_token, payload);

            if (!result.success && firebase.isInvalidFcmTokenError(result.errorCode)) {
              await userModel.deleteDeviceByToken(device.device_token);
              logger.info('Removed invalid FCM device token', {
                userId: recipientId,
                deviceType: device.device_type,
                errorCode: result.errorCode,
              });
            }
          }),
        );
      }),
    );
  } catch (error) {
    logger.warn('Chat push notification failed', { error: error.message });
  }
};

module.exports = {
  setActiveConversationChecker,
  sendChatMessagePush,
  buildPlatformPushPayload,
  normalizeDeviceType,
};
