/**
 * Knex query pagination utility.
 *
 * Applies limit/offset and returns results with total count metadata.
 */

// ==========================================
// Pagination
// ==========================================

/**
 * Paginate a Knex query builder.
 * @param {Object} queryBuilder - Knex query builder
 * @param {number} [page] - Current page number
 * @param {number} [limit] - Number of records per page
 * @returns {Promise<{ results: Array, pagination: { total: number, page: number, limit: number, totalPages: number } }>}
 */
const paginate = async (queryBuilder, page = 1, limit = 10) => {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
  const offset = (p - 1) * l;

  // Clone queryBuilder for total count calculation
  const countQuery = queryBuilder.clone();
  
  // We strip any select/groupby/order for counts, but Knex clone + count works best if we wrap it in a subquery
  // or clean select to count correctly. Let's do a subquery count to support complex joins and groupings.
  const db = require('../database/knex');
  const countResult = await db.count('* as total').from(countQuery.as('subquery'));
  const total = countResult[0] ? countResult[0].total : 0;

  const results = await queryBuilder.limit(l).offset(offset);

  return {
    results,
    pagination: {
      total: parseInt(total, 10),
      page: p,
      limit: l,
      totalPages: Math.ceil(total / l),
    },
  };
};

module.exports = { paginate };
