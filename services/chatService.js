/**
 * Chat business logic — one conversation per buyer↔seller pair.
 *
 * RFQ / product inquiry / quotation events append into the existing pair thread
 * and update last_context_* (never create a second conversation for the same pair).
 */
const db = require('../database/knex');
const chatConversationModel = require('../models/chatConversationModel');
const chatMessageModel = require('../models/chatMessageModel');
const userPresenceModel = require('../models/userPresenceModel');
const rfqModel = require('../models/rfqModel');
const rfqSellerModel = require('../models/rfqSellerModel');
const quotationModel = require('../models/quotationModel');
const inquiryModel = require('../models/inquiryModel');
const inquiryQuotationModel = require('../models/inquiryQuotationModel');
const productModel = require('../models/productModel');
const { AppError } = require('../utils/response');
const {
  CHAT_MESSAGE_TYPE,
  CHAT_SYSTEM_EVENT,
  CHAT_SYSTEM_EVENT_LABELS,
  CHAT_CONTEXT_TYPE,
  CHAT_SOCKET_EVENT,
} = require('../constants/chat');
const { RFQ_STATUS } = require('../constants/rfq');
const chatSocketEmitter = require('./chatSocketEmitter');
const logger = require('../utils/logger');

// ==========================================
// Authorization helpers
// ==========================================

const getUserRoleInConversation = (conversation, userId) => {
  if (Number(conversation.buyer_id) === Number(userId)) return 'buyer';
  if (Number(conversation.seller_id) === Number(userId)) return 'seller';
  return null;
};

const assertConversationParticipant = (conversation, userId) => {
  const role = getUserRoleInConversation(conversation, userId);
  if (!role) throw new AppError('Forbidden: Access denied', 403);
  return role;
};

const assertCanStartRfqChat = async (rfq, userId, sellerId) => {
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

const resolveContextPayload = async (conversationRow) => {
  if (!conversationRow) return null;
  const formatted = chatConversationModel.formatLastContext(conversationRow);
  if (formatted) return formatted;

  // Fallback for joined row missing titles — load titles on demand
  if (!conversationRow.last_context_type || !conversationRow.last_context_id) return null;

  if (conversationRow.last_context_type === CHAT_CONTEXT_TYPE.PRODUCT) {
    const product = await productModel.findProductById(conversationRow.last_context_id);
    return {
      type: CHAT_CONTEXT_TYPE.PRODUCT,
      id: conversationRow.last_context_id,
      title: product?.name || null,
    };
  }
  if (conversationRow.last_context_type === CHAT_CONTEXT_TYPE.RFQ) {
    const rfq = await rfqModel.findRfqById(conversationRow.last_context_id, { raw: true });
    return {
      type: CHAT_CONTEXT_TYPE.RFQ,
      id: conversationRow.last_context_id,
      title: rfq?.title || rfq?.rfq_number || null,
    };
  }
  if (conversationRow.last_context_type === CHAT_CONTEXT_TYPE.ENQUIRY) {
    const inquiry = await inquiryModel.findById(conversationRow.last_context_id);
    return {
      type: CHAT_CONTEXT_TYPE.ENQUIRY,
      id: conversationRow.last_context_id,
      title: inquiry?.product?.name || inquiry?.inquiry_number || null,
    };
  }
  return {
    type: conversationRow.last_context_type,
    id: conversationRow.last_context_id,
    title: null,
  };
};

/** Load conversation with presence for detail views. */
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
    context: await resolveContextPayload(row),
  };
};

/**
 * Chat screen payload: conversation + latest context + messages.
 * Optionally marks messages as read when mark_read !== false.
 */
const getConversationScreen = async (conversationId, userId, filters = {}) => {
  const conversation = await getConversationDetail(conversationId, userId);
  const markRead = filters.mark_read !== false && filters.mark_read !== 'false';

  let readResult = null;
  if (markRead) {
    readResult = await markConversationRead(conversationId, userId, null, { silent: false });
  }

  const messages = await chatMessageModel.listMessages(conversationId, filters);
  const fresh = markRead ? await getConversationDetail(conversationId, userId) : conversation;

  return {
    conversation: fresh,
    context: fresh.context || conversation.context,
    messages,
    ...(readResult?.message_ids
      ? { marked_read_message_ids: readResult.message_ids }
      : {}),
  };
};

// ==========================================
// Conversation operations
// ==========================================

