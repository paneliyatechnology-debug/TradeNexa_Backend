/**
 * Chat message data access.
 *
 * Supports TEXT, IMAGE, DOCUMENT, PRODUCT, QUOTATION, and SYSTEM message types.
 * Metadata JSON stores attachments, product/quotation refs, and RFQ event payloads.
 */
const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { resolveMediaUrl } = require('../utils/media');
const { CHAT_MESSAGE_TYPE } = require('../constants/chat');

// ==========================================
// Metadata helpers
// ==========================================

/** Parse JSON metadata from DB (string or object). */
const parseMetadata = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

/** Serialize metadata for MySQL JSON column writes. */
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

/** Format a message row for API output (resolves media URLs in metadata). */
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
    metadata: formattedMetadata,
    reply_to_message_id: row.reply_to_message_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/** Build inbox preview text from message type and content. */
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

/** Base query with sender name and company joins. */
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

/** Find a single message by ID with formatted output. */
const findById = async (id) => {
  const row = await baseMessageQuery().where('chat_messages.id', id).first();
  return row ? formatMessageRow(row) : null;
};

/** Find raw message row (for transactions/internal use). */
const findRawById = (id, trx = null) => {
  const client = trx || db;
  return client('chat_messages').where({ id }).whereNull('deleted_at').first();
};

/**
 * Paginated message list for a conversation.
 * Supports cursor pagination via before_id / after_id.
 */
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

/** Latest message ID in a conversation (used for read receipts). */
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

// ==========================================
// Write operations
// ==========================================

/**
 * Insert a new chat message.
 * @param {Object} data - Message payload
 * @param {Object|null} [trx] - Optional Knex transaction
 */
const createMessage = async (data, trx = null) => {
  const client = trx || db;
  const [id] = await client('chat_messages').insert({
    conversation_id: data.conversation_id,
    sender_id: data.sender_id ?? null,
    message_type: data.message_type,
    content: data.content ?? null,
    metadata: serializeMetadataForDb(data.metadata),
    reply_to_message_id: data.reply_to_message_id ?? null,
    created_at: client.fn.now(),
    updated_at: client.fn.now(),
  });
  return client('chat_messages').where({ id }).first();
};

// ==========================================
// Exports
// ==========================================

module.exports = {
  formatMessageRow,
  parseMetadata,
  serializeMetadataForDb,
  createMessage,
  findById,
  findRawById,
  listMessages,
  getLatestMessageId,
  buildPreview,
};
