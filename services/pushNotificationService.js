/**
 * Mobile push notifications via Firebase Cloud Messaging (FCM).
 *
 * Currently used for chat messages. Skips push when the recipient has no
 * device token or is actively viewing the conversation room.
 */
const userModel = require('../models/userModel');
const chatMessageModel = require('../models/chatMessageModel');
const chatConversationModel = require('../models/chatConversationModel');
const firebase = require('../utils/firebase');
const logger = require('../utils/logger');
const { CHAT_MESSAGE_TYPE } = require('../constants/chat');

/** Optional: set by sockets/index.js — Map/userId → Set(conversationId). */
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

const resolveRecipientIds = (conversation, message) => {
  const buyerId = Number(conversation.buyer_id);
  const sellerId = Number(conversation.seller_id);
  const senderId = message.sender_id != null ? Number(message.sender_id) : null;

  // SYSTEM with no sender — notify both participants
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

/**
 * Send FCM push for a new chat message to the other participant(s).
 * Fire-and-forget safe — never throws to callers.
 * @param {Object} conversation
 * @param {Object} message
 */
const sendChatMessagePush = async (conversation, message) => {
  try {
    if (!conversation?.id || !message) return;

    // Avoid spam for silent bootstrap system seeds if marked
    if (message.message_type === CHAT_MESSAGE_TYPE.SYSTEM && message.metadata?.skip_push) {
      return;
    }

    const recipientIds = resolveRecipientIds(conversation, message);
    if (!recipientIds.length) return;

    const title = buildChatNotificationTitle(message);
    const body = buildChatNotificationBody(message);

    await Promise.all(
      recipientIds.map(async (recipientId) => {
        if (
          isUserActiveInConversationFn &&
          isUserActiveInConversationFn(recipientId, conversation.id)
        ) {
          return;
        }

        const device = await userModel.findDeviceByUserId(recipientId);
        if (!device?.device_token) return;

        let badge = 1;
        try {
          const unread = await chatConversationModel.getTotalUnreadCount(recipientId);
          badge = Math.max(1, unread?.total || 1);
        } catch {
          // ignore badge lookup failures
        }

        const result = await firebase.sendPushToToken(device.device_token, {
          notification: { title, body },
          data: stringifyData({
            type: 'chat_message',
            conversation_id: conversation.id,
            message_id: message.id,
            message_type: message.message_type,
            sender_id: message.sender_id,
            sender_name: message.sender_name,
            context_type: conversation.last_context_type,
            context_id: conversation.last_context_id,
            click_action: 'OPEN_CHAT',
          }),
          android: {
            priority: 'high',
            notification: {
              channelId: 'chat_messages',
              sound: 'default',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge,
              },
            },
          },
        });

        if (!result.success && firebase.isInvalidFcmTokenError(result.errorCode)) {
          await userModel.deleteDeviceByToken(device.device_token);
          logger.info('Removed invalid FCM device token', {
            userId: recipientId,
            errorCode: result.errorCode,
          });
        }
      }),
    );
  } catch (error) {
    logger.warn('Chat push notification failed', { error: error.message });
  }
};

module.exports = {
  setActiveConversationChecker,
  sendChatMessagePush,
};