/**
 * Start or continue RFQ chat on the shared buyer↔seller conversation.
 */
const startConversation = async ({ rfqId, sellerId, userId }) => {
  const rfq = await rfqModel.findRfqById(rfqId, { raw: true });
  if (!rfq) throw new AppError('RFQ not found', 404);

  const resolvedSellerId = sellerId || userId;
  if (!resolvedSellerId) throw new AppError('seller_id is required', 400);

  await assertCanStartRfqChat(rfq, userId, resolvedSellerId);

  const conversation = await chatConversationModel.findOrCreateBuyerSellerConversation({
    buyerId: rfq.buyer_id,
    sellerId: resolvedSellerId,
    initiatedBy: userId,
    lastContextType: CHAT_CONTEXT_TYPE.RFQ,
    lastContextId: rfq.id,
    rfqId: rfq.id,
  });

  return getConversationDetail(conversation.id, userId);
};

/**
 * Start or continue inquiry chat on the shared buyer↔seller conversation.
 */
const startInquiryConversation = async ({ inquiryId, userId }) => {
  const inquiry = await inquiryModel.findById(inquiryId, { raw: true });
  if (!inquiry) throw new AppError('Inquiry not found', 404);

  if (userId !== inquiry.buyer_id && userId !== inquiry.seller_id) {
    throw new AppError('Forbidden: Access denied', 403);
  }

  const conversation = await chatConversationModel.findOrCreateBuyerSellerConversation({
    buyerId: inquiry.buyer_id,
    sellerId: inquiry.seller_id,
    initiatedBy: userId,
    lastContextType: inquiry.product_id ? CHAT_CONTEXT_TYPE.PRODUCT : CHAT_CONTEXT_TYPE.ENQUIRY,
    lastContextId: inquiry.product_id || inquiry.id,
    inquiryId: inquiry.id,
  });

  return getConversationDetail(conversation.id, userId);
};

const listMyConversations = async (userId, filters = {}) =>
  chatConversationModel.listConversationsForUser(userId, filters);

const listRfqConversations = async (rfqId, userId, filters = {}) => {
  const rfq = await rfqModel.findRfqById(rfqId, { raw: true });
  if (!rfq) throw new AppError('RFQ not found', 404);
  if (rfq.buyer_id !== userId) throw new AppError('Forbidden: Access denied', 403);
  return chatConversationModel.listConversationsByRfq(rfqId, userId, filters);
};

const listInquiryConversations = async (inquiryId, userId, filters = {}) => {
  const inquiry = await inquiryModel.findById(inquiryId, { raw: true });
  if (!inquiry) throw new AppError('Inquiry not found', 404);
  if (inquiry.buyer_id !== userId && inquiry.seller_id !== userId) {
    throw new AppError('Forbidden: Access denied', 403);
  }
  // Shared pair thread for this inquiry's buyer/seller
  const conversation = await chatConversationModel.findByBuyerAndSeller(
    inquiry.buyer_id,
    inquiry.seller_id,
  );
  if (!conversation) {
    return { results: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } };
  }
  const detail = chatConversationModel.formatInboxRow(
    await chatConversationModel.findById(conversation.id),
    userId,
  );
  return {
    results: [detail],
    pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
  };
};

const getUnreadSummary = async (userId) => chatConversationModel.getTotalUnreadCount(userId);

/**
 * Total unread + conversations (unread_count, last_message_at) sorted by last_message_at DESC.
 * Used by REST unread-summary companion and Socket.IO `unread_summary`.
 */
const getUnreadInbox = async (userId) => chatConversationModel.getUnreadInboxForUser(userId);

/**
 * Push unread inbox snapshot to a user's personal socket room (fire-and-forget safe).
 * @param {number|number[]} userIds
 */
const pushUnreadSummary = (userIds) => {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  ids.filter(Boolean).forEach((uid) => {
    getUnreadInbox(uid)
      .then((data) => {
        chatSocketEmitter.emitToUser(uid, CHAT_SOCKET_EVENT.UNREAD_SUMMARY, data);
      })
      .catch((err) => {
        logger.error('[Chat] Failed to push unread_summary', {
          userId: uid,
          error: err.message,
        });
      });
  });
};

// ==========================================
// Message validation & persistence
// ==========================================

