/**
 * Dashboard aggregations — buyer/seller summary counts and chart series.
 *
 * Domain is RFQ + product inquiry + quotation + chat (no orders module).
 */
const db = require('../database/knex');
const { resolveMediaUrl } = require('../utils/media');
const {
  RFQ_STATUS,
  RFQ_VISIBILITY,
  QUOTATION_STATUS,
  RFQ_SELLER_VISIBLE_STATUSES,
} = require('../constants/rfq');
const { INQUIRY_STATUS } = require('../constants/inquiry');

const DEFAULT_DAILY_DAYS = 30;
const DEFAULT_MONTHLY_MONTHS = 6;

// ==========================================
// Helpers
// ==========================================

const toStatusMap = (rows) =>
  rows.reduce((acc, row) => {
    acc[row.status] = parseInt(row.count, 10);
    return acc;
  }, {});

const sumMap = (map) => Object.values(map).reduce((a, b) => a + b, 0);

const sumKeys = (map, keys) => keys.reduce((total, key) => total + (map[key] || 0), 0);

/** Convert status map → pie/donut series: [{ label, value }] */
const toPieSeries = (map) =>
  Object.entries(map || {})
    .map(([label, value]) => ({ label, value: parseInt(value, 10) || 0 }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

const pad2 = (n) => String(n).padStart(2, '0');

const formatDate = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const formatMonth = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

/** Parse MySQL DATE / DATE_FORMAT string to YYYY-MM-DD or YYYY-MM. */
const normalizePeriodKey = (value) => {
  if (!value) return null;
  if (value instanceof Date) return formatDate(value);
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  if (/^\d{4}-\d{2}$/.test(str)) return str;
  return str;
};

const zeroFillDaily = (rows, days) => {
  const map = new Map(
    (rows || []).map((row) => [normalizePeriodKey(row.period), parseInt(row.count, 10) || 0]),
  );
  const series = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = formatDate(d);
    series.push({ date: key, count: map.get(key) || 0 });
  }
  return series;
};

const zeroFillMonthly = (rows, months) => {
  const map = new Map(
    (rows || []).map((row) => [normalizePeriodKey(row.period), parseInt(row.count, 10) || 0]),
  );
  const series = [];
  const now = new Date();
  now.setDate(1);
  now.setHours(0, 0, 0, 0);

  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = formatMonth(d);
    series.push({ month: key, count: map.get(key) || 0 });
  }
  return series;
};

/**
 * Group count by day for the last N days.
 * @param {import('knex').Knex.QueryBuilder} baseQuery - already filtered
 * @param {string} dateColumn - e.g. 'rfqs.created_at'
 * @param {number} days
 */
const groupCountByDay = async (baseQuery, dateColumn, days = DEFAULT_DAILY_DAYS) => {
  const rows = await baseQuery
    .clone()
    .whereRaw(`${dateColumn} >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`, [days - 1])
    .clearSelect()
    .select(db.raw(`DATE(${dateColumn}) as period`))
    .count('* as count')
    .groupByRaw(`DATE(${dateColumn})`)
    .orderBy('period', 'asc');

  return zeroFillDaily(rows, days);
};

/**
 * Group count by month for the last N months.
 * @param {import('knex').Knex.QueryBuilder} baseQuery
 * @param {string} dateColumn
 * @param {number} months
 */
const groupCountByMonth = async (baseQuery, dateColumn, months = DEFAULT_MONTHLY_MONTHS) => {
  const rows = await baseQuery
    .clone()
    .whereRaw(
      `${dateColumn} >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ? MONTH), '%Y-%m-01')`,
      [months - 1],
    )
    .clearSelect()
    .select(db.raw(`DATE_FORMAT(${dateColumn}, '%Y-%m') as period`))
    .count('* as count')
    .groupByRaw(`DATE_FORMAT(${dateColumn}, '%Y-%m')`)
    .orderBy('period', 'asc');

  return zeroFillMonthly(rows, months);
};

// ==========================================
// Profile snapshot
// ==========================================

