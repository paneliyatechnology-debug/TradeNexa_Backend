/**
 * RFQ data access — list filters, detail queries, and lifecycle helpers.
 */
const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { applyListSort } = require('../utils/listQuery');
const { resolveMediaUrl } = require('../utils/media');
const { RFQ_STATUS } = require('../constants/rfq');

const RFQ_SORT_FIELDS = {
  id: 'rfqs.id',
  title: 'rfqs.title',
  created_at: 'rfqs.created_at',
  quotation_deadline: 'rfqs.quotation_deadline',
  expected_price: 'rfqs.expected_price',
  total_quotations: 'rfqs.total_quotations',
  budget: 'rfqs.budget',
  quantity: 'rfqs.quantity',
  category: 'categories.name',
  city: 'rfqs.city',
};

const BUYER_COMPANY_SELECT = [
  'buyers.id as buyer_id',
  'buyers.full_name as buyer_name',
  'buyers.email as buyer_email',
  'buyer_company.company_name',
  'buyer_company.industry',
  'buyer_company.gst_number',
  db.raw('COALESCE(buyer_company.company_logo, buyers.profile_image) as company_logo'),
];

const PRODUCT_LIST_SELECT = [
  'rfqs.product_id',
  'products.name as product_name',
  'products.slug as product_slug',
  'products.thumbnail as product_thumbnail',
  'products.price as product_price',
  'products.currency as product_currency',
  'products.unit as product_unit',
  'products.moq as product_moq',
];

/** Nest buyer company fields (same shape as profile company fields). */
const formatBuyerCompany = (row) => {
  if (!row) return null;
  if (row.company && typeof row.company === 'object') return row.company;
  if (
    row.company_name == null &&
    row.industry == null &&
    row.gst_number == null &&
    row.company_logo == null
  ) {
    return null;
  }
  return {
    company_name: row.company_name ?? null,
    company_logo: row.company_logo ? resolveMediaUrl(row.company_logo) : null,
    industry: row.industry ?? null,
    gst_number: row.gst_number ?? null,
  };
};

/** Nest linked product summary for RFQ list/detail. */
const formatProduct = (row) => {
  if (!row) return null;
  if (row.product && typeof row.product === 'object') return row.product;
  if (row.product_id == null) return null;

  return {
    id: Number(row.product_id),
    name: row.product_name ?? null,
    slug: row.product_slug ?? null,
    thumbnail: row.product_thumbnail ? resolveMediaUrl(row.product_thumbnail) : null,
    price: row.product_price != null ? parseFloat(row.product_price) : null,
    currency: row.product_currency ?? null,
    unit: row.product_unit ?? null,
    moq: row.product_moq != null ? parseInt(row.product_moq, 10) : null,
  };
};

const formatRow = (row) => {
  if (!row) return null;
  const formatted = {
    ...row,
    expected_price:
      row.expected_price !== undefined && row.expected_price !== null
        ? parseFloat(row.expected_price)
        : row.budget !== undefined && row.budget !== null
          ? parseFloat(row.budget)
          : null,
    budget: row.budget !== undefined && row.budget !== null ? parseFloat(row.budget) : undefined,
    quantity: row.quantity !== undefined ? parseInt(row.quantity, 10) : undefined,
    total_views: row.total_views !== undefined ? parseInt(row.total_views, 10) : undefined,
    total_quotations:
      row.total_quotations !== undefined ? parseInt(row.total_quotations, 10) : undefined,
    product_id: row.product_id != null ? Number(row.product_id) : null,
    product: formatProduct(row),
    company: formatBuyerCompany(row),
  };

  // When buyer details are present, expose users.id as user_id
  if (row.buyer_id != null || row.buyer_name !== undefined || row.user_id != null) {
    formatted.user_id = row.user_id ?? row.buyer_id ?? null;
  }

  delete formatted.company_name;
  delete formatted.industry;
  delete formatted.gst_number;
  delete formatted.company_logo;
  delete formatted.product_name;
  delete formatted.product_slug;
  delete formatted.product_thumbnail;
  delete formatted.product_price;
  delete formatted.product_currency;
  delete formatted.product_unit;
  delete formatted.product_moq;

  return formatted;
};

