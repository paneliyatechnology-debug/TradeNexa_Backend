/**
 * In-app notification inbox data access (RFQ + inquiry related only).
 *
 * Each row may carry `role_id` (FK → roles) so dual-role users can filter
 * buyer vs seller inbox via `?role_id=` on list / unread-count APIs.
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
 * `role` is the roles.code convenience field; filter APIs use `role_id`.
 * @param {Object|null} row
 * @returns {Object|null}
 */
const formatRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    role_id: row.role_id != null ? Number(row.role_id) : null,
    role: row.role_code || null,
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

/** Base select with roles.code joined for `role` on formatted rows. */
const baseNotificationQuery = () =>
  db('notifications')
    .leftJoin('roles', 'roles.id', 'notifications.role_id')
    .select('notifications.*', 'roles.code as role_code');

// ==========================================
// Writes
// ==========================================

/**
 * Insert a notification for a user.
 * @param {Object} payload
 * @param {number|null} [payload.roleId] - Audience roles.id (buyer or seller)
 * @returns {Promise<Object>}
 */
const create = async ({
  userId,
  type,
  roleId = null,
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
    role_id: roleId != null ? Number(roleId) || null : null,
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
  const row = await baseNotificationQuery()
    .where({ 'notifications.id': id, 'notifications.user_id': userId })
    .first();
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
 * @param {number|string} [filters.role_id] - Filter by audience role (buyer/seller id)
 * @returns {Promise<{ results: Array, pagination: Object }>}
 */
const listForUser = async (userId, filters = {}) => {
  const q = baseNotificationQuery().where({ 'notifications.user_id': userId });

  if (filters.is_read === true || filters.is_read === false) {
    q.andWhere('notifications.is_read', filters.is_read);
  } else if (filters.is_read === 'true' || filters.is_read === 'false') {
    q.andWhere('notifications.is_read', filters.is_read === 'true');
  }

  if (filters.type) {
    q.andWhere('notifications.type', filters.type);
  }

  if (filters.role_id) {
    q.andWhere('notifications.role_id', Number(filters.role_id));
  }

  q.orderBy('notifications.created_at', 'desc').orderBy('notifications.id', 'desc');

  const { results, pagination } = await paginate(q, filters.page, filters.limit);
  return {
    results: results.map(formatRow),
    pagination,
  };
};

/**
 * Unread count for a user; optional `role_id` scopes to one marketplace side.
 * @param {number} userId
 * @param {Object} [filters]
 * @param {number|string} [filters.role_id]
 * @returns {Promise<number>}
 */
const countUnread = async (userId, filters = {}) => {
  const q = db('notifications').where({ user_id: userId, is_read: false });
  if (filters.role_id) {
    q.andWhere('role_id', Number(filters.role_id));
  }
  const row = await q.count({ total: '*' }).first();
  return parseInt(row?.total || 0, 10);
};

/**
 * Unread inbox counts split by audience role code (for profile badges).
 * Used by GET /auth/profile → counts.notifications_unread.
 * @param {number} userId
 * @returns {Promise<{ total: number, buyer: number, seller: number }>}
 */
const countUnreadByRole = async (userId) => {
  const rows = await db('notifications')
    .leftJoin('roles', 'roles.id', 'notifications.role_id')
    .where({ 'notifications.user_id': userId, 'notifications.is_read': false })
    .groupBy('notifications.role_id', 'roles.code')
    .select(
      'notifications.role_id',
      'roles.code as role_code',
      db.raw('COUNT(*) as count'),
    );

  let total = 0;
  let buyer = 0;
  let seller = 0;

  rows.forEach((row) => {
    const count = parseInt(row.count || 0, 10);
    total += count;
    if (row.role_code === 'buyer') buyer = count;
    if (row.role_code === 'seller') seller = count;
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
    return findByIdForUser(id, userId);
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
 * @param {number|string} [filters.role_id]
 * @returns {Promise<number>}
 */
const markAllRead = async (userId, filters = {}) => {
  const now = db.fn.now();
  const q = db('notifications').where({ user_id: userId, is_read: false });
  if (filters.role_id) {
    q.andWhere('role_id', Number(filters.role_id));
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