const getUserDashboardProfile = async (userId) => {
  const row = await db('users')
    .leftJoin('company_details', 'users.id', 'company_details.user_id')
    .where('users.id', userId)
    .whereNull('users.deleted_at')
    .select(
      'users.id',
      'users.full_name',
      'users.email',
      'users.profile_image',
      'users.is_verified',
      'users.is_completed_profile',
      'company_details.company_name',
      'company_details.company_logo',
      'company_details.rating',
      'company_details.response_rate',
      'company_details.years_in_business',
    )
    .first();

  if (!row) return null;

  return {
    id: row.id,
    full_name: row.full_name || null,
    email: row.email || null,
    profile_image: row.profile_image ? resolveMediaUrl(row.profile_image) : null,
    is_verified: !!row.is_verified,
    is_completed_profile: !!row.is_completed_profile,
    company_name: row.company_name || null,
    company_logo: row.company_logo ? resolveMediaUrl(row.company_logo) : null,
    rating: row.rating != null ? parseFloat(row.rating) : null,
    response_rate: row.response_rate != null ? parseFloat(row.response_rate) : null,
    years_in_business: row.years_in_business != null ? parseInt(row.years_in_business, 10) : null,
  };
};

// ==========================================
// RFQ counts
// ==========================================

const countRfqsByBuyer = async (buyerId) => {
  const rows = await db('rfqs')
    .where({ buyer_id: buyerId })
    .whereNull('deleted_at')
    .select('status')
    .count('* as count')
    .groupBy('status');

  const by_status = toStatusMap(rows);
  return {
    total: sumMap(by_status),
    draft: by_status[RFQ_STATUS.DRAFT] || 0,
    open: sumKeys(by_status, [
      RFQ_STATUS.PUBLISHED,
      RFQ_STATUS.OPEN,
      RFQ_STATUS.QUOTATION_RECEIVED,
      RFQ_STATUS.NEGOTIATION,
    ]),
    awarded: by_status[RFQ_STATUS.AWARDED] || 0,
    completed: by_status[RFQ_STATUS.COMPLETED] || 0,
    cancelled: by_status[RFQ_STATUS.CANCELLED] || 0,
    expired: by_status[RFQ_STATUS.EXPIRED] || 0,
    closed: by_status[RFQ_STATUS.CLOSED] || 0,
    by_status,
  };
};

/** Quotations on the buyer's RFQs awaiting accept/reject. */
const countPendingRfqQuotationsForBuyer = async (buyerId) => {
  const row = await db('quotations')
    .innerJoin('rfqs', 'rfqs.id', 'quotations.rfq_id')
    .where('rfqs.buyer_id', buyerId)
    .whereNull('rfqs.deleted_at')
    .whereIn('quotations.status', [QUOTATION_STATUS.SUBMITTED, QUOTATION_STATUS.UPDATED])
    .count('quotations.id as count')
    .first();

  return parseInt(row?.count || 0, 10);
};

const countSellerRfqQuotations = async (sellerId) => {
  const rows = await db('quotations')
    .where({ seller_id: sellerId })
    .select('status')
    .count('* as count')
    .groupBy('status');

  const by_status = toStatusMap(rows);
  return {
    total: sumMap(by_status),
    pending_review: sumKeys(by_status, [QUOTATION_STATUS.SUBMITTED, QUOTATION_STATUS.UPDATED]),
    accepted: by_status[QUOTATION_STATUS.ACCEPTED] || 0,
    rejected: by_status[QUOTATION_STATUS.REJECTED] || 0,
    withdrawn: by_status[QUOTATION_STATUS.WITHDRAWN] || 0,
    by_status,
  };
};

