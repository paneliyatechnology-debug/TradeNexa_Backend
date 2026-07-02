const db = require('../database/knex');
const { paginate } = require('../utils/pagination');

// ==========================================
// List & read queries
// ==========================================

/**
 * Find an offer by ID (non-deleted).
 * @param {number} id - Offer ID
 * @returns {Promise<Object|undefined>}
 */
const findOfferById = (id) =>
  db('offers').where({ id }).whereNull('deleted_at').first();

/**
 * Paginated list of offers; excludes expired offers unless include_expired is set.
 * @param {Object} [filters] - Query filters (is_active, include_expired, page, limit)
 * @returns {Promise<Object>}
 */
const findOffers = async (filters = {}) => {
  const q = db('offers').whereNull('deleted_at');

  if (filters.is_active !== undefined) {
    q.where('is_active', filters.is_active);
  }

  // Offer listing typically requires non-expired offers
  if (filters.include_expired !== 'true') {
    q.where('expiry_date', '>', db.fn.now());
  }

  q.orderBy('offers.id', 'desc');

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  return paginate(q, page, limit);
};

// ==========================================
// Create & update
// ==========================================

/**
 * Insert a new offer.
 * @param {Object} data - Offer creation payload
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<Object>}
 */
const createOffer = async (data, userId = null) => {
  const payload = {
    title: data.title,
    banner: data.banner,
    discount: data.discount,
    expiry_date: new Date(data.expiry_date),
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_by: userId,
  };

  const [id] = await db('offers').insert(payload);
  return findOfferById(id);
};

/**
 * Update an existing offer by ID.
 * @param {number} id - Offer ID
 * @param {Object} data - Fields to update
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<Object>}
 */
const updateOffer = async (id, data, userId = null) => {
  const payload = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.banner !== undefined) payload.banner = data.banner;
  if (data.discount !== undefined) payload.discount = data.discount;
  if (data.expiry_date !== undefined) payload.expiry_date = new Date(data.expiry_date);
  if (data.is_active !== undefined) payload.is_active = data.is_active;

  if (Object.keys(payload).length === 0) return findOfferById(id);

  payload.updated_by = userId;
  payload.updated_at = db.fn.now();

  await db('offers').where({ id }).update(payload);
  return findOfferById(id);
};

// ==========================================
// Delete (soft)
// ==========================================

/**
 * Soft-delete an offer by ID.
 * @param {number} id - Offer ID
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<void>}
 */
const deleteOffer = async (id, userId = null) => {
  await db('offers')
    .where({ id })
    .update({
      deleted_at: db.fn.now(),
      updated_by: userId,
    });
};

module.exports = {
  findOfferById,
  findOffers,
  createOffer,
  updateOffer,
  deleteOffer,
};
