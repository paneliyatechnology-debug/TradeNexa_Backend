/**
 * Chat-specific FCM push — builds title/body/recipients then delegates to
 * notificationService (shared android / ios / web transport).
 *
 * Triggered from chatSocketEmitter.emitNewMessage after every persisted message.
 */
const chatMessageModel = require('../models/chatMessageModel');
const chatConversationModel = require('../models/chatConversationModel');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');
const { CHAT_MESSAGE_TYPE } = require('../constants/chat');
const {
  NOTIFICATION_TYPE,
  NOTIFICATION_CLICK_ACTION,
} = require('../constants/notification');

// ==========================================
// Active-conversation hook (optional / future)
// ==========================================

/** Optional: (userId, conversationId) => boolean — wired from sockets/index.js. */
let isUserActiveInConversationFn = null;

/**
 * Register whether a user is currently viewing a conversation room.
 * @param {Function|null} fn
 */
const setActiveConversationChecker = (fn) => {
  isUserActiveInConversationFn = typeof fn === 'function' ? fn : null;
};

// ==========================================
// Chat helpers
// ==========================================

/**
 * Resolve which participant(s) should receive push for a chat message.
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

const buildChatNotificationTitle = (message) =>
  notificationService.sanitizeText(
    message.sender_company_name || message.sender_name || 'New message',
    100,
  ) || 'New message';

const buildChatNotificationBody = (message) => {
  const preview = chatMessageModel.buildPreview(
    message.message_type,
    message.content || message.message,
    message.metadata,
  );
  return (
    notificationService.sanitizeText(preview || 'You have a new message', 250) ||
    'You have a new message'
  );
};

// ==========================================
// Send chat push
// ==========================================

/**
 * Push a new chat message to the other participant(s) on all their devices.
 * Fire-and-forget safe — never throws.
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
    logger.info('Chat push starting', {
      conversationId: conversation.id,
      messageId: message.id,
      senderId: message.sender_id,
      recipientIds,
    });

    if (!recipientIds.length) return;

    const title = buildChatNotificationTitle(message);
    const body = buildChatNotificationBody(message);
    const chatPath = String(require('../config').frontend?.chatPath || '/chats').replace(
      /\/$/,
      '',
    );

    await Promise.all(
      recipientIds.map(async (recipientId) => {
        let badge = 1;
        try {
          const unread = await chatConversationModel.getTotalUnreadCount(recipientId);
          badge = Math.max(1, unread?.total || 1);
        } catch {
          // best-effort
        }

        await notificationService.send({
          receiverId: recipientId,
          type: NOTIFICATION_TYPE.CHAT_MESSAGE,
          title,
          body,
          referenceId: conversation.id,
          senderId: message.sender_id,
          clickAction: NOTIFICATION_CLICK_ACTION.OPEN_CHAT,
          webPath: `${chatPath}/${conversation.id}`,
          channelId: 'chat_messages',
          badge,
          data: {
            conversation_id: conversation.id,
            message_id: message.id,
            chat_message_type: message.message_type,
            sender_name: message.sender_name,
            context_type: conversation.last_context_type,
            context_id: conversation.last_context_id,
          },
        });
      }),
    );
  } catch (error) {
    logger.warn('Chat push notification failed', { error: error.message, stack: error.stack });
  }
};

module.exports = {
  setActiveConversationChecker,
  sendChatMessagePush,
  resolveRecipientIds,
  buildChatNotificationTitle,
  buildChatNotificationBody,
};
