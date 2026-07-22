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

/** Product card for chat context / last_context (parity with PRODUCT message metadata). */
const buildProductContext = (product, fallbackId) => {
  if (!product) {
    return {
      type: CHAT_CONTEXT_TYPE.PRODUCT,
      id: fallbackId,
      title: null,
      slug: null,
      thumbnail: null,
      price: null,
      currency: null,
      unit: null,
      moq: null,
    };
  }

  return {
    type: CHAT_CONTEXT_TYPE.PRODUCT,
    id: product.id || fallbackId,
    title: product.name || null,
    slug: product.slug || null,
    thumbnail: product.thumbnail || null,
    price: product.price ?? null,
    currency: product.currency || null,
    unit: product.unit || null,
    moq: product.moq ?? null,
  };
};

/** RFQ card for chat context / last_context — same purpose as product details on inquiry chats. */
const buildRfqContext = (rfq, fallbackId) => {
  if (!rfq) {
    return {
      type: CHAT_CONTEXT_TYPE.RFQ,
      id: fallbackId,
      title: null,
      rfq_number: null,
      description: null,
      quantity: null,
      unit: null,
      expected_price: null,
      currency: null,
      status: null,
      quotation_deadline: null,
      required_before: null,
      city: null,
      category_id: null,
      category_name: null,
      subcategory_id: null,
      subcategory_name: null,
      product: null,
    };
  }

  const expectedPrice =
    rfq.expected_price !== undefined && rfq.expected_price !== null
      ? parseFloat(rfq.expected_price)
      : rfq.budget !== undefined && rfq.budget !== null
        ? parseFloat(rfq.budget)
        : null;

  return {
    type: CHAT_CONTEXT_TYPE.RFQ,
    id: rfq.id || fallbackId,
    title: rfq.title || rfq.rfq_number || null,
    rfq_number: rfq.rfq_number || null,
    description: rfq.description || null,
    quantity: rfq.quantity != null ? parseInt(rfq.quantity, 10) : null,
    unit: rfq.unit || null,
    expected_price: expectedPrice,
    currency: rfq.currency || 'INR',
    status: rfq.status || null,
    quotation_deadline: rfq.quotation_deadline || null,
    required_before: rfq.required_before || null,
    city: rfq.city || null,
    category_id: rfq.category_id ?? null,
    category_name: rfq.category_name || rfq.category || null,
    subcategory_id: rfq.subcategory_id ?? null,
    subcategory_name: rfq.subcategory_name || null,
    // Preview image for RFQ card (from linked product when present — type remains "rfq")
    thumbnail: rfq.product?.thumbnail || null,
    product: rfq.product
      ? {
          id: rfq.product.id,
          name: rfq.product.name || null,
          slug: rfq.product.slug || null,
          thumbnail: rfq.product.thumbnail || null,
          price: rfq.product.price ?? null,
          currency: rfq.product.currency || null,
          unit: rfq.product.unit || null,
          moq: rfq.product.moq ?? null,
        }
      : null,
  };
};

/** Flattened + nested RFQ card for message.metadata (same shape as last_context for RFQ). */
const buildRfqMessageMeta = (rfq) => {
  const card = buildRfqContext(rfq, rfq?.id);
  if (!card?.id) return { context_type: CHAT_CONTEXT_TYPE.RFQ };
  return {
    context_type: CHAT_CONTEXT_TYPE.RFQ,
    rfq_id: card.id,
    rfq_number: card.rfq_number,
    rfq_title: card.title,
    title: card.title,
    description: card.description,
    quantity: card.quantity,
    unit: card.unit,
    expected_price: card.expected_price,
    currency: card.currency,
    status: card.status,
    quotation_deadline: card.quotation_deadline,
    required_before: card.required_before,
    city: card.city,
    category_id: card.category_id,
    category_name: card.category_name,
    subcategory_id: card.subcategory_id,
    subcategory_name: card.subcategory_name,
    rfq: card,
  };
};

