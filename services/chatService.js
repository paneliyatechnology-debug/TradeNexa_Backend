/**
 * Chat business logic — conversations, messages, RFQ system events, and authorization.
 *
 * Integrates with RFQ workflow via recordSystemEvent() for automatic SYSTEM messages.
 * Real-time delivery is delegated to chatSocketEmitter after DB persistence.
 */
const db = require('../database/knex');
const chatConversationModel = require('../models/chatConversationModel');
const chatMessageModel = require('../models/chatMessageModel');
const userPresenceModel = require('../models/userPresenceModel');
const rfqModel = require('../models/rfqModel');
const rfqSellerModel = require('../models/rfqSellerModel');
const quotationModel = require('../models/quotationModel');
const productModel = require('../models/productModel');
const userModel = require('../models/userModel');
const { AppError } = require('../utils/response');
const {
  CHAT_MESSAGE_TYPE,
  CHAT_SYSTEM_EVENT,
  CHAT_SYSTEM_EVENT_LABELS,
} = require('../constants/chat');
const { RFQ_STATUS } = require('../constants/rfq');
const chatSocketEmitter = require('./chatSocketEmitter');
const logger = require('../utils/logger');

// ==========================================
// Authorization helpers
// ==========================================

const getUserRoleInConversation = (conversation, userId) => {
  if (conversation.buyer_id === userId) return 'buyer';
  if (conversation.seller_id === userId) return 'seller';
  return null;
};

/** Ensure the user is a participant (buyer or seller) in the conversation. */
const assertConversationParticipant = (conversation, userId) => {
  const role = getUserRoleInConversation(conversation, userId);
  if (!role) throw new AppError('Forbidden: Access denied', 403);
  return role;
};

/** Validate RFQ and user roles before creating a new conversation thread. */
const assertCanStartConversation = async (rfq, userId, sellerId) => {
  if (rfq.status === RFQ_STATUS.DRAFT) {
    throw new AppError('Cannot start chat on draft RFQ', 400);
  }

  const buyerId = rfq.buyer_id;
  if (userId !== buyerId && userId !== sellerId) {
    throw new AppError('Forbidden: Access denied', 403);
  }

  if (buyerId === sellerId) {
    throw new AppError('Buyer and seller cannot be the same user', 400);
  }

  if (userId === sellerId) {
    const allowed = await rfqSellerModel.isSellerAllowed(rfq, sellerId);
    if (!allowed) throw new AppError('Forbidden: RFQ not available', 403);
  }
};

/** Load conversation with participant presence for detail/inbox views. */
const getConversationDetail = async (conversationId, viewerId) => {
  const row = await chatConversationModel.findById(conversationId);
  if (!row) throw new AppError('Conversation not found', 404);

  assertConversationParticipant(row, viewerId);

  const presenceRows = await userPresenceModel.findByUserIds([row.buyer_id, row.seller_id]);
  const presenceMap = Object.fromEntries(presenceRows.map((p) => [p.user_id, p]));

  const formatted = chatConversationModel.formatConversationRow(row, viewerId);
  return {
    ...formatted,
    buyer: {
      ...formatted.buyer,
      presence: presenceMap[row.buyer_id] || { status: 'offline', last_seen_at: null },
    },
    seller: {
      ...formatted.seller,
      presence: presenceMap[row.seller_id] || { status: 'offline', last_seen_at: null },
    },
  };
};

// ==========================================
// Conversation operations
// ==========================================

/**
 * Start or return an existing RFQ conversation (buyer ↔ seller).
 * Idempotent: returns existing row when (rfq_id, seller_id) already exists.
 */
const startConversation = async ({ rfqId, sellerId, userId }) => {
  const rfq = await rfqModel.findRfqById(rfqId, { raw: true });
  if (!rfq) throw new AppError('RFQ not found', 404);

  const resolvedSellerId = sellerId || userId;
  if (!resolvedSellerId) throw new AppError('seller_id is required', 400);

  await assertCanStartConversation(rfq, userId, resolvedSellerId);

  const existing = await chatConversationModel.findByRfqAndSeller(rfqId, resolvedSellerId);
  if (existing) {
    return getConversationDetail(existing.id, userId);
  }

  const conversation = await chatConversationModel.createConversation({
    rfq_id: rfqId,
    buyer_id: rfq.buyer_id,
    seller_id: resolvedSellerId,
    initiated_by: userId,
  });

  return getConversationDetail(conversation.id, userId);
};

