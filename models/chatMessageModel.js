/**
 * Chat message data access.
 *
 * Supports TEXT, IMAGE, DOCUMENT, PRODUCT, QUOTATION, and SYSTEM message types.
 * Each message has is_read / read_at for per-message read receipts.
 */
const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { resolveMediaUrl } = require('../utils/media');
const { CHAT_MESSAGE_TYPE } = require('../constants/chat');

// ==========================================
// Metadata helpers
// ==========================================

const parseMetadata = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const serializeMetadataForDb = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed;
  }
  return JSON.stringify(value);
};

// ==========================================
// Formatting helpers
// ==========================================

const formatMessageRow = (row) => {
  const metadata = parseMetadata(row.metadata);
  const formattedMetadata = metadata ? { ...metadata } : null;

  if (formattedMetadata?.file_path) {
    formattedMetadata.file_url = resolveMediaUrl(formattedMetadata.file_path);
  }

  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    sender_name: row.sender_name || null,
    sender_company_name: row.sender_company_name || null,
    message_type: row.message_type,
    content: row.content,
    message: row.content,
    metadata: formattedMetadata,
    reply_to_message_id: row.reply_to_message_id,
    is_read: row.is_read !== undefined ? !!row.is_read : false,
    read_at: row.read_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const buildPreview = (messageType, content, metadata) => {
  switch (messageType) {
    case CHAT_MESSAGE_TYPE.TEXT:
      return (content || '').slice(0, 500);
    case CHAT_MESSAGE_TYPE.IMAGE:
      return 'Image';
    case CHAT_MESSAGE_TYPE.DOCUMENT:
      return metadata?.file_name ? `Document: ${metadata.file_name}` : 'Document';
    case CHAT_MESSAGE_TYPE.PRODUCT:
      return metadata?.product_name ? `Product: ${metadata.product_name}` : 'Product shared';
    case CHAT_MESSAGE_TYPE.QUOTATION:
      return metadata?.quotation_number
        ? `Quotation: ${metadata.quotation_number}`
        : 'Quotation shared';
    case CHAT_MESSAGE_TYPE.SYSTEM:
      return content || 'System update';
    default:
      return content || '';
  }
};

// ==========================================
// Query builders
// ==========================================

const baseMessageQuery = () =>
  db('chat_messages')
    .leftJoin('users', 'users.id', 'chat_messages.sender_id')
    .leftJoin('company_details', 'company_details.user_id', 'users.id')
    .whereNull('chat_messages.deleted_at')
    .select(
      'chat_messages.*',
      'users.full_name as sender_name',
      'company_details.company_name as sender_company_name',
    );

// ==========================================
// Read operations
// ==========================================

const findById = async (id) => {
  const row = await baseMessageQuery().where('chat_messages.id', id).first();
  return row ? formatMessageRow(row) : null;
};

const findRawById = (id, trx = null) => {
  const client = trx || db;
  return client('chat_messages').where({ id }).whereNull('deleted_at').first();
};

const listMessages = async (conversationId, filters = {}) => {
  const q = baseMessageQuery().where('chat_messages.conversation_id', conversationId);

  if (filters.before_id) {
    q.where('chat_messages.id', '<', filters.before_id);
  }

  if (filters.after_id) {
    q.where('chat_messages.id', '>', filters.after_id);
  }

  const order = filters.order === 'desc' ? 'desc' : 'asc';
  q.orderBy('chat_messages.created_at', order);
  q.orderBy('chat_messages.id', order);

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 20;
  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map(formatMessageRow);
  return paginated;
};

const getLatestMessageId = async (conversationId, trx = null) => {
  const client = trx || db;
  const row = await client('chat_messages')
    .where({ conversation_id: conversationId })
    .whereNull('deleted_at')
    .orderBy('id', 'desc')
    .select('id')
    .first();
  return row?.id || null;
};

/**
 * Mark unread messages from other participants as read for this viewer.
 * @returns {Promise<number[]>} IDs of messages that were marked read
 */
const markMessagesReadForViewer = async (conversationId, viewerId, upToMessageId = null, trx = null) => {
  const client = trx || db;
  const q = client('chat_messages')
    .where({ conversation_id: conversationId, is_read: false })
    .whereNull('deleted_at')
    .where((builder) => {
      builder.whereNot('sender_id', viewerId).orWhereNull('sender_id');
    });

  if (upToMessageId) {
    q.where('id', '<=', upToMessageId);
  }

  const rows = await q.clone().select('id');
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];

  await client('chat_messages').whereIn('id', ids).update({
    is_read: true,
    read_at: client.fn.now(),
    updated_at: client.fn.now(),
  });

  return ids;
};

// ==========================================
// Write operations
// ==========================================

const createMessage = async (data, trx = null) => {
  const client = trx || db;
  const [id] = await client('chat_messages').insert({
    conversation_id: data.conversation_id,
    sender_id: data.sender_id ?? null,
    message_type: data.message_type,
    content: data.content ?? null,
    metadata: serializeMetadataForDb(data.metadata),
    reply_to_message_id: data.reply_to_message_id ?? null,
    is_read: data.is_read !== undefined ? !!data.is_read : false,
    read_at: data.read_at || null,
    created_at: client.fn.now(),
    updated_at: client.fn.now(),
  });
  return client('chat_messages').where({ id }).first();
};

module.exports = {
  formatMessageRow,
  parseMetadata,
  serializeMetadataForDb,
  createMessage,
  findById,
  findRawById,
  listMessages,
  getLatestMessageId,
  markMessagesReadForViewer,
  buildPreview,
};
