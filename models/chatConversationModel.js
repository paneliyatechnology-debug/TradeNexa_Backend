/**
 * Chat conversation data access.
 *
 * One conversation per buyer↔seller pair (unique buyer_id + seller_id).
 * last_context_* tracks the latest product / RFQ / enquiry being discussed.
 */
const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { applyListSort } = require('../utils/listQuery');
const { resolveMediaUrl } = require('../utils/media');
const { CHAT_CONVERSATION_SORT_BY_VALUES, CHAT_CONTEXT_TYPE } = require('../constants/chat');

// ==========================================
// Sort configuration
// ==========================================

const CONVERSATION_SORT_MAP = {
  last_message_at: 'chat_conversations.last_message_at',
  created_at: 'chat_conversations.created_at',
  updated_at: 'chat_conversations.updated_at',
};

// ==========================================
// Query builders
// ==========================================

/** Base query with buyer/seller profiles and denormalized context titles. */
const baseConversationQuery = () =>
  db('chat_conversations')
    .leftJoin('users as buyer', 'buyer.id', 'chat_conversations.buyer_id')
    .leftJoin('users as seller', 'seller.id', 'chat_conversations.seller_id')
    .leftJoin('company_details as buyer_profile', 'buyer_profile.user_id', 'buyer.id')
    .leftJoin('company_details as seller_profile', 'seller_profile.user_id', 'seller.id')
    .leftJoin('products as ctx_product', function () {
      this.on('chat_conversations.last_context_type', '=', db.raw('?', [CHAT_CONTEXT_TYPE.PRODUCT])).andOn(
        'ctx_product.id',
        '=',
        'chat_conversations.last_context_id',
      );
    })
    .leftJoin('rfqs as ctx_rfq', function () {
      this.on('chat_conversations.last_context_type', '=', db.raw('?', [CHAT_CONTEXT_TYPE.RFQ])).andOn(
        'ctx_rfq.id',
        '=',
        'chat_conversations.last_context_id',
      );
    })
    .leftJoin('inquiries as ctx_enquiry', function () {
      this.on('chat_conversations.last_context_type', '=', db.raw('?', [CHAT_CONTEXT_TYPE.ENQUIRY])).andOn(
        'ctx_enquiry.id',
        '=',
        'chat_conversations.last_context_id',
      );
    })
    .leftJoin('products as enquiry_product', 'enquiry_product.id', 'ctx_enquiry.product_id')
    .where('chat_conversations.is_active', true)
    .select(
      'chat_conversations.*',
      'buyer.full_name as buyer_name',
      'buyer.email as buyer_email',
      'buyer.profile_image as buyer_profile_image',
      'buyer_profile.company_name as buyer_company_name',
      db.raw('COALESCE(buyer_profile.company_logo, buyer.profile_image) as buyer_company_logo'),
      'seller.full_name as seller_name',
      'seller.email as seller_email',
      'seller.profile_image as seller_profile_image',
      'seller_profile.company_name as seller_company_name',
      db.raw('COALESCE(seller_profile.company_logo, seller.profile_image) as seller_company_logo'),
      'ctx_product.name as context_product_title',
      'ctx_rfq.title as context_rfq_title',
      'ctx_rfq.rfq_number as context_rfq_number',
      'ctx_enquiry.inquiry_number as context_enquiry_number',
      'enquiry_product.name as context_enquiry_product_title',
    );

// ==========================================
// Formatting helpers
// ==========================================

const formatUserBlock = (id, fullName, companyName, profileImage) => ({
  id,
  full_name: fullName || null,
  company_name: companyName || null,
  profile_image: profileImage ? resolveMediaUrl(profileImage) : null,
});

/** Resolve last_context object for list/header display. */
const formatLastContext = (row) => {
  if (!row?.last_context_type || !row?.last_context_id) return null;

  if (row.last_context_type === CHAT_CONTEXT_TYPE.PRODUCT) {
    return {
      type: CHAT_CONTEXT_TYPE.PRODUCT,
      id: row.last_context_id,
      title: row.context_product_title || null,
    };
  }

  if (row.last_context_type === CHAT_CONTEXT_TYPE.RFQ) {
    return {
      type: CHAT_CONTEXT_TYPE.RFQ,
      id: row.last_context_id,
      title: row.context_rfq_title || row.context_rfq_number || null,
    };
  }

  if (row.last_context_type === CHAT_CONTEXT_TYPE.ENQUIRY) {
    return {
      type: CHAT_CONTEXT_TYPE.ENQUIRY,
      id: row.last_context_id,
      title:
        row.context_enquiry_product_title ||
        row.context_enquiry_number ||
        null,
    };
  }

  return {
    type: row.last_context_type,
    id: row.last_context_id,
    title: null,
  };
};

/**
 * Inbox row — one conversation per buyer/seller pair.
 * @param {Object} row
 * @param {number} viewerId
 */
