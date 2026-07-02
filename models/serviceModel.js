const db = require('../database/knex');

// ==========================================
// List & read queries
// ==========================================

/**
 * Find a service by ID (non-deleted).
 * @param {number} id - Service ID
 * @returns {Promise<Object|undefined>}
 */
const findServiceById = (id) =>
  db('services').where({ id }).whereNull('deleted_at').first();

/**
 * List services with optional search and status filters, ordered by name.
 * @param {Object} [filters] - Query filters (q, is_active)
 * @returns {Promise<Object>}
 */
const findServices = async (filters = {}) => {
  const q = db('services').whereNull('deleted_at');

  if (filters.q) {
    q.where('name', 'like', `%${filters.q}%`);
  }

  if (filters.is_active !== undefined) {
    q.where('is_active', filters.is_active);
  }

  q.orderBy('services.id', 'desc');

  return q;
};

// ==========================================
// Create & update
// ==========================================

/**
 * Insert a new service.
 * @param {Object} data - Service creation payload
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<Object>}
 */
const createService = async (data, userId = null) => {
  const payload = {
    name: data.name,
    icon: data.icon || null,
    description: data.description || null,
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_by: userId,
  };

  const [id] = await db('services').insert(payload);
  return findServiceById(id);
};

/**
 * Update an existing service by ID.
 * @param {number} id - Service ID
 * @param {Object} data - Fields to update
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<Object>}
 */
const updateService = async (id, data, userId = null) => {
  const payload = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.icon !== undefined) payload.icon = data.icon;
  if (data.description !== undefined) payload.description = data.description;
  if (data.is_active !== undefined) payload.is_active = data.is_active;

  if (Object.keys(payload).length === 0) return findServiceById(id);

  payload.updated_by = userId;
  payload.updated_at = db.fn.now();

  await db('services').where({ id }).update(payload);
  return findServiceById(id);
};

// ==========================================
// Delete (soft)
// ==========================================

/**
 * Soft-delete a service by ID.
 * @param {number} id - Service ID
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<void>}
 */
const deleteService = async (id, userId = null) => {
  await db('services')
    .where({ id })
    .update({
      deleted_at: db.fn.now(),
      updated_by: userId,
    });
};

module.exports = {
  findServiceById,
  findServices,
  createService,
  updateService,
  deleteService,
};
