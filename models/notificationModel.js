/**
 * In-app notification inbox data access (RFQ + inquiry related only).
 *
 * Each row may carry `role` = `buyer` | `seller` so dual-role (buyer_seller)
 * users can filter their inbox with `?role=buyer` or `?role=seller`.
 */
const db = require('../database/knex');
const { paginate } = require('../utils/pagination');

// ==========================================
// Helpers
// ==========================================

const parseJson = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const serializeJson = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return JSON.stringify(value);
};

/**
 * Normalize a notification row for API / socket payloads.
 * @param {Object|null} row
 * @returns {Object|null}
 */
const formatRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    role: row.role || null,
    title: row.title,
    body: row.body,
    reference_id: row.reference_id ?? null,
    sender_id: row.sender_id ?? null,
    click_action: row.click_action ?? null,
    data: parseJson(row.data),
    is_read: Boolean(row.is_read),
    read_at: row.read_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

// ==========================================
// Writes
// ==========================================

/**
 * Insert a notification for a user.
 * @param {Object} payload
 * @param {'buyer'|'seller'|null} [payload.role] - Audience marketplace side
 * @returns {Promise<Object>}
 */
const create = async ({
  userId,
  type,
  role = null,
  title,
  body,
  referenceId = null,
  senderId = null,
  clickAction = null,
  data = null,
}) => {
  const [id] = await db('notifications').insert({
    user_id: userId,
    type,
    role: role || null,
    title,
    body,
    reference_id: referenceId,
    sender_id: senderId,
    click_action: clickAction,
    data: serializeJson(data),
    is_read: false,
    read_at: null,
  });

  return findByIdForUser(id, userId);
};

/**
 * @param {number} id
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
const findByIdForUser = async (id, userId) => {
  const row = await db('notifications').where({ id, user_id: userId }).first();
  return formatRow(row);
};

// ==========================================
// Reads
// ==========================================

/**
 * Paginated inbox for a user (newest first).
 * @param {number} userId
 * @param {Object} [filters]
 * @param {boolean|string} [filters.is_read]
 * @param {string} [filters.type]
 * @param {'buyer'|'seller'} [filters.role]
 * @returns {Promise<{ results: Array, pagination: Object }>}
 */
const listForUser = async (userId, filters = {}) => {
  const q = db('notifications').where({ user_id: userId }).select('*');

  if (filters.is_read === true || filters.is_read === false) {
    q.andWhere('is_read', filters.is_read);
  } else if (filters.is_read === 'true' || filters.is_read === 'false') {
    q.andWhere('is_read', filters.is_read === 'true');
  }

  if (filters.type) {
    q.andWhere('type', filters.type);
  }

  if (filters.role) {
    q.andWhere('role', filters.role);
  }

  q.orderBy('created_at', 'desc').orderBy('id', 'desc');

  const { results, pagination } = await paginate(q, filters.page, filters.limit);
  return {
    results: results.map(formatRow),
    pagination,
  };
};

/**
 * Unread count for a user; optional `role` scopes to buyer or seller inbox.
 * @param {number} userId
 * @param {Object} [filters]
 * @param {'buyer'|'seller'} [filters.role]
 * @returns {Promise<number>}
 */
const countUnread = async (userId, filters = {}) => {
  const q = db('notifications').where({ user_id: userId, is_read: false });
  if (filters.role) {
    q.andWhere('role', filters.role);
  }
  const row = await q.count({ total: '*' }).first();
  return parseInt(row?.total || 0, 10);
};

/**
 * Unread inbox counts split by audience role (for profile badges).
 * @param {number} userId
 * @returns {Promise<{ total: number, buyer: number, seller: number }>}
 */
const countUnreadByRole = async (userId) => {
  const rows = await db('notifications')
    .where({ user_id: userId, is_read: false })
    .groupBy('role')
    .select('role', db.raw('COUNT(*) as count'));

  let total = 0;
  let buyer = 0;
  let seller = 0;

  rows.forEach((row) => {
    const count = parseInt(row.count || 0, 10);
    total += count;
    if (row.role === 'buyer') buyer = count;
    if (row.role === 'seller') seller = count;
  });

  return { total, buyer, seller };
};

// ==========================================
// Read status
// ==========================================

/**
 * Mark one notification as read for the owning user.
 * @param {number} id
 * @param {number} userId
 * @returns {Promise<Object|null>} updated row, or null if not found / already read
 */
const markRead = async (id, userId) => {
  const existing = await db('notifications').where({ id, user_id: userId }).first();
  if (!existing) return null;

  if (existing.is_read) {
    return formatRow(existing);
  }

  const now = db.fn.now();
  await db('notifications').where({ id, user_id: userId }).update({
    is_read: true,
    read_at: now,
    updated_at: now,
  });

  return findByIdForUser(id, userId);
};

/**
 * Mark many notifications as read.
 * @param {number} userId
 * @param {number[]} ids
 * @returns {Promise<number>} rows updated
 */
const markManyRead = async (userId, ids = []) => {
  const uniqueIds = [...new Set(ids.map(Number).filter(Boolean))];
  if (!uniqueIds.length) return 0;

  const now = db.fn.now();
  return db('notifications')
    .where({ user_id: userId, is_read: false })
    .whereIn('id', uniqueIds)
    .update({
      is_read: true,
      read_at: now,
      updated_at: now,
    });
};

/**
 * Mark all unread notifications as read for a user.
 * @param {number} userId
 * @param {Object} [filters]
 * @param {'buyer'|'seller'} [filters.role]
 * @returns {Promise<number>}
 */
const markAllRead = async (userId, filters = {}) => {
  const now = db.fn.now();
  const q = db('notifications').where({ user_id: userId, is_read: false });
  if (filters.role) {
    q.andWhere('role', filters.role);
  }
  return q.update({
    is_read: true,
    read_at: now,
    updated_at: now,
  });
};

module.exports = {
  create,
  findByIdForUser,
  listForUser,
  countUnread,
  countUnreadByRole,
  markRead,
  markManyRead,
  markAllRead,
  formatRow,
};