const formatInboxRow = (row, viewerId) => {
  const isBuyer = Number(viewerId) === Number(row.buyer_id);
  const other = isBuyer
    ? formatUserBlock(
        row.seller_id,
        row.seller_name,
        row.seller_company_name,
        row.seller_profile_image || row.seller_company_logo,
      )
    : formatUserBlock(
        row.buyer_id,
        row.buyer_name,
        row.buyer_company_name,
        row.buyer_profile_image || row.buyer_company_logo,
      );

  return {
    conversation_id: row.id,
    id: row.id,
    user: other,
    last_message: row.last_message_preview || null,
    last_message_at: row.last_message_at || null,
    last_message_sender_id: row.last_message_sender_id || null,
    unread_count: isBuyer ? row.buyer_unread_count : row.seller_unread_count,
    last_context: formatLastContext(row),
    buyer_id: row.buyer_id,
    seller_id: row.seller_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Full conversation detail (includes both participants).
 * @param {Object} row
 * @param {number} viewerId
 */
const formatConversationRow = (row, viewerId) => {
  const inbox = formatInboxRow(row, viewerId);

  return {
    ...inbox,
    buyer: formatUserBlock(
      row.buyer_id,
      row.buyer_name,
      row.buyer_company_name,
      row.buyer_profile_image || row.buyer_company_logo,
    ),
    seller: formatUserBlock(
      row.seller_id,
      row.seller_name,
      row.seller_company_name,
      row.seller_profile_image || row.seller_company_logo,
    ),
    initiated_by: row.initiated_by,
    last_message_id: row.last_message_id,
    last_message_preview: row.last_message_preview,
    buyer_unread_count: row.buyer_unread_count,
    seller_unread_count: row.seller_unread_count,
    buyer_last_read_message_id: row.buyer_last_read_message_id,
    seller_last_read_message_id: row.seller_last_read_message_id,
    last_context_type: row.last_context_type || null,
    last_context_id: row.last_context_id || null,
    // Legacy fields kept for older clients
    rfq_id: row.rfq_id || null,
    inquiry_id: row.inquiry_id || null,
    context_type: row.last_context_type || (row.inquiry_id ? 'enquiry' : row.rfq_id ? 'rfq' : null),
    is_active: !!row.is_active,
  };
};

// ==========================================
// Read operations
// ==========================================

const findById = async (id, { raw = false } = {}) => {
  const row = await baseConversationQuery().where('chat_conversations.id', id).first();
  if (!row || raw) return row || null;
  return row;
};

/** Find the single active conversation for a buyer↔seller pair. */
const findByBuyerAndSeller = (buyerId, sellerId, trx = null) => {
  const client = trx || db;
  return client('chat_conversations')
    .where({ buyer_id: buyerId, seller_id: sellerId, is_active: true })
    .first();
};

/** @deprecated Prefer findByBuyerAndSeller — kept for transitional callers. */
const findByRfqAndSeller = (rfqId, sellerId) =>
  db('chat_conversations')
    .where({ seller_id: sellerId, is_active: true })
    .where((builder) => {
      builder.where({ rfq_id: rfqId }).orWhere({ last_context_type: 'rfq', last_context_id: rfqId });
    })
    .first();

/** @deprecated Prefer findByBuyerAndSeller. */
const findByInquiryId = (inquiryId) =>
  db('chat_conversations')
    .where({ is_active: true })
    .where((builder) => {
      builder
        .where({ inquiry_id: inquiryId })
        .orWhere({ last_context_type: 'enquiry', last_context_id: inquiryId });
    })
    .first();

/**
 * Paginated inbox — one row per buyer/seller pair.
 */
const listConversationsForUser = async (userId, filters = {}) => {
  const q = baseConversationQuery().where((builder) => {
    builder
      .where('chat_conversations.buyer_id', userId)
      .orWhere('chat_conversations.seller_id', userId);
  });

  if (filters.role === 'buyer') {
    q.where('chat_conversations.buyer_id', userId);
  } else if (filters.role === 'seller') {
    q.where('chat_conversations.seller_id', userId);
  }

  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    q.where((builder) => {
      builder
        .where('buyer.full_name', 'like', term)
        .orWhere('seller.full_name', 'like', term)
        .orWhere('buyer_profile.company_name', 'like', term)
        .orWhere('seller_profile.company_name', 'like', term)
        .orWhere('ctx_product.name', 'like', term)
        .orWhere('ctx_rfq.title', 'like', term)
        .orWhere('ctx_rfq.rfq_number', 'like', term)
        .orWhere('chat_conversations.last_message_preview', 'like', term);
    });
  }

  applyListSort(q, filters, CONVERSATION_SORT_MAP, {
    defaultSortBy: 'last_message_at',
    defaultSortOrder: 'desc',
    allowedSortBy: CHAT_CONVERSATION_SORT_BY_VALUES,
  });

  if (!filters.sort_by) {
    q.orderBy('chat_conversations.last_message_at', 'desc');
    q.orderBy('chat_conversations.id', 'desc');
  }

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map((row) => formatInboxRow(row, userId));
  return paginated;
};

/** @deprecated RFQ-scoped list — resolves to buyer↔seller threads linked to this RFQ context. */
const listConversationsByRfq = async (rfqId, buyerId, filters = {}) => {
  const q = baseConversationQuery()
    .where('chat_conversations.buyer_id', buyerId)
    .where((builder) => {
      builder
        .where('chat_conversations.rfq_id', rfqId)
        .orWhere((inner) => {
          inner
            .where('chat_conversations.last_context_type', CHAT_CONTEXT_TYPE.RFQ)
            .andWhere('chat_conversations.last_context_id', rfqId);
        });
    });

  applyListSort(q, filters, CONVERSATION_SORT_MAP, {
    defaultSortBy: 'last_message_at',
    defaultSortOrder: 'desc',
    allowedSortBy: CHAT_CONVERSATION_SORT_BY_VALUES,
  });

  if (!filters.sort_by) {
    q.orderBy('chat_conversations.last_message_at', 'desc');
    q.orderBy('chat_conversations.id', 'desc');
  }

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map((row) => formatInboxRow(row, buyerId));
  return paginated;
};

const getTotalUnreadCount = async (userId) => {
  const buyerRow = await db('chat_conversations')
    .where({ buyer_id: userId, is_active: true })
    .sum('buyer_unread_count as total')
    .first();
  const sellerRow = await db('chat_conversations')
    .where({ seller_id: userId, is_active: true })
    .sum('seller_unread_count as total')
    .first();

  const buyerTotal = parseInt(buyerRow?.total || 0, 10);
  const sellerTotal = parseInt(sellerRow?.total || 0, 10);
  return {
    total: buyerTotal + sellerTotal,
    as_buyer: buyerTotal,
    as_seller: sellerTotal,
  };
};

// ==========================================
// Write operations
// ==========================================

/**
 * Insert a buyer↔seller conversation (caller must check uniqueness first).
 */
const createConversation = async (data, trx = null) => {
  const client = trx || db;
  const [id] = await client('chat_conversations').insert({
    rfq_id: data.rfq_id ?? null,
    inquiry_id: data.inquiry_id ?? null,
    last_context_type: data.last_context_type ?? null,
    last_context_id: data.last_context_id ?? null,
    buyer_id: data.buyer_id,
    seller_id: data.seller_id,
    initiated_by: data.initiated_by,
    is_active: true,
  });
  return client('chat_conversations').where({ id }).first();
};

const updateConversation = async (id, data, trx = null) => {
  const client = trx || db;
  await client('chat_conversations')
    .where({ id })
    .update({ ...data, updated_at: client.fn.now() });
  return client('chat_conversations').where({ id }).first();
};

/** Find existing pair conversation or create; always update last_context when provided. */
const findOrCreateBuyerSellerConversation = async (
  { buyerId, sellerId, initiatedBy, lastContextType = null, lastContextId = null, rfqId = null, inquiryId = null },
  trx = null,
) => {
  const client = trx || db;
  let conversation = await client('chat_conversations')
    .where({ buyer_id: buyerId, seller_id: sellerId, is_active: true })
    .first();

  if (conversation) {
    const updates = {};
    if (lastContextType && lastContextId) {
      updates.last_context_type = lastContextType;
      updates.last_context_id = lastContextId;
    }
    if (rfqId) updates.rfq_id = rfqId;
    if (inquiryId) updates.inquiry_id = inquiryId;
    if (Object.keys(updates).length) {
      conversation = await updateConversation(conversation.id, updates, trx);
    }
    return conversation;
  }

  return createConversation(
    {
      buyer_id: buyerId,
      seller_id: sellerId,
      initiated_by: initiatedBy || buyerId,
      last_context_type: lastContextType,
      last_context_id: lastContextId,
      rfq_id: rfqId,
      inquiry_id: inquiryId,
    },
    trx,
  );
};

const incrementUnreadForRecipient = async (conversationId, recipientRole, trx = null) => {
  const client = trx || db;
  const column = recipientRole === 'buyer' ? 'buyer_unread_count' : 'seller_unread_count';
  await client('chat_conversations').where({ id: conversationId }).increment(column, 1);
};

const resetUnreadForUser = async (conversationId, userRole, lastReadMessageId, trx = null) => {
  const client = trx || db;
  const updates =
    userRole === 'buyer'
      ? {
          buyer_unread_count: 0,
          buyer_last_read_message_id: lastReadMessageId,
        }
      : {
          seller_unread_count: 0,
          seller_last_read_message_id: lastReadMessageId,
        };

  await client('chat_conversations')
    .where({ id: conversationId })
    .update({ ...updates, updated_at: client.fn.now() });
};

module.exports = {
  formatLastContext,
  formatInboxRow,
  formatConversationRow,
  findById,
  findByBuyerAndSeller,
  findByRfqAndSeller,
  findByInquiryId,
  findOrCreateBuyerSellerConversation,
  createConversation,
  updateConversation,
  incrementUnreadForRecipient,
  resetUnreadForUser,
  listConversationsForUser,
  listConversationsByRfq,
  getTotalUnreadCount,
};
