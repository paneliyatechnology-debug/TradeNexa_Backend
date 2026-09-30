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
 * Ensure default business types exist in the database if the table is empty.
 */
const ensureDefaultBusinessTypes = async () => {
  try {
    const countRow = await db('business_types').count('id as cnt').first();
    const count = Number(countRow?.cnt || 0);
    if (count > 0) return;

    let buyerRole = await db('roles').where({ code: 'buyer' }).first();
    let sellerRole = await db('roles').where({ code: 'seller' }).first();
    let buyerSellerRole = await db('roles').where({ code: 'buyer_seller' }).first();

    // If roles don't exist yet, seed standard roles
    if (!buyerRole || !sellerRole) {
      const defaultRoles = [
        { id: 1, code: 'super_admin', name: 'Super Admin', description: 'Super Administrator', is_active: 1 },
        { id: 2, code: 'buyer', name: 'Buyer', description: 'Buyer', is_active: 1 },
        { id: 3, code: 'seller', name: 'Seller', description: 'Seller', is_active: 1 },
        { id: 4, code: 'buyer_seller', name: 'Buyer + Seller', description: 'Buyer and Seller', is_active: 1 },
        { id: 5, code: 'admin', name: 'Admin', description: 'Admin', is_active: 1 },
      ];
      for (const r of defaultRoles) {
        const exists = await db('roles').where({ id: r.id }).first();
        if (!exists) {
          try {
            await db('roles').insert(r);
          } catch {}
        }
      }
      buyerRole = await db('roles').where({ code: 'buyer' }).first();
      sellerRole = await db('roles').where({ code: 'seller' }).first();
      buyerSellerRole = await db('roles').where({ code: 'buyer_seller' }).first();
    }

    const BUYER_TYPES = [
      'Retailer',
      'Wholesaler',
      'Distributor',
      'Trader',
      'Importer',
      'Contractor',
      'Service Provider',
      'Corporate Company',
      'Startup',
    ];

    const SELLER_TYPES = [
      'Manufacturer',
      'Wholesaler',
      'Distributor',
      'Exporter',
      'Importer',
      'Supplier',
      'Dealer',
      'Trader',
      'Brand Owner',
    ];

    const BUYER_SELLER_TYPES = Array.from(new Set([...BUYER_TYPES, ...SELLER_TYPES]));

    const rows = [
      ...(buyerRole ? BUYER_TYPES.map((name) => ({ name, code: slugify(name), role_id: buyerRole.id, is_active: true })) : []),
      ...(sellerRole ? SELLER_TYPES.map((name) => ({ name, code: slugify(name), role_id: sellerRole.id, is_active: true })) : []),
      ...(buyerSellerRole ? BUYER_SELLER_TYPES.map((name) => ({ name, code: slugify(name), role_id: buyerSellerRole.id, is_active: true })) : []),
    ];

    if (rows.length > 0) {
      await db('business_types').insert(rows);
    }
  } catch (err) {
    console.warn('[BusinessType] Failed to auto-initialize default business types:', err.message);
  }
};

/**
 * List business types with optional role, search, filters, and sorting.
 * @param {Object} [filters] - role_id, search, is_active, page, limit, sort_by, sort_order
 * @returns {Promise<Object>}
 */
const findBusinessTypes = async (filters = {}) => {
  await ensureDefaultBusinessTypes();
  const q = baseQuery();

  if (filters.role_id !== undefined && filters.role_id !== null && filters.role_id !== 'all') {
    const numericRoleId = parseInt(filters.role_id, 10);
    const role = await db('roles').where({ id: numericRoleId }).first();

    if (!role) {
      // Fallback: search directly by numeric role_id
      q.where('business_types.role_id', numericRoleId);
    } else if (filters.exact_role) {
      q.where('business_types.role_id', role.id);
    } else {
      const buyerSellerRole = await db('roles').where({ code: 'buyer_seller' }).first();
      const buyerRole = await db('roles').where({ code: 'buyer' }).first();
      const sellerRole = await db('roles').where({ code: 'seller' }).first();

      if (role.code === 'buyer') {
        const allowedRoleIds = [role.id];
        if (buyerSellerRole) allowedRoleIds.push(buyerSellerRole.id);
        q.whereIn('business_types.role_id', allowedRoleIds);
      } else if (role.code === 'seller') {
        const allowedRoleIds = [role.id];
        if (buyerSellerRole) allowedRoleIds.push(buyerSellerRole.id);
        q.whereIn('business_types.role_id', allowedRoleIds);
      } else if (role.code === 'buyer_seller' || role.code === 'both') {
        const allowedRoleIds = [role.id];
        if (buyerRole) allowedRoleIds.push(buyerRole.id);
        if (sellerRole) allowedRoleIds.push(sellerRole.id);
        q.whereIn('business_types.role_id', allowedRoleIds);
      } else {
        q.where('business_types.role_id', role.id);
      }
    }
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

  // If table is completely empty, insert the first record with ID 0
  const countRow = await db('business_types').count('id as cnt').first();
  const count = Number(countRow?.cnt || 0);

  if (count === 0) {
    try {
      await db.raw("SET sql_mode = 'NO_AUTO_VALUE_ON_ZERO';");
      await db('business_types').insert({
        id: 0,
        name: data.name.trim(),
        code,
        role_id: data.role_id,
        is_active: data.is_active !== undefined ? data.is_active : true,
      });
      return findById(0);
    } catch {
      // Fallback to default auto-increment if engine rejects 0
    }
  }

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

/**
 * Bulk delete business types by ID array.
 * Cleans up references in users and company_details, then deletes the records.
 * @param {number[]} ids
 * @returns {Promise<number>} Number of deleted rows
 */
const deleteMany = async (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) return 0;

  await db('company_details').whereIn('business_type_id', ids).update({ business_type_id: null });
  await db('users').whereIn('business_type_id', ids).update({ business_type_id: null });

  return db('business_types').whereIn('id', ids).del();
};

/**
 * Delete all business types and reset auto_increment counter.
 * @returns {Promise<number>} Number of deleted rows
 */
const deleteAll = async () => {
  await db('company_details').update({ business_type_id: null });
  await db('users').update({ business_type_id: null });

  const count = await db('business_types').del();
  try {
    await db.raw('ALTER TABLE business_types AUTO_INCREMENT = 0');
  } catch (err) {
    // Ignored if unsupported dialect
  }
  return count;
};

module.exports = {
  findById,
  findByRoleId,
  findBusinessTypes,
  isValidForRole,
  create,
  update,
  softDelete,
  deleteMany,
  deleteAll,
  ensureDefaultBusinessTypes,
};

