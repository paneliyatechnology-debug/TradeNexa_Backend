const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { ROLE_CODES } = require('../constants');
const { applyListSort } = require('../utils/listQuery');

const BUSINESS_TYPE_SORT_FIELDS = {
  id: 'business_types.id',
  name: 'business_types.name',
  code: 'business_types.code',
  is_active: 'business_types.is_active',
  created_at: 'business_types.created_at',
};

// ==========================================
// Formatting helpers
// ==========================================

/** Convert a business type name to a snake_case code. */
const slugify = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

// ==========================================
// Query helpers
// ==========================================

/** Base query joining business_types with their associated role. */
const baseQuery = () =>
  db('business_types')
    .join('roles', 'business_types.role_id', 'roles.id')
    .select(
      'business_types.id',
      'business_types.name',
      'business_types.code',
      'business_types.role_id',
      'business_types.is_active',
      'business_types.created_at',
      'business_types.updated_at',
      'roles.code as role_code',
      'roles.name as role_name',
    );

// ==========================================
// Lookups & guards
// ==========================================

/**
 * Find a business type by ID with role details.
 * @param {number} id - Business type ID
 * @returns {Promise<Object|undefined>}
 */
const findById = (id) => baseQuery().where('business_types.id', id).first();

/**
 * List business types with optional role, search, filters, and sorting.
 * @param {Object} [filters] - role_id, search, is_active, page, limit, sort_by, sort_order
 * @returns {Promise<Object>}
 */
const findBusinessTypes = async (filters = {}) => {
  const q = baseQuery();

  if (filters.role_id) {
    const role = await db('roles').where({ id: filters.role_id, is_active: true }).first();
    if (!role) {
      return paginate(db('business_types').whereRaw('1 = 0'), filters.page, filters.limit);
    }
    q.where('business_types.role_id', filters.role_id);
  }

  if (filters.search) {
    q.where('business_types.name', 'like', `%${filters.search}%`);
  }

  if (filters.is_active !== undefined) {
    q.where('business_types.is_active', filters.is_active);
  }

  applyListSort(q, filters, BUSINESS_TYPE_SORT_FIELDS);

  return paginate(q, filters.page, filters.limit);
};

/**
 * List business types for a given role.
 * @param {number} roleId - Role ID
 * @param {boolean} [isActive=true] - Filter by active status; pass undefined to skip filter
 * @returns {Promise<Array>}
 */
const findByRoleId = async (roleId, isActive = true) => {
  const data = await findBusinessTypes({
    role_id: roleId,
    is_active: isActive,
    page: 1,
    limit: 100,
  });
  return data.results;
};

/**
 * Check whether a business type is active and belongs to the given role.
 * @param {number} businessTypeId - Business type ID
 * @param {number} roleId - Role ID
 * @returns {Promise<boolean>}
 */
const isValidForRole = async (businessTypeId, roleId) => {
  const type = await findById(businessTypeId);
  if (!type || !type.is_active) return false;

  return type.role_id === roleId;
};

// ==========================================
// Create & update
// ==========================================

/**
 * Insert a new business type linked to a buyer/seller role.
 * @param {Object} data - Creation payload (name, code, role_id, is_active)
 * @returns {Promise<Object>}
 */
const create = async (data) => {
  const role = await db('roles').where({ id: data.role_id, is_active: true }).first();
  if (!role) throw new Error('INVALID_ROLE');
  if (![ROLE_CODES.BUYER, ROLE_CODES.SELLER, ROLE_CODES.BUYER_SELLER].includes(role.code)) {
    throw new Error('INVALID_ROLE_FOR_BUSINESS_TYPE');
  }

  const code = data.code ? slugify(data.code) : slugify(data.name);
  const [id] = await db('business_types').insert({
    name: data.name.trim(),
    code,
    role_id: data.role_id,
    is_active: data.is_active !== undefined ? data.is_active : true,
  });

  return findById(id);
};

/**
 * Update an existing business type by ID.
 * @param {number} id - Business type ID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object|null>}
 */
const update = async (id, data) => {
  const existing = await db('business_types').where({ id }).first();
  if (!existing) return null;

  const payload = {};
  if (data.name) payload.name = data.name.trim();
  if (data.code) payload.code = slugify(data.code);
  if (data.is_active !== undefined) payload.is_active = data.is_active;

  if (data.role_id) {
    const role = await db('roles').where({ id: data.role_id, is_active: true }).first();
    if (!role || ![ROLE_CODES.BUYER, ROLE_CODES.SELLER, ROLE_CODES.BUYER_SELLER].includes(role.code)) {
      throw new Error('INVALID_ROLE_FOR_BUSINESS_TYPE');
    }
    payload.role_id = data.role_id;
  }

  if (Object.keys(payload).length) {
    await db('business_types').where({ id }).update(payload);
  }

  return findById(id);
};

// ==========================================
// Delete (soft)
// ==========================================

/**
 * Deactivate a business type (soft delete via is_active = false).
 * @param {number} id - Business type ID
 * @returns {Promise<Object|null>}
 */
const softDelete = async (id) => {
  const existing = await db('business_types').where({ id }).first();
  if (!existing) return null;
  await db('business_types').where({ id }).update({ is_active: false });
  return findById(id);
};

module.exports = {
  findById,
  findByRoleId,
  findBusinessTypes,
  isValidForRole,
  create,
  update,
  softDelete,
};
