/**
 * Shared list query helpers — sorting used by paginated list endpoints.
 */

// ==========================================
// Sort helpers
// ==========================================

/**
 * Apply field-wise sort to a Knex query (default: id desc).
 * @param {Object} q - Knex query builder
 * @param {Object} filters - Request filters (sort_by, sort_order)
 * @param {Object} sortFieldMap - Allowed sort_by key → DB column
 * @param {{ defaultSortBy?: string, defaultSortOrder?: 'asc'|'desc' }} [options]
 */
const applyListSort = (q, filters, sortFieldMap, { defaultSortBy = 'id', defaultSortOrder = 'desc' } = {}) => {
  const sortBy = filters.sort_by && sortFieldMap[filters.sort_by] ? filters.sort_by : defaultSortBy;
  const sortOrder = filters.sort_order === 'asc' ? 'asc' : filters.sort_order === 'desc' ? 'desc' : defaultSortOrder;
  q.orderBy(sortFieldMap[sortBy], sortOrder);
};

module.exports = {
  applyListSort,
};