/** Flattened + nested quotation card for message.metadata (RFQ or inquiry quote). */
const buildQuotationMessageMeta = (quotation, { contextType = CHAT_CONTEXT_TYPE.RFQ } = {}) => {
  if (!quotation) return {};
  const card = {
    id: quotation.id,
    quotation_number: quotation.quotation_number || null,
    price: quotation.price != null ? parseFloat(quotation.price) : null,
    quantity: quotation.quantity != null ? parseInt(quotation.quantity, 10) : null,
    unit: quotation.unit || null,
    gst_percentage:
      quotation.gst_percentage != null ? parseFloat(quotation.gst_percentage) : null,
    gst_amount: quotation.gst_amount != null ? parseFloat(quotation.gst_amount) : null,
    transportation_charge:
      quotation.transportation_charge != null
        ? parseFloat(quotation.transportation_charge)
        : null,
    total_amount: quotation.total_amount != null ? parseFloat(quotation.total_amount) : null,
    delivery_days: quotation.delivery_days ?? null,
    payment_terms: quotation.payment_terms || null,
    validity_days: quotation.validity_days ?? null,
    remarks: quotation.remarks || null,
    status: quotation.status || null,
    currency: quotation.currency || 'INR',
    rfq_id: quotation.rfq_id || null,
    inquiry_id: quotation.inquiry_id || null,
    seller_id: quotation.seller_id || null,
  };

  return {
    context_type: contextType,
    quotation_id: card.id,
    quotation_number: card.quotation_number,
    price: card.price,
    quantity: card.quantity,
    unit: card.unit,
    gst_percentage: card.gst_percentage,
    total_amount: card.total_amount,
    delivery_days: card.delivery_days,
    currency: card.currency,
    status: card.status,
    quotation: card,
  };
};

/** Product fields for inquiry message.metadata (parity with PRODUCT card). */
const buildProductMessageMeta = (product) => {
  if (!product) return {};
  return {
    product_id: product.id,
    product_name: product.name || null,
    product_slug: product.slug || null,
    thumbnail: product.thumbnail || null,
    price: product.price ?? null,
    currency: product.currency || null,
    unit: product.unit || null,
    moq: product.moq ?? null,
    product: buildProductContext(product, product.id),
  };
};

/**
 * Resolve latest discussion context for chat screen / inbox.
 * Product & RFQ include rich card fields so the UI can explain what the thread is about.
 */