const validateMessagePayload = async (conversation, data) => {
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
      contextUpdate: {
        last_context_type: CHAT_CONTEXT_TYPE.PRODUCT,
        last_context_id: product.id,
      },
    };
  }

  if (messageType === CHAT_MESSAGE_TYPE.QUOTATION) {
    const quotationId = data.quotation_id || data.metadata?.quotation_id;
    if (!quotationId) throw new AppError('quotation_id is required for QUOTATION messages', 400);

    // Prefer inquiry quotation when both pair participants match
    const inquiryQuote = await inquiryQuotationModel.findById(quotationId, { raw: true });
    if (inquiryQuote && Number(inquiryQuote.seller_id) === Number(conversation.seller_id)) {
      const inquiry = await inquiryModel.findById(inquiryQuote.inquiry_id, { raw: true });
      if (
        inquiry &&
        Number(inquiry.buyer_id) === Number(conversation.buyer_id) &&
        Number(inquiry.seller_id) === Number(conversation.seller_id)
      ) {
        return {
          content: data.content || `Quotation ${inquiryQuote.quotation_number}`,
          metadata: {
            quotation_id: inquiryQuote.id,
            quotation_number: inquiryQuote.quotation_number,
            price: inquiryQuote.price,
            total_amount: inquiryQuote.total_amount,
            currency: 'INR',
            status: inquiryQuote.status,
            context_type: 'enquiry',
            inquiry_id: inquiry.id,
          },
          contextUpdate: inquiry.product_id
            ? {
                last_context_type: CHAT_CONTEXT_TYPE.PRODUCT,
                last_context_id: inquiry.product_id,
                inquiry_id: inquiry.id,
              }
            : {
                last_context_type: CHAT_CONTEXT_TYPE.ENQUIRY,
                last_context_id: inquiry.id,
                inquiry_id: inquiry.id,
              },
        };
      }
    }

    const quotation = await quotationModel.findById(quotationId, { raw: true });
    if (!quotation) throw new AppError('Quotation not found', 404);
    if (Number(quotation.seller_id) !== Number(conversation.seller_id)) {
      throw new AppError('Quotation does not belong to this conversation', 403);
    }
    const rfq = await rfqModel.findRfqById(quotation.rfq_id, { raw: true });
    if (!rfq || Number(rfq.buyer_id) !== Number(conversation.buyer_id)) {
      throw new AppError('Quotation does not belong to this conversation', 400);
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
        context_type: 'rfq',
        rfq_id: quotation.rfq_id,
      },
      contextUpdate: {
        last_context_type: CHAT_CONTEXT_TYPE.RFQ,
        last_context_id: quotation.rfq_id,
        rfq_id: quotation.rfq_id,
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
 * Insert message, update conversation preview / context / unread.
 */
const persistMessage = async (conversation, senderId, messageData, trx = null, options = {}) => {
  const message = await chatMessageModel.createMessage(
    {
      conversation_id: conversation.id,
      sender_id: senderId,
      message_type: messageData.message_type,
      content: messageData.content,
      metadata: messageData.metadata,
      reply_to_message_id: messageData.reply_to_message_id || null,
      is_read: false,
      read_at: null,
    },
    trx,
  );

  const preview = chatMessageModel.buildPreview(
    message.message_type,
    message.content,
    chatMessageModel.parseMetadata(message.metadata),
  );

  const conversationUpdate = {
    last_message_id: message.id,
    last_message_at: message.created_at,
    last_message_preview: preview,
    last_message_sender_id: senderId || null,
  };

  if (options.contextUpdate) {
    Object.assign(conversationUpdate, options.contextUpdate);
  }

  await chatConversationModel.updateConversation(conversation.id, conversationUpdate, trx);

  if (senderId) {
    const role = getUserRoleInConversation(conversation, senderId);
    const recipientRole = role === 'buyer' ? 'seller' : 'buyer';
    await chatConversationModel.incrementUnreadForRecipient(conversation.id, recipientRole, trx);
  } else if (!options.skipSystemUnread) {
    await chatConversationModel.incrementUnreadForRecipient(conversation.id, 'buyer', trx);
    await chatConversationModel.incrementUnreadForRecipient(conversation.id, 'seller', trx);
  }

  return message;
};

// ==========================================
// Message operations (REST)
// ==========================================

const sendMessage = async (conversationId, userId, data) => {
  const conversation = await chatConversationModel.findById(conversationId);
  if (!conversation) throw new AppError('Conversation not found', 404);
  assertConversationParticipant(conversation, userId);

  const payload = await validateMessagePayload(conversation, data);

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
      { contextUpdate: payload.contextUpdate },
    ),
  );

  const message = await chatMessageModel.findById(rawMessage.id);
  const freshConversation = await chatConversationModel.findById(conversationId);

  chatSocketEmitter.emitNewMessage(freshConversation || conversation, message);
  chatSocketEmitter.emitConversationUpdated(conversation.id, userId);
  pushUnreadSummary([
    (freshConversation || conversation).buyer_id,
    (freshConversation || conversation).seller_id,
  ]);

  return message;
};

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
  const freshConversation = await chatConversationModel.findById(conversationId);
  chatSocketEmitter.emitNewMessage(freshConversation || conversation, message);
  chatSocketEmitter.emitConversationUpdated(conversation.id, userId);
  pushUnreadSummary([
    (freshConversation || conversation).buyer_id,
    (freshConversation || conversation).seller_id,
  ]);
  return message;
};

