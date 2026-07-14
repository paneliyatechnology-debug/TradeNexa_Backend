/**
 * Inquiry quotation data access — at most one active quote row per inquiry.
 *
 * Withdrawn quotes may be overwritten in place when the seller re-submits.
 */
const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { applyListSort } = require('../utils/listQuery');
const { resolveMediaUrl } = require('../utils/media');
const { INQUIRY_QUOTATION_SORT_BY_VALUES } = require('../constants/inquiry');

// ==========================================
// Sort configuration
// ==========================================

const SORT_MAP = {
  id: 'inquiry_quotations.id',
  price: 'inquiry_quotations.price',
  total_amount: 'inquiry_quotations.total_amount',
  delivery_days: 'inquiry_quotations.delivery_days',
  created_at: 'inquiry_quotations.created_at',
};

// ==========================================
// Formatting helpers
// ==========================================

const formatRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    price: row.price !== undefined ? parseFloat(row.price) : undefined,
    gst_percentage: row.gst_percentage !== undefined ? parseFloat(row.gst_percentage) : undefined,
    gst_amount: row.gst_amount !== undefined ? parseFloat(row.gst_amount) : undefined,
    transportation_charge:
      row.transportation_charge !== undefined ? parseFloat(row.transportation_charge) : undefined,
    total_amount: row.total_amount !== undefined ? parseFloat(row.total_amount) : undefined,
    attachment: row.attachment ? resolveMediaUrl(row.attachment) : null,
    seller_name: row.seller_name || null,
    company_name: row.company_name || null,
  };
};

// ==========================================
// Query builders
// ==========================================

const baseQuery = () =>
  db('inquiry_quotations')
    .leftJoin('users', 'inquiry_quotations.seller_id', '=', 'users.id')
    .leftJoin('company_details', 'users.id', '=', 'company_details.user_id')
    .select(
      'inquiry_quotations.*',
      'users.full_name as seller_name',
      'company_details.company_name',
    );

// ==========================================
// Read operations
// ==========================================

/**
 * @param {number} id
 * @param {{ raw?: boolean }} [options]
 */
const findById = async (id, { raw = false } = {}) => {
  const row = await baseQuery().where('inquiry_quotations.id', id).first();
  if (!row || raw) return row || null;
  return formatRow(row);
};

/**
 * Single quotation for an inquiry (unique inquiry_id).
 * @param {number} inquiryId
 * @param {{ raw?: boolean }} [options]
 */
const findByInquiryId = async (inquiryId, { raw = false } = {}) => {
  const row = await baseQuery().where('inquiry_quotations.inquiry_id', inquiryId).first();
  if (!row || raw) return row || null;
  return formatRow(row);
};

/** Paginated list of quotes submitted by a seller. */
const listBySeller = async (sellerId, filters = {}) => {
  const q = baseQuery()
    .leftJoin('inquiries', 'inquiry_quotations.inquiry_id', '=', 'inquiries.id')
    .where('inquiry_quotations.seller_id', sellerId)
    .whereNull('inquiries.deleted_at')
    .select(
      'inquiry_quotations.*',
      'users.full_name as seller_name',
      'company_details.company_name',
      'inquiries.inquiry_number',
      'inquiries.status as inquiry_status',
      'inquiries.product_id',
    );

  if (filters.status) q.where('inquiry_quotations.status', filters.status);
  if (filters.inquiry_id) q.where('inquiry_quotations.inquiry_id', filters.inquiry_id);

  applyListSort(q, filters, SORT_MAP, {
    defaultSortBy: 'created_at',
    defaultSortOrder: 'desc',
    allowedSortBy: INQUIRY_QUOTATION_SORT_BY_VALUES,
  });

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map(formatRow);
  return paginated;
};

// ==========================================
// Write operations
// ==========================================

/**
 * @param {Object} data
 * @param {Object|null} [trx]
 */
const createQuotation = async (data, trx = null) => {
  const client = trx || db;
  const [id] = await client('inquiry_quotations').insert(data);
  return client('inquiry_quotations').where({ id }).first();
};

/**
 * @param {number} id
 * @param {Object} data
 * @param {Object|null} [trx]
 */
const updateQuotation = async (id, data, trx = null) => {
  const client = trx || db;
  await client('inquiry_quotations')
    .where({ id })
    .update({ ...data, updated_at: client.fn.now() });
  return client('inquiry_quotations').where({ id }).first();
};

module.exports = {
  formatRow,
  findById,
  findByInquiryId,
  listBySeller,
  createQuotation,
  updateQuotation,
};
