/**
 * Offer data access — CRUD and banner media path updates.
 */
const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { resolveMediaUrl } = require('../utils/media');
const { applyListSort } = require('../utils/listQuery');

const OFFER_SORT_FIELDS = {
  id: 'offers.id',
  title: 'offers.title',
  discount: 'offers.discount',
  expiry_date: 'offers.expiry_date',
  is_active: 'offers.is_active',
  created_at: 'offers.created_at',
};

// ==========================================
// Formatting helpers
// ==========================================

/** Format an offer row for API responses (resolves banner URL). */
const formatRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    banner: row.banner ? resolveMediaUrl(row.banner) : null,
    discount: row.discount !== undefined && row.discount !== null ? parseFloat(row.discount) : undefined,
    is_active: row.is_active !== undefined ? !!row.is_active : undefined,
  };
};

// ==========================================
// List & read queries
// ==========================================

const findOfferById = async (id, options = {}) => {
  const row = await db('offers').where({ id }).whereNull('deleted_at').first();
  if (!row || options.raw) return row;
  return formatRow(row);
};

const findOffers = async (filters = {}) => {
  const q = db('offers').whereNull('deleted_at');

  if (filters.search) {
    q.where('offers.title', 'like', `%${filters.search}%`);
  }

  if (filters.is_active !== undefined) {
    q.where('is_active', filters.is_active);
  }

  // Default: return all offers (including expired). Pass include_expired=false to hide expired.
  if (filters.include_expired === 'false') {
    q.where('expiry_date', '>', db.fn.now());
  }

  applyListSort(q, filters, OFFER_SORT_FIELDS);

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map(formatRow);
  return paginated;
};

// ==========================================
// Write operations
// ==========================================

const createOffer = async (data, userId = null) => {
  const payload = {
    title: data.title,
    banner: data.banner || '',
    discount: data.discount,
    expiry_date: new Date(data.expiry_date),
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_by: userId,
  };

  const [id] = await db('offers').insert(payload);
  return db('offers').where({ id }).whereNull('deleted_at').first();
};

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

/** Apply banner path updates after file upload (create inbox move or update direct). */
const applyOfferMediaUpdates = async (id, updates, userId = null) => {
  if (!updates || !Object.keys(updates).length) {
    return db('offers').where({ id }).whereNull('deleted_at').first();
  }

  await db('offers')
    .where({ id })
    .update({
      ...updates,
      updated_by: userId,
      updated_at: db.fn.now(),
    });

  return db('offers').where({ id }).whereNull('deleted_at').first();
};

const deleteOffer = async (id, userId = null) => {
  await db('offers')
    .where({ id })
    .update({
      deleted_at: db.fn.now(),
      updated_by: userId,
    });
};

module.exports = {
  formatRow,
  findOfferById,
  findOffers,
  createOffer,
  updateOffer,
  applyOfferMediaUpdates,
  deleteOffer,
};