const listMessages = async (conversationId, userId, filters = {}) => {
  const conversation = await chatConversationModel.findById(conversationId);
  if (!conversation) throw new AppError('Conversation not found', 404);
  assertConversationParticipant(conversation, userId);
  return chatMessageModel.listMessages(conversationId, filters);
};

/**
 * Mark messages as read for the viewer; emit read status to the sender.
 */
const markConversationRead = async (
  conversationId,
  userId,
  lastReadMessageId = null,
  { silent = false } = {},
) => {
  const conversation = await chatConversationModel.findById(conversationId);
  if (!conversation) throw new AppError('Conversation not found', 404);
  const role = assertConversationParticipant(conversation, userId);

  const messageIds = await chatMessageModel.markMessagesReadForViewer(
    conversationId,
    userId,
    lastReadMessageId,
  );

  const resolvedMessageId =
    lastReadMessageId ||
    (messageIds.length ? messageIds[messageIds.length - 1] : null) ||
    (await chatMessageModel.getLatestMessageId(conversationId));

  if (resolvedMessageId) {
    await chatConversationModel.resetUnreadForUser(conversationId, role, resolvedMessageId);
  }

  const payload = {
    reader_id: userId,
    role,
    last_read_message_id: resolvedMessageId,
    message_ids: messageIds,
  };

  if (!silent) {
    chatSocketEmitter.emitMessagesRead(conversation, payload);
    pushUnreadSummary(userId);
  }

  const detail = await getConversationDetail(conversationId, userId);
  return { ...detail, message_ids: messageIds };
};

// ==========================================
// RFQ / inquiry workflow system messages
// ==========================================

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

    const conversation = await chatConversationModel.findOrCreateBuyerSellerConversation({
      buyerId: rfq.buyer_id,
      sellerId,
      initiatedBy: actorId || rfq.buyer_id,
      lastContextType: CHAT_CONTEXT_TYPE.RFQ,
      lastContextId: rfqId,
      rfqId,
    });

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
        {
          contextUpdate: {
            last_context_type: CHAT_CONTEXT_TYPE.RFQ,
            last_context_id: rfqId,
            rfq_id: rfqId,
          },
        },
      ),
    );

    const message = await chatMessageModel.findById(rawMessage.id);
    chatSocketEmitter.emitNewMessage(conversation, message);
    chatSocketEmitter.emitConversationUpdated(conversation.id, actorId);
    pushUnreadSummary([conversation.buyer_id, conversation.seller_id]);
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

/**
 * Seed PRODUCT + TEXT (+ SYSTEM) when an inquiry is created (runs inside caller's trx).
 * Uses / updates the shared buyer↔seller conversation.
 */