const baseRfqQuery = () =>
  db('rfqs')
    .leftJoin('categories', 'rfqs.category_id', '=', 'categories.id')
    .leftJoin('categories as subcategories', 'rfqs.subcategory_id', '=', 'subcategories.id')
    .leftJoin('products', 'rfqs.product_id', '=', 'products.id')
    .leftJoin('users as buyers', 'rfqs.buyer_id', '=', 'buyers.id')
    .leftJoin('company_details as buyer_company', 'buyers.id', '=', 'buyer_company.user_id')
    .whereNull('rfqs.deleted_at');

const applyRfqFilters = (q, filters = {}) => {
  if (filters.search) {
    const term = `%${filters.search}%`;
    q.where(function () {
      this.where('rfqs.title', 'like', term)
        .orWhere('rfqs.rfq_number', 'like', term)
        .orWhere('products.name', 'like', term)
        .orWhere('buyers.full_name', 'like', term)
        .orWhere('buyer_company.company_name', 'like', term)
        .orWhere('rfqs.city', 'like', term);
    });
  }

  if (filters.status) q.where('rfqs.status', filters.status);
  if (filters.category_id) q.where('rfqs.category_id', filters.category_id);
  if (filters.subcategory_id) q.where('rfqs.subcategory_id', filters.subcategory_id);
  if (filters.city) q.where('rfqs.city', 'like', `%${filters.city}%`);
  if (filters.state) q.where('rfqs.state', 'like', `%${filters.state}%`);
  if (filters.country) q.where('rfqs.country', 'like', `%${filters.country}%`);
  if (filters.buyer_id) q.where('rfqs.buyer_id', filters.buyer_id);
  if (filters.min_budget || filters.min_expected_price) {
    const min = filters.min_expected_price || filters.min_budget;
    q.where(function () {
      this.where('rfqs.expected_price', '>=', min).orWhere('rfqs.budget', '>=', min);
    });
  }
  if (filters.max_budget || filters.max_expected_price) {
    const max = filters.max_expected_price || filters.max_budget;
    q.where(function () {
      this.where('rfqs.expected_price', '<=', max).orWhere('rfqs.budget', '<=', max);
    });
  }
  if (filters.date_from) q.where('rfqs.created_at', '>=', filters.date_from);
  if (filters.date_to) q.where('rfqs.created_at', '<=', filters.date_to);
  if (filters.is_active !== undefined) q.where('rfqs.is_active', filters.is_active);
  if (filters.visibility) q.where('rfqs.visibility', filters.visibility);
};

const findRfqById = async (id, options = {}) => {
  const row = await baseRfqQuery()
    .where('rfqs.id', id)
    .select(
      'rfqs.*',
      'categories.name as category_name',
      'subcategories.name as subcategory_name',
      ...PRODUCT_LIST_SELECT,
      'buyers.id as user_id',
      ...BUYER_COMPANY_SELECT,
    )
    .first();

  if (!row || options.raw) return row;
  return formatRow(row);
};

const findRfqs = async (filters = {}) => {
  const q = baseRfqQuery().select(
    'rfqs.id',
    'rfqs.rfq_number',
    'rfqs.title',
    'rfqs.status',
    'rfqs.expected_price',
    'rfqs.budget',
    'rfqs.quotation_deadline',
    'rfqs.total_quotations',
    'rfqs.created_at',
    'rfqs.city',
    'rfqs.unit',
    'categories.name as category',
    ...PRODUCT_LIST_SELECT,
    ...BUYER_COMPANY_SELECT,
  );

  applyRfqFilters(q, filters);

  if (filters.statuses?.length) {
    q.whereIn('rfqs.status', filters.statuses);
  }

  applyListSort(q, filters, RFQ_SORT_FIELDS);

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map(formatRow);
  return paginated;
};