const resolveContextPayload = async (conversationRow) => {
  if (!conversationRow?.last_context_type || !conversationRow?.last_context_id) {
    return chatConversationModel.formatLastContext(conversationRow);
  }

  if (conversationRow.last_context_type === CHAT_CONTEXT_TYPE.PRODUCT) {
    const product = await productModel.findProductById(conversationRow.last_context_id);
    if (product) return buildProductContext(product, conversationRow.last_context_id);
    return chatConversationModel.formatLastContext(conversationRow);
  }

  if (conversationRow.last_context_type === CHAT_CONTEXT_TYPE.RFQ) {
    const rfq = await rfqModel.findRfqById(conversationRow.last_context_id);
    if (rfq) return buildRfqContext(rfq, conversationRow.last_context_id);
    return chatConversationModel.formatLastContext(conversationRow);
  }

  if (conversationRow.last_context_type === CHAT_CONTEXT_TYPE.ENQUIRY) {
    const inquiry = await inquiryModel.findById(conversationRow.last_context_id);
    if (!inquiry) return chatConversationModel.formatLastContext(conversationRow);

    const product = inquiry.product || null;
    return {
      type: CHAT_CONTEXT_TYPE.ENQUIRY,
      id: conversationRow.last_context_id,
      title: product?.name || inquiry.inquiry_number || null,
      inquiry_number: inquiry.inquiry_number || null,
      status: inquiry.status || null,
      quantity: inquiry.quantity ?? null,
      unit: inquiry.unit || null,
      thumbnail: product?.thumbnail || null,
      price: product?.price ?? null,
      currency: product?.currency || inquiry.currency || null,
      product: product
        ? {
            id: product.id,
            name: product.name || null,
            slug: product.slug || null,
            thumbnail: product.thumbnail || null,
            price: product.price ?? null,
            currency: product.currency || null,
            unit: product.unit || null,
            moq: product.moq ?? null,
          }
        : null,
    };
  }

  return chatConversationModel.formatLastContext(conversationRow) || {
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
  // Same rich card for both `last_context` and `context` so FE never sees stale product while type is RFQ
  const context = await resolveContextPayload(row);
  return {
    ...formatted,
    last_context: context || formatted.last_context,
    buyer: {
      ...formatted.buyer,
      presence: presenceMap[row.buyer_id] || { status: 'offline', last_seen_at: null },
    },
    seller: {
      ...formatted.seller,
      presence: presenceMap[row.seller_id] || { status: 'offline', last_seen_at: null },
    },
    context,
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
 * Seeds an RFQ card message (metadata.rfq) so the timeline shows what the chat is about —
 * same pattern as PRODUCT seed on inquiry create.
 */
const startConversation = async ({ rfqId, sellerId, userId }) => {
  const rfqRaw = await rfqModel.findRfqById(rfqId, { raw: true });
  if (!rfqRaw) throw new AppError('RFQ not found', 404);

  const resolvedSellerId = sellerId || userId;
  if (!resolvedSellerId) throw new AppError('seller_id is required', 400);

  await assertCanStartRfqChat(rfqRaw, userId, resolvedSellerId);

  const conversation = await chatConversationModel.findOrCreateBuyerSellerConversation({
    buyerId: rfqRaw.buyer_id,
    sellerId: resolvedSellerId,
    initiatedBy: userId,
    lastContextType: CHAT_CONTEXT_TYPE.RFQ,
    lastContextId: rfqRaw.id,
    rfqId: rfqRaw.id,
  });

  const rfq = await rfqModel.findRfqById(rfqId);
  await seedRfqContextMessage({
    conversation,
    rfq,
    actorId: userId,
    sellerId: resolvedSellerId,
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
    const inquiryQuote = await inquiryQuotationModel.findById(quotationId);
    if (inquiryQuote && Number(inquiryQuote.seller_id) === Number(conversation.seller_id)) {
      const inquiry = await inquiryModel.findById(inquiryQuote.inquiry_id, { raw: true });
      if (
        inquiry &&
        Number(inquiry.buyer_id) === Number(conversation.buyer_id) &&
        Number(inquiry.seller_id) === Number(conversation.seller_id)
      ) {
        const product = inquiry.product_id
          ? await productModel.findProductById(inquiry.product_id)
          : null;
        return {
          content: data.content || `Quotation ${inquiryQuote.quotation_number}`,
          metadata: {
            ...buildProductMessageMeta(product),
            ...buildQuotationMessageMeta(inquiryQuote, {
              contextType: CHAT_CONTEXT_TYPE.ENQUIRY,
            }),
            inquiry_id: inquiry.id,
            inquiry_number: inquiry.inquiry_number || null,
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

    const quotation = await quotationModel.findById(quotationId);
    if (!quotation) throw new AppError('Quotation not found', 404);
    if (Number(quotation.seller_id) !== Number(conversation.seller_id)) {
      throw new AppError('Quotation does not belong to this conversation', 403);
    }
    const rfq = await rfqModel.findRfqById(quotation.rfq_id);
    if (!rfq || Number(rfq.buyer_id) !== Number(conversation.buyer_id)) {
      throw new AppError('Quotation does not belong to this conversation', 400);
    }
    return {
      content: data.content || `Quotation ${quotation.quotation_number}`,
      metadata: {
        ...buildRfqMessageMeta(rfq),
        ...buildQuotationMessageMeta(quotation, { contextType: CHAT_CONTEXT_TYPE.RFQ }),
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

/** Other participant in a buyer↔seller thread (excludes the actor). */
const otherParticipantId = (conversation, actorId) => {
  const actor = Number(actorId);
  const buyerId = Number(conversation.buyer_id);
  const sellerId = Number(conversation.seller_id);
  if (actor && actor === buyerId) return sellerId || null;
  if (actor && actor === sellerId) return buyerId || null;
  return null;
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
  // Keep in-memory conversation in sync so socket payloads / callers see latest RFQ/product context
  Object.assign(conversation, conversationUpdate);

  // skipUnread: workflow seeds that already bumped unread via another message
  if (!options.skipUnread) {
    if (senderId) {
      const role = getUserRoleInConversation(conversation, senderId);
      const recipientRole = role === 'buyer' ? 'seller' : 'buyer';
      await chatConversationModel.incrementUnreadForRecipient(conversation.id, recipientRole, trx);
    } else if (!options.skipSystemUnread) {
      await chatConversationModel.incrementUnreadForRecipient(conversation.id, 'buyer', trx);
      await chatConversationModel.incrementUnreadForRecipient(conversation.id, 'seller', trx);
    }
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

    const rfqRaw = await rfqModel.findRfqById(rfqId, { raw: true });
    if (!rfqRaw) return null;

    // Same as inquiry create: ensure shared thread + RFQ card exist before quote events
    const conversation = await ensureRfqChatWithSeller({
      rfqId,
      sellerId,
      actorId: actorId || rfqRaw.buyer_id,
    });
    if (!conversation) return null;

    const rfq = await rfqModel.findRfqById(rfqId);
    const label = CHAT_SYSTEM_EVENT_LABELS[eventType] || eventType;

    let quotation = null;
    if (quotationId) {
      quotation = await quotationModel.findById(quotationId);
    }

    const baseMeta = {
      event_type: eventType,
      actor_id: actorId,
      ...buildRfqMessageMeta(rfq),
      ...buildQuotationMessageMeta(quotation, { contextType: CHAT_CONTEXT_TYPE.RFQ }),
      ...metadata,
    };

    const quoteCardEvents = [
      CHAT_SYSTEM_EVENT.QUOTATION_SUBMITTED,
      CHAT_SYSTEM_EVENT.QUOTATION_UPDATED,
      CHAT_SYSTEM_EVENT.QUOTATION_REVISED,
      CHAT_SYSTEM_EVENT.QUOTATION_ACCEPTED,
      CHAT_SYSTEM_EVENT.QUOTATION_REJECTED,
      CHAT_SYSTEM_EVENT.QUOTATION_WITHDRAWN,
    ];

    const messagesToEmit = [];

    await db.transaction(async (trx) => {
      // SYSTEM timeline event — store actor as sender_id for client display
      const systemSenderId = actorId || sellerId || null;
      const systemRaw = await persistMessage(
        conversation,
        systemSenderId,
        {
          message_type: CHAT_MESSAGE_TYPE.SYSTEM,
          content: label,
          metadata: baseMeta,
        },
        trx,
        {
          // Unread for the other party is applied below when we have an actor;
          // if sender is set, persistMessage would also bump — use skipUnread + manual once.
          skipUnread: true,
          contextUpdate: {
            last_context_type: CHAT_CONTEXT_TYPE.RFQ,
            last_context_id: rfqId,
            rfq_id: rfqId,
          },
        },
      );
      messagesToEmit.push(systemRaw.id);

      const otherId = otherParticipantId(conversation, systemSenderId);
      if (otherId) {
        const otherRole = getUserRoleInConversation(conversation, otherId);
        await chatConversationModel.incrementUnreadForRecipient(conversation.id, otherRole, trx);
      }

      // Quotation card bubble (same role as inquiry quote card) when a quote is involved
      if (quotation && quoteCardEvents.includes(eventType)) {
        const quoteRaw = await persistMessage(
          conversation,
          actorId || sellerId,
          {
            message_type: CHAT_MESSAGE_TYPE.QUOTATION,
            content: `Quotation ${quotation.quotation_number}`,
            metadata: baseMeta,
          },
          trx,
          {
            contextUpdate: {
              last_context_type: CHAT_CONTEXT_TYPE.RFQ,
              last_context_id: rfqId,
              rfq_id: rfqId,
            },
          },
        );
        messagesToEmit.push(quoteRaw.id);
      }
    });

    let lastMessage = null;
    const actorExclude = actorId ? [actorId] : [];
    for (const mid of messagesToEmit) {
      lastMessage = await chatMessageModel.findById(mid);
      chatSocketEmitter.emitNewMessage(conversation, lastMessage, {
        skipPush: true,
        excludeUserIds: actorExclude,
      });
    }
    const lastContext = await resolveContextPayload({
      last_context_type: CHAT_CONTEXT_TYPE.RFQ,
      last_context_id: rfqId,
    });
    chatSocketEmitter.emitConversationUpdated(conversation.id, actorId, {
      last_context_type: CHAT_CONTEXT_TYPE.RFQ,
      last_context_id: rfqId,
      last_context: lastContext,
      rfq_id: rfqId,
    });
    const notifyIds = otherParticipantId(conversation, actorId);
    pushUnreadSummary(notifyIds ? [notifyIds] : [conversation.buyer_id, conversation.seller_id]);
    return lastMessage;
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
 * Seed RFQ card into the shared buyer↔seller thread (parity with PRODUCT on inquiry create).
 * Avoids duplicate RFQ_SHARED for the same rfq_id in this conversation.
 *
 * @param {Object} options
 * @param {boolean} [options.includeQuotation=true] - Attach existing seller quote bubble (for open-chat).
 *        Pass false when calling before recordSystemEvent so quotation is not duplicated.
 * @param {boolean} [options.includeDescriptionText=true] - Buyer TEXT with RFQ description (like inquiry message).
 */
const seedRfqContextMessage = async ({
  conversation,
  rfq,
  actorId,
  sellerId,
  includeQuotation = true,
  includeDescriptionText = true,
}) => {
  if (!conversation?.id || !rfq?.id) return null;

  const existing = await db('chat_messages')
    .where({ conversation_id: conversation.id, message_type: CHAT_MESSAGE_TYPE.SYSTEM })
    .whereNull('deleted_at')
    .whereRaw("JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.event_type')) = ?", [
      CHAT_SYSTEM_EVENT.RFQ_SHARED,
    ])
    .whereRaw("JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.rfq_id')) = ?", [String(rfq.id)])
    .first();

  if (existing) {
    // Still refresh last_context to this RFQ
    await chatConversationModel.updateConversation(conversation.id, {
      last_context_type: CHAT_CONTEXT_TYPE.RFQ,
      last_context_id: rfq.id,
      rfq_id: rfq.id,
    });
    Object.assign(conversation, {
      last_context_type: CHAT_CONTEXT_TYPE.RFQ,
      last_context_id: rfq.id,
      rfq_id: rfq.id,
    });
    const lastContext = await resolveContextPayload({
      last_context_type: CHAT_CONTEXT_TYPE.RFQ,
      last_context_id: rfq.id,
    });
    chatSocketEmitter.emitConversationUpdated(conversation.id, actorId, {
      last_context_type: CHAT_CONTEXT_TYPE.RFQ,
      last_context_id: rfq.id,
      last_context: lastContext,
      rfq_id: rfq.id,
    });
    return null;
  }

  // Attach seller's latest quotation when reopening chat after a quote (not on quote-submit path)
  let quotation = null;
  if (includeQuotation && sellerId) {
    const quoteRow = await db('quotations')
      .where({ rfq_id: rfq.id, seller_id: sellerId })
      .orderBy('updated_at', 'desc')
      .first();
    if (quoteRow) {
      quotation = await quotationModel.findById(quoteRow.id);
    }
  }

  const rfqMeta = {
    event_type: CHAT_SYSTEM_EVENT.RFQ_SHARED,
    actor_id: actorId,
    skip_push: true,
    ...buildRfqMessageMeta(rfq),
  };

  const quoteMeta = includeQuotation
    ? {
        ...rfqMeta,
        ...buildQuotationMessageMeta(quotation, { contextType: CHAT_CONTEXT_TYPE.RFQ }),
        skip_push: true,
      }
    : rfqMeta;

  const raw = await db.transaction(async (trx) => {
    const systemSenderId = actorId || conversation.buyer_id || null;
    const systemRaw = await persistMessage(
      conversation,
      systemSenderId,
      {
        message_type: CHAT_MESSAGE_TYPE.SYSTEM,
        content: `RFQ: ${rfq.title || rfq.rfq_number}`,
        metadata: quoteMeta,
      },
      trx,
      {
        contextUpdate: {
          last_context_type: CHAT_CONTEXT_TYPE.RFQ,
          last_context_id: rfq.id,
          rfq_id: rfq.id,
        },
        // TEXT seed below bumps seller unread; don't double-count on SYSTEM card
        skipUnread: true,
      },
    );

    // Buyer intent text — same role as inquiry TEXT seed
    const description = (rfq.description || rfq.title || '').trim();
    if (includeDescriptionText && description) {
      await persistMessage(
        conversation,
        conversation.buyer_id || actorId,
        {
          message_type: CHAT_MESSAGE_TYPE.TEXT,
          content: description.length > 2000 ? `${description.slice(0, 1997)}...` : description,
          metadata: {
            rfq_id: rfq.id,
            rfq_number: rfq.rfq_number || null,
            context_type: CHAT_CONTEXT_TYPE.RFQ,
            skip_push: true,
            ...buildRfqMessageMeta(rfq),
          },
        },
        trx,
        {
          contextUpdate: {
            last_context_type: CHAT_CONTEXT_TYPE.RFQ,
            last_context_id: rfq.id,
            rfq_id: rfq.id,
          },
          skipSystemUnread: true,
        },
      );
    }

    if (includeQuotation && quotation) {
      await persistMessage(
        conversation,
        sellerId || actorId,
        {
          message_type: CHAT_MESSAGE_TYPE.QUOTATION,
          content: `Quotation ${quotation.quotation_number}`,
          metadata: quoteMeta,
        },
        trx,
        {
          contextUpdate: {
            last_context_type: CHAT_CONTEXT_TYPE.RFQ,
            last_context_id: rfq.id,
            rfq_id: rfq.id,
          },
          skipSystemUnread: true,
        },
      );
    }

    return systemRaw;
  });

  const message = await chatMessageModel.findById(raw.id);
  // Notify invited seller only — RFQ creator must not get chat/push for their own publish
  chatSocketEmitter.emitNewMessage(conversation, message, {
    skipPush: true,
    skipConversationEmit: true,
    onlyUserIds: [conversation.seller_id],
    excludeUserIds: [conversation.buyer_id],
  });
  const lastContext = await resolveContextPayload({
    last_context_type: CHAT_CONTEXT_TYPE.RFQ,
    last_context_id: rfq.id,
  });
  chatSocketEmitter.emitToUser(conversation.seller_id, CHAT_SOCKET_EVENT.CONVERSATION_UPDATED, {
    conversation_id: conversation.id,
    actor_id: actorId,
    last_context_type: CHAT_CONTEXT_TYPE.RFQ,
    last_context_id: rfq.id,
    last_context: lastContext,
    rfq_id: rfq.id,
  });
  pushUnreadSummary(conversation.seller_id);
  return message;
};

/**
 * Initialize / continue buyer↔seller chat for an RFQ (same role as inquiry create seed).
 * Ensures conversation + RFQ card + description text exist; does not attach quotation bubbles
 * (those come from recordSystemEvent on quote submit/update).
 */
const ensureRfqChatWithSeller = async ({ rfqId, sellerId, actorId = null }) => {
  if (!rfqId || !sellerId) return null;

  const rfqRaw = await rfqModel.findRfqById(rfqId, { raw: true });
  if (!rfqRaw) return null;
  // Buyer must never be treated as an invited seller on their own RFQ
  if (Number(sellerId) === Number(rfqRaw.buyer_id)) return null;

  const conversation = await chatConversationModel.findOrCreateBuyerSellerConversation({
    buyerId: rfqRaw.buyer_id,
    sellerId,
    initiatedBy: actorId || rfqRaw.buyer_id,
    lastContextType: CHAT_CONTEXT_TYPE.RFQ,
    lastContextId: rfqId,
    rfqId,
  });

  const rfq = await rfqModel.findRfqById(rfqId);
  await seedRfqContextMessage({
    conversation,
    rfq,
    actorId: actorId || rfqRaw.buyer_id,
    sellerId,
    includeQuotation: false,
    includeDescriptionText: true,
  });

  return conversation;
};

/**
 * Seed RFQ chat for every currently invited seller (PRIVATE RFQ publish / invite).
 */
const initializeRfqChatsForInvitedSellers = async (rfqId, actorId = null) => {
  const sellers = await rfqSellerModel.listAssignedSellersByRfqId(rfqId);
  const results = [];
  for (const seller of sellers) {
    const sellerId = seller.seller_id || seller.id;
    if (!sellerId) continue;
    // Never open a chat / notify the RFQ buyer as if they were an invited seller
    if (actorId && Number(sellerId) === Number(actorId)) continue;
    try {
      const conversation = await ensureRfqChatWithSeller({
        rfqId,
        sellerId,
        actorId,
      });
      if (conversation) results.push(conversation);
    } catch (error) {
      logger.error('[Chat] Failed to initialize RFQ chat for invited seller', {
        rfqId,
        sellerId,
        error: error.message,
      });
    }
  }
  return results;
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
        skip_push: true,
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
      metadata: inquiryId ? { inquiry_id: inquiryId, skip_push: true } : { skip_push: true },
    },
    trx,
  );

  await persistMessage(
    conversation,
    buyerId,
    {
      message_type: CHAT_MESSAGE_TYPE.SYSTEM,
      content: CHAT_SYSTEM_EVENT_LABELS[CHAT_SYSTEM_EVENT.INQUIRY_CREATED],
      metadata: {
        event_type: CHAT_SYSTEM_EVENT.INQUIRY_CREATED,
        inquiry_id: inquiryId || conversation.inquiry_id,
        product_id: product.id,
        actor_id: buyerId,
        skip_push: true,
      },
    },
    trx,
    // PRODUCT + TEXT already bump seller unread
    { skipUnread: true },
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
    let quotation = null;
    if (quotationId) {
      quotation = await inquiryQuotationModel.findById(quotationId);
    }

    let product = null;
    if (inquiry.product_id) {
      product = await productModel.findProductById(inquiry.product_id);
    }

    const baseMeta = {
      event_type: eventType,
      inquiry_id: inquiryId,
      inquiry_number: inquiry.inquiry_number || null,
      actor_id: actorId,
      ...buildProductMessageMeta(product),
      ...buildQuotationMessageMeta(quotation, { contextType: CHAT_CONTEXT_TYPE.ENQUIRY }),
      ...metadata,
    };

    const quoteCardEvents = [
      CHAT_SYSTEM_EVENT.QUOTATION_SUBMITTED,
      CHAT_SYSTEM_EVENT.QUOTATION_UPDATED,
      CHAT_SYSTEM_EVENT.QUOTATION_ACCEPTED,
      CHAT_SYSTEM_EVENT.QUOTATION_REJECTED,
      CHAT_SYSTEM_EVENT.QUOTATION_WITHDRAWN,
      CHAT_SYSTEM_EVENT.INQUIRY_ACCEPTED,
    ];

    const messagesToEmit = [];

    await db.transaction(async (trx) => {
      const systemSenderId = actorId || inquiry.seller_id || inquiry.buyer_id || null;
      const systemRaw = await persistMessage(
        conversation,
        systemSenderId,
        {
          message_type: CHAT_MESSAGE_TYPE.SYSTEM,
          content: label,
          metadata: baseMeta,
        },
        trx,
        {
          skipUnread: true,
          contextUpdate: {
            last_context_type: inquiry.product_id
              ? CHAT_CONTEXT_TYPE.PRODUCT
              : CHAT_CONTEXT_TYPE.ENQUIRY,
            last_context_id: inquiry.product_id || inquiry.id,
            inquiry_id: inquiry.id,
          },
        },
      );
      messagesToEmit.push(systemRaw.id);

      const otherId = otherParticipantId(conversation, systemSenderId);
      if (otherId) {
        const otherRole = getUserRoleInConversation(conversation, otherId);
        await chatConversationModel.incrementUnreadForRecipient(conversation.id, otherRole, trx);
      }

      if (quotation && quoteCardEvents.includes(eventType)) {
        const quoteRaw = await persistMessage(
          conversation,
          actorId || inquiry.seller_id,
          {
            message_type: CHAT_MESSAGE_TYPE.QUOTATION,
            content: `Quotation ${quotation.quotation_number}`,
            metadata: baseMeta,
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
        );
        messagesToEmit.push(quoteRaw.id);
      }
    });

    let lastMessage = null;
    const actorExclude = actorId ? [actorId] : [];
    for (const mid of messagesToEmit) {
      lastMessage = await chatMessageModel.findById(mid);
      chatSocketEmitter.emitNewMessage(conversation, lastMessage, {
        skipPush: true,
        excludeUserIds: actorExclude,
      });
    }
    chatSocketEmitter.emitConversationUpdated(conversation.id, actorId);
    const notifyIds = otherParticipantId(conversation, actorId);
    pushUnreadSummary(notifyIds ? [notifyIds] : [conversation.buyer_id, conversation.seller_id]);
    return lastMessage;
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
  ensureRfqChatWithSeller,
  initializeRfqChatsForInvitedSellers,
  seedRfqContextMessage,
  recordRfqEventForSellers,
  getParticipantUserIds,
  assertUserCanJoinConversation,
  persistMessage,
  CHAT_SYSTEM_EVENT,
  CHAT_CONTEXT_TYPE,
};