/** Paginated inbox for buyer or seller. */
const listMyConversations = async (userId, filters = {}) =>
  chatConversationModel.listConversationsForUser(userId, filters);

/** Buyer-only: all seller threads on one RFQ. */
const listRfqConversations = async (rfqId, userId, filters = {}) => {
  const rfq = await rfqModel.findRfqById(rfqId, { raw: true });
  if (!rfq) throw new AppError('RFQ not found', 404);
  if (rfq.buyer_id !== userId) throw new AppError('Forbidden: Access denied', 403);
  return chatConversationModel.listConversationsByRfq(rfqId, userId, filters);
};

/** Aggregate unread counts for inbox badge display. */
const getUnreadSummary = async (userId) => chatConversationModel.getTotalUnreadCount(userId);

// ==========================================
// Message validation & persistence
// ==========================================

/** Validate and normalize payload by message_type before DB insert. */
const validateMessagePayload = async (conversation, data, senderId) => {
  const { message_type: messageType } = data;

  if (messageType === CHAT_MESSAGE_TYPE.TEXT) {
    if (!data.content || !String(data.content).trim()) {
      throw new AppError('Message content is required for TEXT messages', 400);
    }
    return { content: String(data.content).trim(), metadata: null };
  }

  if (messageType === CHAT_MESSAGE_TYPE.PRODUCT) {
    const productId = data.product_id || data.metadata?.product_id;
    if (!productId) throw new AppError('product_id is required for PRODUCT messages', 400);
    const product = await productModel.findProductById(productId);
    if (!product) throw new AppError('Product not found', 404);
    return {
      content: data.content || `Product: ${product.name}`,
      metadata: {
        product_id: product.id,
        product_name: product.name,
        product_slug: product.slug,
        thumbnail: product.thumbnail,
        price: product.price,
        currency: product.currency,
      },
    };
  }

  if (messageType === CHAT_MESSAGE_TYPE.QUOTATION) {
    const quotationId = data.quotation_id || data.metadata?.quotation_id;
    if (!quotationId) throw new AppError('quotation_id is required for QUOTATION messages', 400);
    const quotation = await quotationModel.findById(quotationId, { raw: true });
    if (!quotation) throw new AppError('Quotation not found', 404);
    if (quotation.rfq_id !== conversation.rfq_id) {
      throw new AppError('Quotation does not belong to this RFQ conversation', 400);
    }
    if (quotation.seller_id !== conversation.seller_id) {
      throw new AppError('Quotation does not belong to this conversation', 403);
    }
    return {
      content: data.content || `Quotation ${quotation.quotation_number}`,
      metadata: {
        quotation_id: quotation.id,
        quotation_number: quotation.quotation_number,
        price: quotation.price,
        total_amount: quotation.total_amount,
        currency: quotation.currency || 'INR',
        status: quotation.status,
      },
    };
  }

  if (messageType === CHAT_MESSAGE_TYPE.IMAGE || messageType === CHAT_MESSAGE_TYPE.DOCUMENT) {
    if (!data.metadata?.file_path) {
      throw new AppError('File upload is required for media messages', 400);
    }
    return {
      content: data.content || data.metadata.file_name || null,
      metadata: data.metadata,
    };
  }

  throw new AppError('Invalid message type', 400);
};

/**
 * Insert message, update conversation preview, and increment recipient unread count.
 * Called inside a transaction from sendMessage / recordSystemEvent.
 */