const findSellerFeed = async (sellerId, filters = {}) => {
  const q = baseRfqQuery()
    .where(function () {
      this.where('rfqs.visibility', 'PUBLIC').orWhereExists(function () {
        this.select(1)
          .from('rfq_sellers')
          .whereRaw('rfq_sellers.rfq_id = rfqs.id')
          .where('rfq_sellers.seller_id', sellerId);
      });
    })
    .whereIn('rfqs.status', filters.statuses || ['PUBLISHED', 'OPEN', 'QUOTATION_RECEIVED', 'NEGOTIATION'])
    .select(
      'rfqs.id',
      'rfqs.rfq_number',
      'rfqs.title',
      'rfqs.status',
      'rfqs.expected_price',
      'rfqs.budget',
      'rfqs.quantity',
      'rfqs.unit',
      'rfqs.quotation_deadline',
      'rfqs.created_at',
      'rfqs.city',
      'categories.name as category',
      ...PRODUCT_LIST_SELECT,
      ...BUYER_COMPANY_SELECT,
    );

  applyRfqFilters(q, filters);
  applyListSort(q, filters, RFQ_SORT_FIELDS);

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map(formatRow);
  return paginated;
};

const createRfq = async (data, trx = null) => {
  const client = trx || db;
  const [id] = await client('rfqs').insert(data);
  return client('rfqs').where({ id }).first();
};

const updateRfq = async (id, data, trx = null) => {
  const client = trx || db;
  await client('rfqs')
    .where({ id })
    .update({ ...data, updated_at: client.fn.now() });
  return client('rfqs').where({ id }).whereNull('deleted_at').first();
};

const incrementViews = async (id, trx = null) => {
  const client = trx || db;
  await client('rfqs').where({ id }).increment('total_views', 1);
};

const incrementQuotationCount = async (id, trx = null) => {
  const client = trx || db;
  await client('rfqs').where({ id }).increment('total_quotations', 1);
};

const deleteRfq = async (id, userId = null, trx = null) => {
  const client = trx || db;
  const payload = { deleted_at: client.fn.now() };
  if (userId) payload.updated_by = userId;
  await client('rfqs').where({ id }).update(payload);
};

const expireOverdueRfqs = async () => {
  try {
    return await db('rfqs')
      .whereIn('status', [RFQ_STATUS.PUBLISHED, RFQ_STATUS.OPEN, RFQ_STATUS.QUOTATION_RECEIVED])
      .where('quotation_deadline', '<', db.fn.now())
      .whereNull('deleted_at')
      .update({ status: RFQ_STATUS.EXPIRED, updated_at: db.fn.now() });
  } catch (err) {
    if (err.code === 'ER_LOCK_WAIT_TIMEOUT' || err.code === 'ER_LOCK_DEADLOCK') {
      return 0;
    }
    throw err;
  }
};

const getAdminSummary = async () => {
  const counts = await db('rfqs')
    .whereNull('deleted_at')
    .select('status')
    .count('* as count')
    .groupBy('status');

  const statusMap = counts.reduce((acc, row) => {
    acc[row.status] = parseInt(row.count, 10);
    return acc;
  }, {});

  const avgQuotations = await db('rfqs')
    .whereNull('deleted_at')
    .avg('total_quotations as avg_quotations')
    .first();

  const avgResponse = await db('rfq_sellers')
    .whereNotNull('responded_at')
    .whereNotNull('viewed_at')
    .select(db.raw('AVG(TIMESTAMPDIFF(MINUTE, viewed_at, responded_at)) as avg_minutes'))
    .first();

  return {
    total_rfqs: Object.values(statusMap).reduce((a, b) => a + b, 0),
    open_rfqs: (statusMap.OPEN || 0) + (statusMap.PUBLISHED || 0) + (statusMap.QUOTATION_RECEIVED || 0),
    awarded_rfqs: statusMap.AWARDED || 0,
    completed_rfqs: statusMap.COMPLETED || 0,
    cancelled_rfqs: statusMap.CANCELLED || 0,
    expired_rfqs: statusMap.EXPIRED || 0,
    average_quotations_per_rfq: parseFloat(avgQuotations?.avg_quotations || 0),
    average_response_time_minutes: parseFloat(avgResponse?.avg_minutes || 0),
    by_status: statusMap,
  };
};

module.exports = {
  formatRow,
  findRfqById,
  findRfqs,
  findSellerFeed,
  createRfq,
  updateRfq,
  incrementViews,
  incrementQuotationCount,
  deleteRfq,
  expireOverdueRfqs,
  getAdminSummary,
  RFQ_SORT_FIELDS,
};
