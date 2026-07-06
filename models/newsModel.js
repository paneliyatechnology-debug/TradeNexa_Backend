/**
 * News article data access — CRUD and thumbnail media path updates.
 */
const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { resolveMediaUrl } = require('../utils/media');
const { applyListSort } = require('../utils/listQuery');

const NEWS_SORT_FIELDS = {
  id: 'news.id',
  title: 'news.title',
  published_at: 'news.published_at',
  is_active: 'news.is_active',
  created_at: 'news.created_at',
};

// ==========================================
// Formatting helpers
// ==========================================

/** Format a news row for API responses (resolves thumbnail URL). */
const formatRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    thumbnail: row.thumbnail ? resolveMediaUrl(row.thumbnail) : null,
    is_active: row.is_active !== undefined ? !!row.is_active : undefined,
  };
};

// ==========================================
// List & read queries
// ==========================================

const findNewsById = async (id, options = {}) => {
  const row = await db('news').where({ id }).whereNull('deleted_at').first();
  if (!row || options.raw) return row;
  return formatRow(row);
};

const findNewsList = async (filters = {}) => {
  const q = db('news').whereNull('deleted_at');

  if (filters.search) {
    q.where('title', 'like', `%${filters.search}%`);
  }

  if (filters.is_active !== undefined) {
    q.where('is_active', filters.is_active);
  }

  applyListSort(q, filters, NEWS_SORT_FIELDS);

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map(formatRow);
  return paginated;
};

// ==========================================
// Write operations
// ==========================================

const createNews = async (data, userId = null) => {
  const payload = {
    title: data.title,
    thumbnail: data.thumbnail || null,
    content: data.content,
    published_at: data.published_at ? new Date(data.published_at) : db.fn.now(),
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_by: userId,
  };

  const [id] = await db('news').insert(payload);
  return db('news').where({ id }).whereNull('deleted_at').first();
};

const updateNews = async (id, data, userId = null) => {
  const payload = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.thumbnail !== undefined) payload.thumbnail = data.thumbnail;
  if (data.content !== undefined) payload.content = data.content;
  if (data.published_at !== undefined) {
    payload.published_at = data.published_at ? new Date(data.published_at) : null;
  }
  if (data.is_active !== undefined) payload.is_active = data.is_active;

  if (Object.keys(payload).length === 0) return findNewsById(id);

  payload.updated_by = userId;
  payload.updated_at = db.fn.now();

  await db('news').where({ id }).update(payload);
  return findNewsById(id);
};

/** Apply thumbnail path updates after file upload (create inbox move or update direct). */
const applyNewsMediaUpdates = async (id, updates, userId = null) => {
  if (!updates || !Object.keys(updates).length) {
    return db('news').where({ id }).whereNull('deleted_at').first();
  }

  await db('news')
    .where({ id })
    .update({
      ...updates,
      updated_by: userId,
      updated_at: db.fn.now(),
    });

  return db('news').where({ id }).whereNull('deleted_at').first();
};

const deleteNews = async (id, userId = null) => {
  await db('news')
    .where({ id })
    .update({
      deleted_at: db.fn.now(),
      updated_by: userId,
    });
};

module.exports = {
  formatRow,
  findNewsById,
  findNewsList,
  createNews,
  updateNews,
  applyNewsMediaUpdates,
  deleteNews,
};
