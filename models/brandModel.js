const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { resolveMediaUrl } = require('../utils/media');

// ==========================================
// Formatting helpers
// ==========================================

/**
 * Format a brand row for API responses.
 * Resolves logo to a full URL.
 */
const formatRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    logo: resolveMediaUrl(row.logo),
    is_popular: row.is_popular !== undefined ? !!row.is_popular : undefined,
    is_active: row.is_active !== undefined ? !!row.is_active : undefined,
  };
};

// ==========================================
// List & read queries
// ==========================================

/**
 * Find a brand by ID (non-deleted).
 * @param {number} id - Brand ID
 * @param {{ raw?: boolean }} [options] - Return raw DB row when raw=true
 * @returns {Promise<Object|undefined>}
 */
const findBrandById = async (id, options = {}) => {
  const row = await db('brands').where({ id }).whereNull('deleted_at').first();
  if (!row || options.raw) return row;
  return formatRow(row);
};

/**
 * Paginated list of brands with optional search and status filters.
 * @param {Object} [filters] - Query filters (q, is_popular, is_active, page, limit)
 * @returns {Promise<Object>}
 */
const findBrands = async (filters = {}) => {
  const q = db('brands').whereNull('deleted_at');

  if (filters.q) {
    q.where('name', 'like', `%${filters.q}%`);
  }

  if (filters.is_popular !== undefined) {
    q.where('is_popular', filters.is_popular);
  }

  if (filters.is_active !== undefined) {
    q.where('is_active', filters.is_active);
  }

  q.orderBy('name', 'asc');

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
 * Insert a new brand.
 * @param {Object} data - Brand creation payload
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<Object>}
 */
const createBrand = async (data, userId = null) => {
  const payload = {
    name: data.name,
    logo: data.logo || null,
    is_popular: data.is_popular !== undefined ? data.is_popular : false,
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_by: userId,
  };

  const [id] = await db('brands').insert(payload);
  return db('brands').where({ id }).whereNull('deleted_at').first();
};

/**
 * Update an existing brand by ID.
 * @param {number} id - Brand ID
 * @param {Object} data - Fields to update
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<Object>}
 */
const updateBrand = async (id, data, userId = null) => {
  const payload = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.logo !== undefined) payload.logo = data.logo;
  if (data.is_popular !== undefined) payload.is_popular = data.is_popular;
  if (data.is_active !== undefined) payload.is_active = data.is_active;

  if (Object.keys(payload).length === 0) {
    return findBrandById(id);
  }

  payload.updated_by = userId;
  payload.updated_at = db.fn.now();

  await db('brands').where({ id }).update(payload);
  return findBrandById(id);
};

/** Apply logo path updates after file upload (used by brandService). */
const applyBrandMediaUpdates = async (id, updates, userId = null) => {
  if (!updates || !Object.keys(updates).length) {
    return db('brands').where({ id }).whereNull('deleted_at').first();
  }

  await db('brands')
    .where({ id })
    .update({
      ...updates,
      updated_by: userId,
      updated_at: db.fn.now(),
    });

  return db('brands').where({ id }).whereNull('deleted_at').first();
};

// ==========================================
// Delete (soft)
// ==========================================

/**
 * Soft-delete a brand by ID.
 * @param {number} id - Brand ID
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<void>}
 */
const deleteBrand = async (id, userId = null) => {
  await db('brands')
    .where({ id })
    .update({
      deleted_at: db.fn.now(),
      updated_by: userId,
    });
};

module.exports = {
  formatRow,
  findBrandById,
  findBrands,
  createBrand,
  updateBrand,
  applyBrandMediaUpdates,
  deleteBrand,
};
