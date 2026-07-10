/**
 * Quotation data access — CRUD, compare, and status updates.
 */
const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { applyListSort } = require('../utils/listQuery');
const { resolveMediaUrl } = require('../utils/media');
const { QUOTATION_STATUS } = require('../constants/rfq');

const QUOTATION_SORT_FIELDS = {
  id: 'quotations.id',
  price: 'quotations.price',
  total_amount: 'quotations.total_amount',
  delivery_days: 'quotations.delivery_days',
  created_at: 'quotations.created_at',
};

const formatSellerCompany = (row) => {
  if (!row) return null;
  if (row.company && typeof row.company === 'object') return row.company;
  if (row.company_name == null && row.company_logo == null && row.seller_rating == null) {
    return null;
  }
  return {
    company_name: row.company_name ?? null,
    company_logo: row.company_logo ? resolveMediaUrl(row.company_logo) : null,
    rating:
      row.seller_rating !== undefined && row.seller_rating !== null
        ? parseFloat(row.seller_rating || 0)
        : null,
  };
};

const formatRow = (row) => {
  if (!row) return null;
  const formatted = {
    ...row,
    price: row.price !== undefined ? parseFloat(row.price) : undefined,
    gst_percentage: row.gst_percentage !== undefined ? parseFloat(row.gst_percentage) : undefined,
    gst_amount: row.gst_amount !== undefined ? parseFloat(row.gst_amount) : undefined,
    transportation_charge:
      row.transportation_charge !== undefined ? parseFloat(row.transportation_charge) : undefined,
    total_amount: row.total_amount !== undefined ? parseFloat(row.total_amount) : undefined,
    attachment: row.attachment ? resolveMediaUrl(row.attachment) : null,
    seller_rating: row.seller_rating !== undefined ? parseFloat(row.seller_rating || 0) : undefined,
    user_id: row.seller_id ?? row.user_id ?? undefined,
    company: formatSellerCompany(row),
  };

  delete formatted.company_logo;

  return formatted;
};

const baseQuotationQuery = () =>
  db('quotations')
    .leftJoin('users', 'quotations.seller_id', '=', 'users.id')
    .leftJoin('company_details', 'users.id', '=', 'company_details.user_id');

const SELLER_COMPANY_SELECT = [
  'users.full_name as seller_name',
  'company_details.company_name',
  'company_details.rating as seller_rating',
  db.raw('COALESCE(company_details.company_logo, users.profile_image) as company_logo'),
];

const applyQuotationFilters = (q, filters = {}, { searchMode = 'seller' } = {}) => {
  if (filters.status) q.where('quotations.status', filters.status);
  if (filters.rfq_id) q.where('quotations.rfq_id', filters.rfq_id);
  if (filters.seller_id) q.where('quotations.seller_id', filters.seller_id);
  if (!filters.search) return;

  const term = `%${filters.search}%`;
  q.where(function () {
    if (searchMode === 'seller' || searchMode === 'all') {
      this.where('users.full_name', 'like', term)
        .orWhere('company_details.company_name', 'like', term)
        .orWhere('quotations.quotation_number', 'like', term);
    }
    if (searchMode === 'rfq' || searchMode === 'all') {
      this.orWhere('rfqs.title', 'like', term).orWhere('rfqs.rfq_number', 'like', term);
    }
  });
};

const findById = async (id, options = {}) => {
  const row = await baseQuotationQuery()
    .where('quotations.id', id)
    .select('quotations.*', ...SELLER_COMPANY_SELECT)
    .first();

  if (!row || options.raw) return row;
  return formatRow(row);
};

const findByRfqAndSeller = (rfqId, sellerId) =>
  db('quotations').where({ rfq_id: rfqId, seller_id: sellerId }).first();

/**
 * List quotations for an RFQ.
 * @param {number} rfqId
 * @param {Object} [filters]
 * @param {boolean} [filters.paginate=true] - When false, returns a plain array (detail embeds).
 */
const findByRfqId = async (rfqId, filters = {}) => {
  const q = baseQuotationQuery()
    .where('quotations.rfq_id', rfqId)
    .select('quotations.*', ...SELLER_COMPANY_SELECT);

  applyQuotationFilters(q, filters);
  applyListSort(q, filters, QUOTATION_SORT_FIELDS);

  if (filters.paginate === false) {
    const rows = await q;
    return rows.map(formatRow);
  }

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map(formatRow);
  return paginated;
};