/** Open RFQ opportunities seller can still quote on (public + invites, not yet quoted). */
const countSellerRfqOpportunities = async (sellerId) => {
  const quotedRfqIds = db('quotations').where({ seller_id: sellerId }).select('rfq_id');

  const publicCount = await db('rfqs')
    .whereIn('status', RFQ_SELLER_VISIBLE_STATUSES)
    .where({ visibility: RFQ_VISIBILITY.PUBLIC })
    .whereNot('buyer_id', sellerId)
    .whereNull('deleted_at')
    .whereNotIn('id', quotedRfqIds)
    .count('* as count')
    .first();

  const privateCount = await db('rfqs')
    .innerJoin('rfq_sellers', 'rfq_sellers.rfq_id', 'rfqs.id')
    .whereIn('rfqs.status', RFQ_SELLER_VISIBLE_STATUSES)
    .where({
      'rfqs.visibility': RFQ_VISIBILITY.PRIVATE,
      'rfq_sellers.seller_id': sellerId,
    })
    .whereNot('rfqs.buyer_id', sellerId)
    .whereNull('rfqs.deleted_at')
    .whereNotIn('rfqs.id', quotedRfqIds)
    .countDistinct('rfqs.id as count')
    .first();

  return parseInt(publicCount?.count || 0, 10) + parseInt(privateCount?.count || 0, 10);
};

// ==========================================
// Inquiry counts
// ==========================================

const countInquiriesByRole = async (userId, roleColumn) => {
  const rows = await db('inquiries')
    .where(roleColumn, userId)
    .whereNull('deleted_at')
    .select('status')
    .count('* as count')
    .groupBy('status');

  const by_status = toStatusMap(rows);
  return {
    total: sumMap(by_status),
    pending: by_status[INQUIRY_STATUS.PENDING] || 0,
    quoted: by_status[INQUIRY_STATUS.QUOTED] || 0,
    accepted: by_status[INQUIRY_STATUS.ACCEPTED] || 0,
    rejected: by_status[INQUIRY_STATUS.REJECTED] || 0,
    cancelled: by_status[INQUIRY_STATUS.CANCELLED] || 0,
    closed: by_status[INQUIRY_STATUS.CLOSED] || 0,
    by_status,
  };
};

// ==========================================
// Products & wishlist
// ==========================================

const countProductsBySeller = async (sellerId) => {
  const rows = await db('products')
    .where({ seller_id: sellerId })
    .whereNull('deleted_at')
    .select('approval_status')
    .count('* as count')
    .groupBy('approval_status');

  const by_approval_status = rows.reduce((acc, row) => {
    acc[row.approval_status] = parseInt(row.count, 10);
    return acc;
  }, {});

  const activeRow = await db('products')
    .where({ seller_id: sellerId, is_active: true, approval_status: 'approved' })
    .whereNull('deleted_at')
    .count('* as count')
    .first();

  return {
    total: sumMap(by_approval_status),
    in_review: by_approval_status.in_review || 0,
    revision_required: by_approval_status.revision_required || 0,
    approved: by_approval_status.approved || 0,
    rejected: by_approval_status.rejected || 0,
    active_approved: parseInt(activeRow?.count || 0, 10),
    by_approval_status,
  };
};

const countWishlistByUser = async (userId) => {
  const row = await db('wishlist').where({ user_id: userId }).count('* as count').first();
  return parseInt(row?.count || 0, 10);
};

// ==========================================
// Chart series — buyer
// ==========================================