const persistInquirySeedMessages = async ({
  conversation,
  buyerId,
  product,
  message,
  inquiryId,
  trx,
}) => {
  await persistMessage(
    conversation,
    buyerId,
    {
      message_type: CHAT_MESSAGE_TYPE.PRODUCT,
      content: `Product: ${product.name}`,
      metadata: {
        product_id: product.id,
        product_name: product.name,
        product_slug: product.slug,
        thumbnail: product.thumbnail,
        price: product.price,
        currency: product.currency,
        inquiry_id: inquiryId || conversation.inquiry_id || null,
      },
    },
    trx,
    {
      contextUpdate: {
        last_context_type: CHAT_CONTEXT_TYPE.PRODUCT,
        last_context_id: product.id,
        inquiry_id: inquiryId || conversation.inquiry_id || null,
      },
    },
  );

  await persistMessage(
    conversation,
    buyerId,
    {
      message_type: CHAT_MESSAGE_TYPE.TEXT,
      content: message,
      metadata: inquiryId ? { inquiry_id: inquiryId } : null,
    },
    trx,
  );

  await persistMessage(
    conversation,
    null,
    {
      message_type: CHAT_MESSAGE_TYPE.SYSTEM,
      content: CHAT_SYSTEM_EVENT_LABELS[CHAT_SYSTEM_EVENT.INQUIRY_CREATED],
      metadata: {
        event_type: CHAT_SYSTEM_EVENT.INQUIRY_CREATED,
        inquiry_id: inquiryId || conversation.inquiry_id,
        product_id: product.id,
      },
    },
    trx,
    { skipSystemUnread: true },
  );
};

const recordInquirySystemEvent = async ({
  inquiryId,
  eventType,
  quotationId = null,
  actorId = null,
  metadata = {},
}) => {
  try {
    if (!inquiryId || !eventType) return null;

    const inquiry = await inquiryModel.findById(inquiryId, { raw: true });
    if (!inquiry) return null;

    const conversation = await chatConversationModel.findOrCreateBuyerSellerConversation({
      buyerId: inquiry.buyer_id,
      sellerId: inquiry.seller_id,
      initiatedBy: actorId || inquiry.buyer_id,
      lastContextType: inquiry.product_id ? CHAT_CONTEXT_TYPE.PRODUCT : CHAT_CONTEXT_TYPE.ENQUIRY,
      lastContextId: inquiry.product_id || inquiry.id,
      inquiryId: inquiry.id,
    });

    const label = CHAT_SYSTEM_EVENT_LABELS[eventType] || eventType;
    let quotationMeta = {};

    if (quotationId) {
      const quotation = await inquiryQuotationModel.findById(quotationId, { raw: true });
      if (quotation) {
        quotationMeta = {
          quotation_id: quotation.id,
          quotation_number: quotation.quotation_number,
          price: quotation.price,
          total_amount: quotation.total_amount,
          status: quotation.status,
          context_type: 'enquiry',
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
            inquiry_id: inquiryId,
            actor_id: actorId,
            ...quotationMeta,
            ...metadata,
          },
        },
        trx,
        {
          contextUpdate: {
            last_context_type: inquiry.product_id
              ? CHAT_CONTEXT_TYPE.PRODUCT
              : CHAT_CONTEXT_TYPE.ENQUIRY,
            last_context_id: inquiry.product_id || inquiry.id,
            inquiry_id: inquiry.id,
          },
        },
      ),
    );

    const message = await chatMessageModel.findById(rawMessage.id);
    chatSocketEmitter.emitNewMessage(conversation, message);
    chatSocketEmitter.emitConversationUpdated(conversation.id, actorId);
    pushUnreadSummary([conversation.buyer_id, conversation.seller_id]);
    return message;
  } catch (error) {
    logger.error('[Chat] Failed to record inquiry system event', {
      inquiryId,
      eventType,
      error: error.message,
    });
    return null;
  }
};

const assertUserCanJoinConversation = async (conversationId, userId) => {
  const conversation = await chatConversationModel.findById(conversationId);
  if (!conversation) throw new AppError('Conversation not found', 404);
  assertConversationParticipant(conversation, userId);
  return conversation;
};

const getParticipantUserIds = async (conversationId) => {
  const conversation = await chatConversationModel.findById(conversationId);
  if (!conversation) return [];
  return [conversation.buyer_id, conversation.seller_id];
};

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

module.exports = {
  getUserRoleInConversation,
  getConversationDetail,
  getConversationScreen,
  startConversation,
  startInquiryConversation,
  listMyConversations,
  listRfqConversations,
  listInquiryConversations,
  getUnreadSummary,
  getUnreadInbox,
  pushUnreadSummary,
  sendMessage,
  sendMediaMessage,
  listMessages,
  markConversationRead,
  recordSystemEvent,
  recordInquirySystemEvent,
  persistInquirySeedMessages,
  recordRfqEventForSellers,
  getParticipantUserIds,
  assertUserCanJoinConversation,
  persistMessage,
  CHAT_SYSTEM_EVENT,
  CHAT_CONTEXT_TYPE,
};