const persistMessage = async (conversation, senderId, messageData, trx = null) => {
  const message = await chatMessageModel.createMessage(
    {
      conversation_id: conversation.id,
      sender_id: senderId,
      message_type: messageData.message_type,
      content: messageData.content,
      metadata: messageData.metadata,
      reply_to_message_id: messageData.reply_to_message_id || null,
    },
    trx,
  );

  const preview = chatMessageModel.buildPreview(
    message.message_type,
    message.content,
    chatMessageModel.parseMetadata(message.metadata),
  );

  await chatConversationModel.updateConversation(
    conversation.id,
    {
      last_message_id: message.id,
      last_message_at: message.created_at,
      last_message_preview: preview,
    },
    trx,
  );

  if (senderId) {
    const role = getUserRoleInConversation(conversation, senderId);
    const recipientRole = role === 'buyer' ? 'seller' : 'buyer';
    await chatConversationModel.incrementUnreadForRecipient(conversation.id, recipientRole, trx);
  } else {
    await chatConversationModel.incrementUnreadForRecipient(conversation.id, 'buyer', trx);
    await chatConversationModel.incrementUnreadForRecipient(conversation.id, 'seller', trx);
  }

  return message;
};

// ==========================================
// Message operations (REST)
// ==========================================

/** Send TEXT, PRODUCT, or QUOTATION message; emits Socket.IO events after commit. */
const sendMessage = async (conversationId, userId, data) => {
  const conversation = await chatConversationModel.findById(conversationId);
  if (!conversation) throw new AppError('Conversation not found', 404);
  assertConversationParticipant(conversation, userId);

  const payload = await validateMessagePayload(conversation, data, userId);

  const rawMessage = await db.transaction(async (trx) =>
    persistMessage(
      conversation,
      userId,
      {
        message_type: data.message_type,
        content: payload.content,
        metadata: payload.metadata,
        reply_to_message_id: data.reply_to_message_id,
      },
      trx,
    ),
  );

  const message = await chatMessageModel.findById(rawMessage.id);

  chatSocketEmitter.emitNewMessage(conversation, message);
  chatSocketEmitter.emitConversationUpdated(conversation.id, userId);

  return message;
};

/** Send IMAGE or DOCUMENT message after multipart upload. */
const sendMediaMessage = async (conversationId, userId, { messageType, fileMeta, content }) => {
  const conversation = await chatConversationModel.findById(conversationId);
  if (!conversation) throw new AppError('Conversation not found', 404);
  assertConversationParticipant(conversation, userId);

  const rawMessage = await db.transaction(async (trx) =>
    persistMessage(
      conversation,
      userId,
      {
        message_type: messageType,
        content: content || fileMeta.file_name || null,
        metadata: fileMeta,
      },
      trx,
    ),
  );

  const message = await chatMessageModel.findById(rawMessage.id);

  chatSocketEmitter.emitNewMessage(conversation, message);
  chatSocketEmitter.emitConversationUpdated(conversation.id, userId);

  return message;
};

/** Paginated message history with participant authorization. */
const listMessages = async (conversationId, userId, filters = {}) => {
  const conversation = await chatConversationModel.findById(conversationId);
  if (!conversation) throw new AppError('Conversation not found', 404);
  assertConversationParticipant(conversation, userId);
  return chatMessageModel.listMessages(conversationId, filters);
};

/** Mark conversation read for current user; emits read receipt via Socket.IO. */
const markConversationRead = async (conversationId, userId, lastReadMessageId = null) => {
  const conversation = await chatConversationModel.findById(conversationId);
  if (!conversation) throw new AppError('Conversation not found', 404);
  const role = assertConversationParticipant(conversation, userId);

  const resolvedMessageId =
    lastReadMessageId || (await chatMessageModel.getLatestMessageId(conversationId));

  if (!resolvedMessageId) {
    return getConversationDetail(conversationId, userId);
  }

  await chatConversationModel.resetUnreadForUser(conversationId, role, resolvedMessageId);

  chatSocketEmitter.emitMessageRead(conversation, {
    reader_id: userId,
    role,
    last_read_message_id: resolvedMessageId,
  });

  return getConversationDetail(conversationId, userId);
};

// ==========================================
// RFQ workflow system messages
// ==========================================

