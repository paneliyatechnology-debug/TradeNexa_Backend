const db = require('../database/knex');
const { paginate } = require('../utils/pagination');

// ==========================================
// List & read queries
// ==========================================

/**
 * Find an RFQ by ID with category, city, and creator joins.
 * @param {number} id - RFQ ID
 * @returns {Promise<Object|undefined>}
 */
const findRfqById = (id) =>
  db('rfqs')
    .leftJoin('categories', 'rfqs.category_id', '=', 'categories.id')
    .leftJoin('cities', 'rfqs.city_id', '=', 'cities.id')
    .leftJoin('users', 'rfqs.user_id', '=', 'users.id')
    .where('rfqs.id', id)
    .whereNull('rfqs.deleted_at')
    .select(
      'rfqs.*',
      'categories.name as category',
      'cities.name as city',
      'users.full_name as creator_name'
    )
    .first();

/**
 * Paginated list of RFQs with optional filters.
 * @param {Object} [filters] - Query filters (q, category_id, city_id, user_id, is_active, page, limit)
 * @returns {Promise<Object>}
 */
const findRfqs = async (filters = {}) => {
  const q = db('rfqs')
    .leftJoin('categories', 'rfqs.category_id', '=', 'categories.id')
    .leftJoin('cities', 'rfqs.city_id', '=', 'cities.id')
    .whereNull('rfqs.deleted_at')
    .select(
      'rfqs.id',
      'rfqs.title',
      'categories.name as category',
      'cities.name as city',
      'rfqs.created_at'
    );

  if (filters.q) {
    q.where('rfqs.title', 'like', `%${filters.q}%`);
  }

  if (filters.category_id) {
    q.where('rfqs.category_id', filters.category_id);
  }

  if (filters.city_id) {
    q.where('rfqs.city_id', filters.city_id);
  }

  if (filters.user_id) {
    q.where('rfqs.user_id', filters.user_id);
  }

  if (filters.is_active !== undefined) {
    q.where('rfqs.is_active', filters.is_active);
  }

  q.orderBy('rfqs.created_at', 'desc');

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  return paginate(q, page, limit);
};

// ==========================================
// Create & update
// ==========================================

/**
 * Insert a new RFQ for the authenticated user.
 * @param {Object} data - RFQ creation payload
 * @param {number} userId - Creator user ID
 * @returns {Promise<Object>}
 */
const createRfq = async (data, userId) => {
  const payload = {
    title: data.title,
    category_id: data.category_id,
    city_id: data.city_id,
    user_id: userId,
    description: data.description || null,
    quantity: data.quantity !== undefined ? data.quantity : null,
    budget: data.budget !== undefined ? data.budget : null,
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_by: userId,
  };

  const [id] = await db('rfqs').insert(payload);
  return findRfqById(id);
};

/**
 * Update an existing RFQ by ID.
 * @param {number} id - RFQ ID
 * @param {Object} data - Fields to update
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<Object>}
 */
const updateRfq = async (id, data, userId = null) => {
  const payload = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.category_id !== undefined) payload.category_id = data.category_id;
  if (data.city_id !== undefined) payload.city_id = data.city_id;
  if (data.description !== undefined) payload.description = data.description;
  if (data.quantity !== undefined) payload.quantity = data.quantity;
  if (data.budget !== undefined) payload.budget = data.budget;
  if (data.is_active !== undefined) payload.is_active = data.is_active;

  if (Object.keys(payload).length === 0) return findRfqById(id);

  if (userId) {
    payload.updated_by = userId;
  }
  payload.updated_at = db.fn.now();

  await db('rfqs').where({ id }).update(payload);
  return findRfqById(id);
};

// ==========================================
// Delete (soft)
// ==========================================

/**
 * Soft-delete an RFQ by ID.
 * @param {number} id - RFQ ID
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<void>}
 */
const deleteRfq = async (id, userId = null) => {
  const updatePayload = {
    deleted_at: db.fn.now(),
  };
  if (userId) {
    updatePayload.updated_by = userId;
  }
  await db('rfqs').where({ id }).update(updatePayload);
};

module.exports = {
  findRfqById,
  findRfqs,
  createRfq,
  updateRfq,
  deleteRfq,
};
