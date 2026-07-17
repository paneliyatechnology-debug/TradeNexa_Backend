/**
 * Dashboard aggregations — buyer/seller summary counts and recent activity.
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
// RFQ counts & recent
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
    open:
      sumKeys(by_status, [
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

const getRecentRfqsByBuyer = async (buyerId, limit = 5) => {
  const rows = await db('rfqs')
    .where({ buyer_id: buyerId })
    .whereNull('deleted_at')
    .orderBy('updated_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limit)
    .select(
      'id',
      'rfq_number',
      'title',
      'status',
      'total_quotations',
      'quotation_deadline',
      'created_at',
      'updated_at',
    );

  return rows.map((row) => ({
    id: row.id,
    rfq_number: row.rfq_number,
    title: row.title,
    status: row.status,
    total_quotations: parseInt(row.total_quotations || 0, 10),
    quotation_deadline: row.quotation_deadline,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
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

const getRecentSellerRfqQuotations = async (sellerId, limit = 5) => {
  const rows = await db('quotations')
    .innerJoin('rfqs', 'rfqs.id', 'quotations.rfq_id')
    .where('quotations.seller_id', sellerId)
    .whereNull('rfqs.deleted_at')
    .orderBy('quotations.updated_at', 'desc')
    .orderBy('quotations.id', 'desc')
    .limit(limit)
    .select(
      'quotations.id',
      'quotations.quotation_number',
      'quotations.rfq_id',
      'quotations.status',
      'quotations.total_amount',
      'quotations.created_at',
      'quotations.updated_at',
      'rfqs.rfq_number',
      'rfqs.title as rfq_title',
      'rfqs.currency as rfq_currency',
    );

  return rows.map((row) => ({
    id: row.id,
    quotation_number: row.quotation_number,
    rfq_id: row.rfq_id,
    rfq_number: row.rfq_number,
    rfq_title: row.rfq_title,
    status: row.status,
    total_amount: row.total_amount != null ? parseFloat(row.total_amount) : null,
    currency: row.rfq_currency || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
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
// Inquiry counts & recent
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

const getRecentInquiriesByRole = async (userId, roleColumn, limit = 5) => {
  const rows = await db('inquiries')
    .leftJoin('products', 'products.id', 'inquiries.product_id')
    .where(`inquiries.${roleColumn}`, userId)
    .whereNull('inquiries.deleted_at')
    .orderBy('inquiries.updated_at', 'desc')
    .orderBy('inquiries.id', 'desc')
    .limit(limit)
    .select(
      'inquiries.id',
      'inquiries.inquiry_number',
      'inquiries.product_id',
      'inquiries.status',
      'inquiries.quantity',
      'inquiries.unit',
      'inquiries.created_at',
      'inquiries.updated_at',
      'products.name as product_name',
      'products.thumbnail as product_thumbnail',
    );

  return rows.map((row) => ({
    id: row.id,
    inquiry_number: row.inquiry_number,
    product_id: row.product_id,
    product_name: row.product_name || null,
    product_thumbnail: row.product_thumbnail ? resolveMediaUrl(row.product_thumbnail) : null,
    status: row.status,
    quantity: row.quantity,
    unit: row.unit,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
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

module.exports = {
  getUserDashboardProfile,
  countRfqsByBuyer,
  getRecentRfqsByBuyer,
  countPendingRfqQuotationsForBuyer,
  countSellerRfqQuotations,
  getRecentSellerRfqQuotations,
  countSellerRfqOpportunities,
  countInquiriesByRole,
  getRecentInquiriesByRole,
  countProductsBySeller,
  countWishlistByUser,
};
