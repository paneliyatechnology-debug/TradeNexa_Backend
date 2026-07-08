/**
 * Chat conversation data access.
 *
 * One RFQ can have multiple conversations (one per seller).
 * Unique constraint: (rfq_id, seller_id).
 */
const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { applyListSort } = require('../utils/listQuery');
const { CHAT_CONVERSATION_SORT_BY_VALUES } = require('../constants/chat');

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

/** Base query with RFQ, buyer, and seller profile joins. */
const baseConversationQuery = () =>
  db('chat_conversations')
    .leftJoin('rfqs', 'rfqs.id', 'chat_conversations.rfq_id')
    .leftJoin('users as buyer', 'buyer.id', 'chat_conversations.buyer_id')
    .leftJoin('users as seller', 'seller.id', 'chat_conversations.seller_id')
    .leftJoin('company_details as buyer_profile', 'buyer_profile.user_id', 'buyer.id')
    .leftJoin('company_details as seller_profile', 'seller_profile.user_id', 'seller.id')
    .where('chat_conversations.is_active', true)
    .select(
      'chat_conversations.*',
      'rfqs.rfq_number',
      'rfqs.title as rfq_title',
      'rfqs.status as rfq_status',
      'buyer.full_name as buyer_name',
      'buyer.email as buyer_email',
      'buyer_profile.company_name as buyer_company_name',
      'seller.full_name as seller_name',
      'seller.email as seller_email',
      'seller_profile.company_name as seller_company_name',
    );

// ==========================================
// Formatting helpers
// ==========================================

/** Normalize buyer/seller participant block for API responses. */
const formatParticipant = (id, name, email, companyName) => ({
  id,
  user_id: id,
  name: name || null,
  email: email || null,
  company_name: companyName || null,
});

/**
 * Format a conversation row for API output.
 * @param {Object} row - Joined DB row
 * @param {number} viewerId - Current user ID (determines unread_count side)
 */
const formatConversationRow = (row, viewerId) => {
  const isBuyer = viewerId === row.buyer_id;
  return {
    id: row.id,
    rfq_id: row.rfq_id,
    rfq_number: row.rfq_number || null,
    rfq_title: row.rfq_title || null,
    rfq_status: row.rfq_status || null,
    buyer: formatParticipant(
      row.buyer_id,
      row.buyer_name,
      row.buyer_email,
      row.buyer_company_name,
    ),
    seller: formatParticipant(
      row.seller_id,
      row.seller_name,
      row.seller_email,
      row.seller_company_name,
    ),
    initiated_by: row.initiated_by,
    last_message_id: row.last_message_id,
    last_message_at: row.last_message_at,
    last_message_preview: row.last_message_preview,
    unread_count: isBuyer ? row.buyer_unread_count : row.seller_unread_count,
    buyer_unread_count: row.buyer_unread_count,
    seller_unread_count: row.seller_unread_count,
    buyer_last_read_message_id: row.buyer_last_read_message_id,
    seller_last_read_message_id: row.seller_last_read_message_id,
    is_active: !!row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

// ==========================================
// Read operations
// ==========================================

/**
 * Find conversation by ID with joined RFQ and participant details.
 * @param {number} id
 * @param {{ raw?: boolean }} [options]
 */
const findById = async (id, { raw = false } = {}) => {
  const row = await baseConversationQuery().where('chat_conversations.id', id).first();
  if (!row || raw) return row || null;
  return row;
};

/** Find the unique conversation for an RFQ + seller pair. */
const findByRfqAndSeller = (rfqId, sellerId) =>
  db('chat_conversations').where({ rfq_id: rfqId, seller_id: sellerId, is_active: true }).first();

/**
 * Paginated inbox for a user (buyer and/or seller side).
 * @param {number} userId
 * @param {Object} [filters]
 */
const listConversationsForUser = async (userId, filters = {}) => {
  const q = baseConversationQuery().where((builder) => {
    builder.where('chat_conversations.buyer_id', userId).orWhere('chat_conversations.seller_id', userId);
  });

  if (filters.rfq_id) {
    q.where('chat_conversations.rfq_id', filters.rfq_id);
  }

  if (filters.role === 'buyer') {
    q.where('chat_conversations.buyer_id', userId);
  } else if (filters.role === 'seller') {
    q.where('chat_conversations.seller_id', userId);
  }

  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    q.where((builder) => {
      builder
        .where('rfqs.title', 'like', term)
        .orWhere('rfqs.rfq_number', 'like', term)
        .orWhere('buyer.full_name', 'like', term)
        .orWhere('seller.full_name', 'like', term)
        .orWhere('buyer_profile.company_name', 'like', term)
        .orWhere('seller_profile.company_name', 'like', term);
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
  paginated.results = paginated.results.map((row) => formatConversationRow(row, userId));
  return paginated;
};

/** Buyer-only list of all seller threads on one RFQ. */
const listConversationsByRfq = async (rfqId, buyerId, filters = {}) => {
  const q = baseConversationQuery()
    .where('chat_conversations.rfq_id', rfqId)
    .where('chat_conversations.buyer_id', buyerId);

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
  paginated.results = paginated.results.map((row) => formatConversationRow(row, buyerId));
  return paginated;
};

/** Aggregate unread counts across all active conversations for a user. */
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
 * Insert a new RFQ conversation.
 * @param {Object} data - { rfq_id, buyer_id, seller_id, initiated_by }
 * @param {Object|null} [trx]
 */
const createConversation = async (data, trx = null) => {
  const client = trx || db;
  const [id] = await client('chat_conversations').insert({
    rfq_id: data.rfq_id,
    buyer_id: data.buyer_id,
    seller_id: data.seller_id,
    initiated_by: data.initiated_by,
    is_active: true,
  });
  return client('chat_conversations').where({ id }).first();
};

/** Update conversation fields (last message preview, unread counts, etc.). */
const updateConversation = async (id, data, trx = null) => {
  const client = trx || db;
  await client('chat_conversations')
    .where({ id })
    .update({ ...data, updated_at: client.fn.now() });
  return client('chat_conversations').where({ id }).first();
};

/** Increment unread counter for buyer or seller after a new message. */
const incrementUnreadForRecipient = async (conversationId, recipientRole, trx = null) => {
  const client = trx || db;
  const column = recipientRole === 'buyer' ? 'buyer_unread_count' : 'seller_unread_count';
  await client('chat_conversations').where({ id: conversationId }).increment(column, 1);
};

/** Reset unread count and store last-read message pointer for a participant. */
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

// ==========================================
// Exports
// ==========================================

module.exports = {
  formatConversationRow,
  findById,
  findByRfqAndSeller,
  createConversation,
  updateConversation,
  incrementUnreadForRecipient,
  resetUnreadForUser,
  listConversationsForUser,
  listConversationsByRfq,
  getTotalUnreadCount,
};
