const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { applyListSort } = require('../utils/listQuery');

const ROLE_SORT_FIELDS = {
  id: 'roles.id',
  name: 'roles.name',
  code: 'roles.code',
  is_active: 'roles.is_active',
  created_at: 'roles.created_at',
};

// ==========================================
// List & read queries
// ==========================================

/**
 * Paginated list of roles with search, filters, and sorting.
 * @param {Object} [filters] - search, is_active, page, limit, sort_by, sort_order
 * @returns {Promise<Object>}
 */
const findRoles = async (filters = {}) => {
  const q = db('roles').select('id', 'code', 'name', 'description', 'is_active', 'created_at', 'updated_at');

  if (filters.search) {
    q.where(function () {
      this.where('roles.name', 'like', `%${filters.search}%`).orWhere('roles.code', 'like', `%${filters.search}%`);
    });
  }

  if (filters.is_active !== undefined) {
    q.where('roles.is_active', filters.is_active);
  } else {
    q.where('roles.is_active', true);
  }

  applyListSort(q, filters, ROLE_SORT_FIELDS);

  return paginate(q, filters.page, filters.limit);
};

/** @deprecated Use findRoles — kept for backward compatibility. */
const findAll = async () => {
  const data = await findRoles({ page: 1, limit: 100 });
  return data.results;
};

module.exports = {
  findAll,
  findRoles,
};
