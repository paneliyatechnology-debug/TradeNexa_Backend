/**
 * Product search history data access — user-scoped keyword rows from GET /products.
 */
const db = require('../database/knex');

const MAX_HISTORY = 20;

// ==========================================
// Formatting
// ==========================================

const formatRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    keyword: row.keyword,
    searched_at: row.searched_at,
  };
};

// ==========================================
// Read
// ==========================================

/** Latest searches for a user (newest first), capped at MAX_HISTORY. */
const listByUser = async (userId, { limit = MAX_HISTORY } = {}) => {
  const rows = await db('product_search_history')
    .where({ user_id: userId })
    .orderBy('searched_at', 'desc')
    .orderBy('id', 'desc')
    .limit(Math.min(limit, MAX_HISTORY));

  return rows.map(formatRow);
};

const findByIdForUser = (id, userId) =>
  db('product_search_history').where({ id, user_id: userId }).first();

const findByUserAndKeyword = (userId, keyword, trx = null) => {
  const client = trx || db;
  return client('product_search_history').where({ user_id: userId, keyword }).first();
};

const countByUser = async (userId, trx = null) => {
  const client = trx || db;
  const row = await client('product_search_history')
    .where({ user_id: userId })
    .count({ total: '*' })
    .first();
  return parseInt(row?.total || 0, 10);
};

// ==========================================
// Write
// ==========================================

const insert = async ({ userId, keyword, searchedAt }, trx = null) => {
  const client = trx || db;
  const [id] = await client('product_search_history').insert({
    user_id: userId,
    keyword,
    searched_at: searchedAt || client.fn.now(),
  });
  return id;
};

const touchSearchedAt = async (id, trx = null) => {
  const client = trx || db;
  await client('product_search_history')
    .where({ id })
    .update({
      searched_at: client.fn.now(),
      updated_at: client.fn.now(),
    });
};

/**
 * Keep only the newest MAX_HISTORY rows for a user (delete oldest).
 */
const trimToMax = async (userId, trx = null) => {
  const client = trx || db;
  const rows = await client('product_search_history')
    .where({ user_id: userId })
    .orderBy('searched_at', 'desc')
    .orderBy('id', 'desc')
    .select('id');

  if (rows.length <= MAX_HISTORY) return 0;

  const keepIds = rows.slice(0, MAX_HISTORY).map((r) => r.id);
  return client('product_search_history')
    .where({ user_id: userId })
    .whereNotIn('id', keepIds)
    .del();
};

const deleteByIdForUser = async (id, userId) =>
  db('product_search_history').where({ id, user_id: userId }).del();

const deleteAllForUser = async (userId) =>
  db('product_search_history').where({ user_id: userId }).del();

module.exports = {
  MAX_HISTORY,
  formatRow,
  listByUser,
  findByIdForUser,
  findByUserAndKeyword,
  countByUser,
  insert,
  touchSearchedAt,
  trimToMax,
  deleteByIdForUser,
  deleteAllForUser,
};
