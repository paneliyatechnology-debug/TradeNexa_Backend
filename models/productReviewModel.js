/**
 * Product review history data access — append-only moderation audit trail.
 *
 * Rows are never updated or deleted; each status change inserts a new record.
 */
const db = require('../database/knex');
const { paginate } = require('../utils/pagination');

// ==========================================
// Write
// ==========================================

/**
 * Insert one review history row (append-only).
 * @param {Object} data
 * @param {number} data.productId
 * @param {number} data.reviewVersion
 * @param {string} data.action - submitted | resubmitted | approved | revision_required | rejected
 * @param {string|null} [data.fromStatus]
 * @param {string} data.toStatus
 * @param {string|null} [data.remarks]
 * @param {number|null} [data.actorId]
 * @param {string|null} [data.actorRole]
 * @param {Object|null} [data.metadata]
 * @param {import('knex').Knex|null} [trx]
 * @returns {Promise<number>} Inserted history id
 */
const createReviewHistory = async (
  {
    productId,
    reviewVersion,
    action,
    fromStatus = null,
    toStatus,
    remarks = null,
    actorId = null,
    actorRole = null,
    metadata = null,
  },
  trx = null,
) => {
  const client = trx || db;
  const [id] = await client('product_review_history').insert({
    product_id: productId,
    review_version: reviewVersion,
    action,
    from_status: fromStatus,
    to_status: toStatus,
    remarks,
    actor_id: actorId,
    actor_role: actorRole,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
  return id;
};

// ==========================================
// Read
// ==========================================

/**
 * Paginated review history for a product (newest first).
 * @param {number} productId
 * @param {Object} [filters] - page, limit
 * @returns {Promise<{ results: Array, pagination: Object }>}
 */
const listByProductId = async (productId, filters = {}) => {
  const q = db('product_review_history')
    .leftJoin('users as actors', 'product_review_history.actor_id', '=', 'actors.id')
    .where('product_review_history.product_id', productId)
    .select(
      'product_review_history.id',
      'product_review_history.product_id',
      'product_review_history.review_version',
      'product_review_history.action',
      'product_review_history.from_status',
      'product_review_history.to_status',
      'product_review_history.remarks',
      'product_review_history.actor_id',
      'product_review_history.actor_role',
      'product_review_history.metadata',
      'product_review_history.created_at',
      'actors.full_name as actor_name',
    )
    .orderBy('product_review_history.id', 'desc');

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 20;
  const paginated = await paginate(q, page, limit);

  paginated.results = paginated.results.map((row) => {
    let metadata = row.metadata;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = null;
      }
    }
    return {
      id: row.id,
      product_id: row.product_id,
      review_version: row.review_version,
      action: row.action,
      from_status: row.from_status,
      to_status: row.to_status,
      remarks: row.remarks,
      actor_id: row.actor_id,
      actor_role: row.actor_role,
      actor_name: row.actor_name ?? null,
      metadata: metadata ?? null,
      created_at: row.created_at,
    };
  });

  return paginated;
};

module.exports = {
  createReviewHistory,
  listByProductId,
};
