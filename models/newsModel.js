const db = require('../database/knex');
const { paginate } = require('../utils/pagination');

// ==========================================
// List & read queries
// ==========================================

/**
 * Find a news article by ID (non-deleted).
 * @param {number} id - News ID
 * @returns {Promise<Object|undefined>}
 */
const findNewsById = (id) =>
  db('news').where({ id }).whereNull('deleted_at').first();

/**
 * Paginated list of news articles with optional search and status filters.
 * @param {Object} [filters] - Query filters (search, is_active, page, limit)
 * @returns {Promise<Object>}
 */
const findNewsList = async (filters = {}) => {
  const q = db('news').whereNull('deleted_at');

  if (filters.search) {
    q.where('title', 'like', `%${filters.search}%`);
  }

  if (filters.is_active !== undefined) {
    q.where('is_active', filters.is_active);
  }

  q.orderBy('news.id', 'desc');

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  return paginate(q, page, limit);
};

// ==========================================
// Create & update
// ==========================================

/**
 * Insert a new news article.
 * @param {Object} data - News creation payload
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<Object>}
 */
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
  return findNewsById(id);
};

/**
 * Update an existing news article by ID.
 * @param {number} id - News ID
 * @param {Object} data - Fields to update
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<Object>}
 */
const updateNews = async (id, data, userId = null) => {
  const payload = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.thumbnail !== undefined) payload.thumbnail = data.thumbnail;
  if (data.content !== undefined) payload.content = data.content;
  if (data.published_at !== undefined) payload.published_at = data.published_at ? new Date(data.published_at) : null;
  if (data.is_active !== undefined) payload.is_active = data.is_active;

  if (Object.keys(payload).length === 0) return findNewsById(id);

  payload.updated_by = userId;
  payload.updated_at = db.fn.now();

  await db('news').where({ id }).update(payload);
  return findNewsById(id);
};

// ==========================================
// Delete (soft)
// ==========================================

/**
 * Soft-delete a news article by ID.
 * @param {number} id - News ID
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<void>}
 */
const deleteNews = async (id, userId = null) => {
  await db('news')
    .where({ id })
    .update({
      deleted_at: db.fn.now(),
      updated_by: userId,
    });
};

module.exports = {
  findNewsById,
  findNewsList,
  createNews,
  updateNews,
  deleteNews,
};
