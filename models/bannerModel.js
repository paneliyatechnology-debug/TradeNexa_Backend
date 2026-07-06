const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { resolveMediaUrl } = require('../utils/media');
const { applyListSort } = require('../utils/listQuery');

const BANNER_SORT_FIELDS = {
  id: 'banners.id',
  title: 'banners.title',
  priority: 'banners.priority',
  is_active: 'banners.is_active',
  created_at: 'banners.created_at',
};

// ==========================================
// Formatting helpers
// ==========================================

/** Format a banner row for API responses. */
const formatRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    image: resolveMediaUrl(row.image),
    is_active: row.is_active !== undefined ? !!row.is_active : undefined,
    priority: row.priority !== undefined ? parseInt(row.priority, 10) : undefined,
  };
};

// ==========================================
// List & read queries
// ==========================================

/**
 * Find a banner by ID (non-deleted).
 * @param {number} id - Banner ID
 * @param {{ raw?: boolean }} [options] - Return raw DB row when raw=true
 * @returns {Promise<Object|undefined>}
 */
const findBannerById = async (id, options = {}) => {
  const row = await db('banners').where({ id }).whereNull('deleted_at').first();
  if (!row || options.raw) return row;
  return formatRow(row);
};

/**
 * Paginated list of banners with search, filters, and sorting.
 * @param {Object} [filters] - Query filters (search, is_active, redirect_type, page, limit, sort_by, sort_order)
 * @returns {Promise<Object>}
 */
const findBanners = async (filters = {}) => {
  const q = db('banners').whereNull('deleted_at');

  if (filters.search) {
    q.where('banners.title', 'like', `%${filters.search}%`);
  }

  if (filters.is_active !== undefined) {
    q.where('banners.is_active', filters.is_active);
  }

  if (filters.redirect_type) {
    q.where('banners.redirect_type', filters.redirect_type);
  }

  applyListSort(q, filters, BANNER_SORT_FIELDS, { defaultSortBy: 'priority', defaultSortOrder: 'desc' });

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map(formatRow);
  return paginated;
};

// ==========================================
// Create & update
// ==========================================

/**
 * Insert a new banner.
 * @param {Object} data - Banner creation payload
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<Object>}
 */
const createBanner = async (data, userId = null) => {
  const payload = {
    title: data.title,
    image: data.image || '',
    redirect_type: data.redirect_type || null,
    redirect_id: data.redirect_id || null,
    priority: data.priority !== undefined ? data.priority : 0,
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_by: userId,
  };

  const [id] = await db('banners').insert(payload);
  return db('banners').where({ id }).whereNull('deleted_at').first();
};

/**
 * Update an existing banner by ID.
 * @param {number} id - Banner ID
 * @param {Object} data - Fields to update
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<Object>}
 */
const updateBanner = async (id, data, userId = null) => {
  const payload = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.image !== undefined) payload.image = data.image;
  if (data.redirect_type !== undefined) payload.redirect_type = data.redirect_type;
  if (data.redirect_id !== undefined) payload.redirect_id = data.redirect_id;
  if (data.priority !== undefined) payload.priority = data.priority;
  if (data.is_active !== undefined) payload.is_active = data.is_active;

  if (Object.keys(payload).length === 0) {
    return findBannerById(id);
  }

  payload.updated_by = userId;
  payload.updated_at = db.fn.now();

  await db('banners').where({ id }).update(payload);
  return findBannerById(id);
};

/** Apply image path updates after file upload (used by bannerService). */
const applyBannerMediaUpdates = async (id, updates, userId = null) => {
  if (!updates || !Object.keys(updates).length) {
    return db('banners').where({ id }).whereNull('deleted_at').first();
  }

  await db('banners')
    .where({ id })
    .update({
      ...updates,
      updated_by: userId,
      updated_at: db.fn.now(),
    });

  return db('banners').where({ id }).whereNull('deleted_at').first();
};

// ==========================================
// Delete (soft)
// ==========================================

/**
 * Soft-delete a banner by ID.
 * @param {number} id - Banner ID
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<void>}
 */
const deleteBanner = async (id, userId = null) => {
  await db('banners')
    .where({ id })
    .update({
      deleted_at: db.fn.now(),
      updated_by: userId,
    });
};

module.exports = {
  formatRow,
  findBannerById,
  findBanners,
  createBanner,
  updateBanner,
  applyBannerMediaUpdates,
  deleteBanner,
};