const findSellerQuotations = async (sellerId, filters = {}) => {
  const q = baseQuotationQuery()
    .leftJoin('rfqs', 'quotations.rfq_id', '=', 'rfqs.id')
    .where('quotations.seller_id', sellerId)
    .whereNull('rfqs.deleted_at')
    .select(
      'quotations.*',
      'rfqs.title as rfq_title',
      'rfqs.rfq_number',
      'rfqs.status as rfq_status',
      ...SELLER_COMPANY_SELECT,
    );

  applyQuotationFilters(q, filters, { searchMode: 'rfq' });
  applyListSort(q, filters, QUOTATION_SORT_FIELDS);

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map(formatRow);
  return paginated;
};

const findAllQuotations = async (filters = {}) => {
  const q = baseQuotationQuery()
    .leftJoin('rfqs', 'quotations.rfq_id', '=', 'rfqs.id')
    .whereNull('rfqs.deleted_at')
    .select(
      'quotations.*',
      'rfqs.title as rfq_title',
      'rfqs.rfq_number',
      ...SELLER_COMPANY_SELECT,
    );

  applyQuotationFilters(q, filters, { searchMode: 'all' });
  applyListSort(q, filters, QUOTATION_SORT_FIELDS);

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map(formatRow);
  return paginated;
};

const compareByRfqId = async (rfqId) => {
  const rows = await baseQuotationQuery()
    .where('quotations.rfq_id', rfqId)
    .whereNotIn('quotations.status', [QUOTATION_STATUS.WITHDRAWN, QUOTATION_STATUS.EXPIRED])
    .select(
      'quotations.id',
      'quotations.quotation_number',
      'quotations.seller_id',
      'quotations.price',
      'quotations.gst_percentage',
      'quotations.gst_amount',
      'quotations.transportation_charge',
      'quotations.total_amount',
      'quotations.delivery_days',
      'quotations.status',
      'quotations.created_at',
      ...SELLER_COMPANY_SELECT,
      'rfq_sellers.responded_at',
    )
    .leftJoin('rfq_sellers', function () {
      this.on('rfq_sellers.rfq_id', '=', 'quotations.rfq_id').andOn(
        'rfq_sellers.seller_id',
        '=',
        'quotations.seller_id',
      );
    })
    .orderBy('quotations.total_amount', 'asc');

  return rows.map((row) => ({
    quotation_id: row.id,
    quotation_number: row.quotation_number,
    seller_id: row.seller_id,
    user_id: row.seller_id,
    seller_name: row.seller_name || row.company_name,
    company: formatSellerCompany(row),
    price: parseFloat(row.price),
    gst_percentage: parseFloat(row.gst_percentage || 0),
    gst_amount: parseFloat(row.gst_amount || 0),
    transportation_charge: parseFloat(row.transportation_charge || 0),
    total_amount: parseFloat(row.total_amount),
    delivery_days: row.delivery_days,
    seller_rating: parseFloat(row.seller_rating || 0),
    response_time: row.responded_at,
    status: row.status,
  }));
};

const createQuotation = async (data, trx = null) => {
  const client = trx || db;
  const [id] = await client('quotations').insert(data);
  return client('quotations').where({ id }).first();
};

const updateQuotation = async (id, data, trx = null) => {
  const client = trx || db;
  await client('quotations').where({ id }).update({ ...data, updated_at: client.fn.now() });
  return client('quotations').where({ id }).first();
};

const rejectOthersExcept = async (rfqId, acceptedId, trx = null) => {
  const client = trx || db;
  await client('quotations')
    .where({ rfq_id: rfqId })
    .whereNot({ id: acceptedId })
    .whereNotIn('status', [QUOTATION_STATUS.WITHDRAWN, QUOTATION_STATUS.REJECTED])
    .update({ status: QUOTATION_STATUS.REJECTED, updated_at: client.fn.now() });
};

module.exports = {
  formatRow,
  findById,
  findByRfqAndSeller,
  findByRfqId,
  findSellerQuotations,
  findAllQuotations,
  compareByRfqId,
  createQuotation,
  updateQuotation,
  rejectOthersExcept,
};
