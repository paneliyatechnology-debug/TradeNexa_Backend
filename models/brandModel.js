const db = require('../database/knex');
const { paginate } = require('../utils/pagination');

// ==========================================
// List & read queries
// ==========================================

/**
 * Find a brand by ID (non-deleted).
 * @param {number} id - Brand ID
 * @returns {Promise<Object|undefined>}
 */
const findBrandById = (id) =>
  db('brands').where({ id }).whereNull('deleted_at').first();

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
  return paginate(q, page, limit);
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
  return findBrandById(id);
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

  if (Object.keys(payload).length === 0) return findBrandById(id);

  payload.updated_by = userId;
  payload.updated_at = db.fn.now();

  await db('brands').where({ id }).update(payload);
  return findBrandById(id);
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
  findBrandById,
  findBrands,
  createBrand,
  updateBrand,
  deleteBrand,
};
