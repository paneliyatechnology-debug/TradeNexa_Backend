/**
 * Chat-specific FCM push — builds title/body/recipients then delegates to
 * notificationService (shared android / ios / web transport).
 *
 * Triggered from chatSocketEmitter.emitNewMessage after every persisted message.
 *
 * Important: RFQ / inquiry workflow already sends a dedicated business push
 * (QUOTATION_RECEIVED, RFQ_NEW_QUOTATION, …). Chat must NOT also FCM for:
 * - SYSTEM timeline messages
 * - workflow QUOTATION / PRODUCT cards that carry `metadata.skip_push` or `event_type`
 * Otherwise the receiver gets duplicate notifications for one action.
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

  // System / bot messages have no sender — never blast both sides with chat FCM.
  // Workflow events use business notificationService instead.
  if (senderId == null) {
    return [];
  }
  if (senderId === buyerId) return [sellerId].filter(Boolean);
  if (senderId === sellerId) return [buyerId].filter(Boolean);
  return [buyerId, sellerId].filter((id) => id && id !== senderId);
};

/**
 * Truthy skip_push from JSON metadata (boolean, "true", or 1).
 * @param {*} value
 * @returns {boolean}
 */
const isSkipPushFlag = (value) =>
  value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';

/**
 * Whether this chat message should skip FCM (business push already covers it).
 * @param {Object} message
 * @returns {boolean}
 */
const shouldSkipChatPush = (message) => {
  if (!message) return true;

  const meta = message.metadata && typeof message.metadata === 'object' ? message.metadata : {};

  // Explicit flag from inquiryService / rfqService workflow hooks
  if (isSkipPushFlag(meta.skip_push)) return true;

  // SYSTEM timeline rows are never chat FCM — business modules notify the right role
  if (message.message_type === CHAT_MESSAGE_TYPE.SYSTEM) return true;

  // Quotation cards posted by recordSystemEvent / recordInquirySystemEvent
  if (message.message_type === CHAT_MESSAGE_TYPE.QUOTATION && meta.event_type) {
    return true;
  }

  // Product cards tied to inquiry workflow seeds
  if (
    message.message_type === CHAT_MESSAGE_TYPE.PRODUCT &&
    (meta.event_type || isSkipPushFlag(meta.skip_push))
  ) {
    return true;
  }

  return false;
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

    if (shouldSkipChatPush(message)) {
      logger.info('Chat push skipped (workflow / system message)', {
        conversationId: conversation.id,
        messageId: message.id,
        messageType: message.message_type,
        eventType: message.metadata?.event_type || null,
        skipPush: message.metadata?.skip_push ?? null,
      });
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

    await Promise.all(
      recipientIds.map(async (recipientId) => {
        if (
          typeof isUserActiveInConversationFn === 'function' &&
          isUserActiveInConversationFn(recipientId, conversation.id)
        ) {
          logger.info('Chat push skipped: user active in conversation', {
            conversationId: conversation.id,
            recipientId,
          });
          return;
        }

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
  shouldSkipChatPush,
  buildChatNotificationTitle,
  buildChatNotificationBody,
};