const getBuyerChartSeries = async (buyerId, { days = DEFAULT_DAILY_DAYS, months = DEFAULT_MONTHLY_MONTHS } = {}) => {
  const buyerRfqs = () => db('rfqs').where({ buyer_id: buyerId }).whereNull('deleted_at');
  const buyerInquiries = () => db('inquiries').where({ buyer_id: buyerId }).whereNull('deleted_at');
  const buyerQuotations = () =>
    db('quotations')
      .innerJoin('rfqs', 'rfqs.id', 'quotations.rfq_id')
      .where('rfqs.buyer_id', buyerId)
      .whereNull('rfqs.deleted_at');
  const awardedRfqs = () =>
    buyerRfqs().whereIn('status', [RFQ_STATUS.AWARDED, RFQ_STATUS.COMPLETED]);
  const acceptedInquiries = () => buyerInquiries().where({ status: INQUIRY_STATUS.ACCEPTED });
  const wishlist = () => db('wishlist').where({ user_id: buyerId });

  const [
    rfqs_created_daily,
    inquiries_created_daily,
    quotations_received_daily,
    wishlist_added_daily,
    rfqs_created_monthly,
    inquiries_created_monthly,
    deals_won_monthly_rfqs,
    deals_won_monthly_inquiries,
  ] = await Promise.all([
    groupCountByDay(buyerRfqs(), 'rfqs.created_at', days),
    groupCountByDay(buyerInquiries(), 'inquiries.created_at', days),
    groupCountByDay(buyerQuotations(), 'quotations.created_at', days),
    groupCountByDay(wishlist(), 'wishlist.created_at', days),
    groupCountByMonth(buyerRfqs(), 'rfqs.created_at', months),
    groupCountByMonth(buyerInquiries(), 'inquiries.created_at', months),
    groupCountByMonth(awardedRfqs(), 'rfqs.updated_at', months),
    groupCountByMonth(acceptedInquiries(), 'inquiries.updated_at', months),
  ]);

  const deals_won_monthly = deals_won_monthly_rfqs.map((row, idx) => ({
    month: row.month,
    count: row.count + (deals_won_monthly_inquiries[idx]?.count || 0),
    rfqs_awarded: row.count,
    inquiries_accepted: deals_won_monthly_inquiries[idx]?.count || 0,
  }));

  return {
    period: {
      daily_days: days,
      monthly_months: months,
    },
    rfqs_created_daily,
    inquiries_created_daily,
    quotations_received_daily,
    wishlist_added_daily,
    rfqs_created_monthly,
    inquiries_created_monthly,
    deals_won_monthly,
  };
};

// ==========================================
// Chart series — seller
// ==========================================

const getSellerChartSeries = async (sellerId, { days = DEFAULT_DAILY_DAYS, months = DEFAULT_MONTHLY_MONTHS } = {}) => {
  const sellerInquiries = () => db('inquiries').where({ seller_id: sellerId }).whereNull('deleted_at');
  const sellerQuotations = () => db('quotations').where({ seller_id: sellerId });
  const acceptedQuotations = () =>
    sellerQuotations().where({ status: QUOTATION_STATUS.ACCEPTED });
  const sellerProducts = () => db('products').where({ seller_id: sellerId }).whereNull('deleted_at');
  const approvedProducts = () => sellerProducts().where({ approval_status: 'approved' });

  const [
    inquiries_received_daily,
    quotations_submitted_daily,
    inquiries_received_monthly,
    quotations_submitted_monthly,
    quotations_accepted_monthly,
    products_submitted_monthly,
    products_approved_monthly,
  ] = await Promise.all([
    groupCountByDay(sellerInquiries(), 'inquiries.created_at', days),
    groupCountByDay(sellerQuotations(), 'quotations.created_at', days),
    groupCountByMonth(sellerInquiries(), 'inquiries.created_at', months),
    groupCountByMonth(sellerQuotations(), 'quotations.created_at', months),
    groupCountByMonth(acceptedQuotations(), 'quotations.updated_at', months),
    groupCountByMonth(
      sellerProducts(),
      'COALESCE(products.submitted_at, products.created_at)',
      months,
    ),
    groupCountByMonth(
      approvedProducts(),
      'COALESCE(products.reviewed_at, products.updated_at)',
      months,
    ),
  ]);

  return {
    period: {
      daily_days: days,
      monthly_months: months,
    },
    inquiries_received_daily,
    quotations_submitted_daily,
    inquiries_received_monthly,
    quotations_submitted_monthly,
    quotations_accepted_monthly,
    products_submitted_monthly,
    products_approved_monthly,
  };
};

module.exports = {
  getUserDashboardProfile,
  countRfqsByBuyer,
  countPendingRfqQuotationsForBuyer,
  countSellerRfqQuotations,
  countSellerRfqOpportunities,
  countInquiriesByRole,
  countProductsBySeller,
  countWishlistByUser,
  getBuyerChartSeries,
  getSellerChartSeries,
  toPieSeries,
  DEFAULT_DAILY_DAYS,
  DEFAULT_MONTHLY_MONTHS,
};