/**
 * Record an RFQ workflow event as a SYSTEM message in the buyer↔seller thread.
 * Auto-creates conversation if none exists. Failures are logged, never thrown.
 */
const recordSystemEvent = async ({
  rfqId,
  sellerId,
  eventType,
  quotationId = null,
  actorId = null,
  metadata = {},
}) => {
  try {
    if (!rfqId || !sellerId || !eventType) return null;

    const rfq = await rfqModel.findRfqById(rfqId, { raw: true });
    if (!rfq) return null;

    let conversation = await chatConversationModel.findByRfqAndSeller(rfqId, sellerId);
    if (!conversation) {
      conversation = await chatConversationModel.createConversation({
        rfq_id: rfqId,
        buyer_id: rfq.buyer_id,
        seller_id: sellerId,
        initiated_by: actorId || rfq.buyer_id,
      });
    }

    const label = CHAT_SYSTEM_EVENT_LABELS[eventType] || eventType;
    let quotationMeta = {};

    if (quotationId) {
      const quotation = await quotationModel.findById(quotationId, { raw: true });
      if (quotation) {
        quotationMeta = {
          quotation_id: quotation.id,
          quotation_number: quotation.quotation_number,
          price: quotation.price,
          total_amount: quotation.total_amount,
          status: quotation.status,
        };
      }
    }

    const rawMessage = await db.transaction(async (trx) =>
      persistMessage(
        conversation,
        null,
        {
          message_type: CHAT_MESSAGE_TYPE.SYSTEM,
          content: label,
          metadata: {
            event_type: eventType,
            rfq_id: rfqId,
            actor_id: actorId,
            ...quotationMeta,
            ...metadata,
          },
        },
        trx,
      ),
    );

    const message = await chatMessageModel.findById(rawMessage.id);

    chatSocketEmitter.emitNewMessage(conversation, message);
    chatSocketEmitter.emitConversationUpdated(conversation.id, actorId);

    return message;
  } catch (error) {
    logger.error('[Chat] Failed to record system event', {
      rfqId,
      sellerId,
      eventType,
      error: error.message,
    });
    return null;
  }
};

/** Used by Socket.IO to verify room join authorization. */
const assertUserCanJoinConversation = async (conversationId, userId) => {
  const conversation = await chatConversationModel.findById(conversationId);
  if (!conversation) throw new AppError('Conversation not found', 404);
  assertConversationParticipant(conversation, userId);
  return conversation;
};

/** Return buyer_id and seller_id for a conversation (Socket.IO room helpers). */
const getParticipantUserIds = async (conversationId) => {
  const conversation = await chatConversationModel.findById(conversationId);
  if (!conversation) return [];
  return [conversation.buyer_id, conversation.seller_id];
};

/**
 * Broadcast a system event to all sellers involved in an RFQ (quotations + invites).
 * Used for RFQ_CANCELLED and similar multi-seller notifications.
 */
const recordRfqEventForSellers = async (rfqId, eventType, actorId, metadata = {}) => {
  const quotationSellers = await db('quotations').where({ rfq_id: rfqId }).distinct('seller_id');
  const invitedSellers = await db('rfq_sellers').where({ rfq_id: rfqId }).distinct('seller_id');
  const sellerIds = [
    ...new Set([
      ...quotationSellers.map((row) => row.seller_id),
      ...invitedSellers.map((row) => row.seller_id),
    ]),
  ].filter(Boolean);

  for (const sellerId of sellerIds) {
    await recordSystemEvent({ rfqId, sellerId, eventType, actorId, metadata });
  }
};

// ==========================================
// Exports
// ==========================================

module.exports = {
  getUserRoleInConversation,
  getConversationDetail,
  startConversation,
  listMyConversations,
  listRfqConversations,
  getUnreadSummary,
  sendMessage,
  sendMediaMessage,
  listMessages,
  markConversationRead,
  recordSystemEvent,
  recordRfqEventForSellers,
  getParticipantUserIds,
  assertUserCanJoinConversation,
  CHAT_SYSTEM_EVENT,
};
