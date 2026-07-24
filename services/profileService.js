/**
 * Profile read/update + badge counts for GET /auth/profile.
 *
 * `counts` on the profile payload supports dual-role (buyer_seller) apps:
 * notification / chat unread and inquiry / RFQ totals are split by marketplace
 * side (as_buyer vs as_seller) with full status breakdowns.
 */
const userModel = require('../models/userModel');
const wishlistModel = require('../models/wishlistModel');
const notificationModel = require('../models/notificationModel');
const chatConversationModel = require('../models/chatConversationModel');
const db = require('../database/knex');
const { AppError } = require('../utils/response');
const { ROLE_CODES } = require('../constants');
const { INQUIRY_STATUS, INQUIRY_STATUS_VALUES } = require('../constants/inquiry');
const {
  RFQ_STATUS,
  RFQ_SELLER_VISIBLE_STATUSES,
  RFQ_SELLER_STATUS,
} = require('../constants/rfq');
const { USER_IMAGE_FIELDS, COMPANY_IMAGE_FIELDS } = require('../constants/profileFields');
const { uploadPaths } = require('../constants/uploadPaths');
const { processUploadedFiles } = require('../services/uploadService');

// ==========================================
// Profile badge counts — helpers
// ==========================================

/** Buyer-owned RFQs still in progress (awaiting quotes / negotiation). */
const BUYER_PENDING_RFQ_STATUSES = [
  RFQ_STATUS.OPEN,
  RFQ_STATUS.PUBLISHED,
  RFQ_STATUS.QUOTATION_RECEIVED,
  RFQ_STATUS.NEGOTIATION,
];

/** Seller invite rows not yet quoted / rejected (still actionable). */
const SELLER_PENDING_RFQ_INVITE_STATUSES = [
  RFQ_SELLER_STATUS.INVITED,
  RFQ_SELLER_STATUS.VIEWED,
];

const toStatusMap = (rows) =>
  rows.reduce((acc, row) => {
    acc[row.status] = parseInt(row.count, 10) || 0;
    return acc;
  }, {});

const sumMap = (map) => Object.values(map).reduce((a, b) => a + b, 0);

const sumKeys = (map, keys) => keys.reduce((total, key) => total + (map[key] || 0), 0);

/** Zero-fill known status keys so clients always get a stable shape. */
const withZeroFilled = (byStatus, statusValues) => {
  const filled = {};
  for (const status of statusValues) {
    filled[status] = byStatus[status] || 0;
  }
  return filled;
};

/**
 * Inquiry counts for one marketplace side (buyer_id or seller_id).
 * @param {number} userId
 * @param {'buyer_id'|'seller_id'} roleColumn
 */
const countInquiriesByRole = async (userId, roleColumn) => {
  const rows = await db('inquiries')
    .where(roleColumn, userId)
    .whereNull('deleted_at')
    .select('status')
    .count('* as count')
    .groupBy('status');

  const by_status = withZeroFilled(toStatusMap(rows), INQUIRY_STATUS_VALUES);
  return {
    total: sumMap(by_status),
    pending: by_status[INQUIRY_STATUS.PENDING],
    quoted: by_status[INQUIRY_STATUS.QUOTED],
    accepted: by_status[INQUIRY_STATUS.ACCEPTED],
    rejected: by_status[INQUIRY_STATUS.REJECTED],
    cancelled: by_status[INQUIRY_STATUS.CANCELLED],
    closed: by_status[INQUIRY_STATUS.CLOSED],
    by_status,
  };
};

/**
 * Buyer-owned RFQs grouped by RFQ lifecycle status.
 * @param {number} userId
 */
const countBuyerRfqsByStatus = async (userId) => {
  const rows = await db('rfqs')
    .where({ buyer_id: userId })
    .whereNull('deleted_at')
    .select('status')
    .count('* as count')
    .groupBy('status');

  const by_status = withZeroFilled(toStatusMap(rows), Object.values(RFQ_STATUS));
  return {
    total: sumMap(by_status),
    draft: by_status[RFQ_STATUS.DRAFT],
    open: by_status[RFQ_STATUS.OPEN],
    published: by_status[RFQ_STATUS.PUBLISHED],
    quotation_received: by_status[RFQ_STATUS.QUOTATION_RECEIVED],
    negotiation: by_status[RFQ_STATUS.NEGOTIATION],
    awarded: by_status[RFQ_STATUS.AWARDED],
    completed: by_status[RFQ_STATUS.COMPLETED],
    expired: by_status[RFQ_STATUS.EXPIRED],
    cancelled: by_status[RFQ_STATUS.CANCELLED],
    closed: by_status[RFQ_STATUS.CLOSED],
    by_status,
  };
};

/**
 * Seller RFQ involvement: RFQ status + invite (rfq_sellers) status.
 * @param {number} userId
 */
const countSellerRfqsByStatus = async (userId) => {
  const [rfqRows, inviteRows] = await Promise.all([
    db('rfq_sellers')
      .innerJoin('rfqs', 'rfqs.id', 'rfq_sellers.rfq_id')
      .where({ 'rfq_sellers.seller_id': userId })
      .whereNull('rfqs.deleted_at')
      .select('rfqs.status')
      .countDistinct('rfqs.id as count')
      .groupBy('rfqs.status'),
    db('rfq_sellers')
      .innerJoin('rfqs', 'rfqs.id', 'rfq_sellers.rfq_id')
      .where({ 'rfq_sellers.seller_id': userId })
      .whereNull('rfqs.deleted_at')
      .select('rfq_sellers.status')
      .countDistinct('rfqs.id as count')
      .groupBy('rfq_sellers.status'),
  ]);

  const by_rfq_status = withZeroFilled(toStatusMap(rfqRows), Object.values(RFQ_STATUS));
  const inviteMap = toStatusMap(inviteRows);
  const by_invite_status = withZeroFilled(inviteMap, Object.values(RFQ_SELLER_STATUS));

  return {
    total: sumMap(by_rfq_status),
    draft: by_rfq_status[RFQ_STATUS.DRAFT],
    open: by_rfq_status[RFQ_STATUS.OPEN],
    published: by_rfq_status[RFQ_STATUS.PUBLISHED],
    quotation_received: by_rfq_status[RFQ_STATUS.QUOTATION_RECEIVED],
    negotiation: by_rfq_status[RFQ_STATUS.NEGOTIATION],
    awarded: by_rfq_status[RFQ_STATUS.AWARDED],
    completed: by_rfq_status[RFQ_STATUS.COMPLETED],
    expired: by_rfq_status[RFQ_STATUS.EXPIRED],
    cancelled: by_rfq_status[RFQ_STATUS.CANCELLED],
    closed: by_rfq_status[RFQ_STATUS.CLOSED],
    by_rfq_status,
    by_invite_status: {
      total: sumMap(by_invite_status),
      invited: by_invite_status[RFQ_SELLER_STATUS.INVITED],
      viewed: by_invite_status[RFQ_SELLER_STATUS.VIEWED],
      responded: by_invite_status[RFQ_SELLER_STATUS.RESPONDED],
      awarded: by_invite_status[RFQ_SELLER_STATUS.AWARDED],
      rejected: by_invite_status[RFQ_SELLER_STATUS.REJECTED],
      by_status: by_invite_status,
    },
  };
};

/**
 * Seller pending RFQ invites (INVITED/VIEWED on still-active RFQs).
 * @param {number} userId
 */
const countSellerPendingRfqInvites = async (userId) => {
  const row = await db('rfq_sellers')
    .innerJoin('rfqs', 'rfqs.id', 'rfq_sellers.rfq_id')
    .where({ 'rfq_sellers.seller_id': userId })
    .whereIn('rfq_sellers.status', SELLER_PENDING_RFQ_INVITE_STATUSES)
    .whereIn('rfqs.status', RFQ_SELLER_VISIBLE_STATUSES)
    .whereNull('rfqs.deleted_at')
    .countDistinct('rfqs.id as total')
    .first();
  return parseInt(row?.total || 0, 10);
};

/**
 * Role + status breakdowns for inquiries and RFQs (plus pending shortcuts).
 * @param {number} userId
 */
const countInquiriesAndRfqs = async (userId) => {
  const [asBuyerInquiries, asSellerInquiries, asBuyerRfqs, asSellerRfqs, pendingSellerRfqs] =
    await Promise.all([
      countInquiriesByRole(userId, 'buyer_id'),
      countInquiriesByRole(userId, 'seller_id'),
      countBuyerRfqsByStatus(userId),
      countSellerRfqsByStatus(userId),
      countSellerPendingRfqInvites(userId),
    ]);

  const pending_inquiries = {
    as_buyer: asBuyerInquiries.pending,
    as_seller: asSellerInquiries.pending,
    total: asBuyerInquiries.pending + asSellerInquiries.pending,
  };

  const pendingBuyerRfqs = sumKeys(asBuyerRfqs.by_status, BUYER_PENDING_RFQ_STATUSES);
  const pending_rfqs = {
    as_buyer: pendingBuyerRfqs,
    as_seller: pendingSellerRfqs,
    total: pendingBuyerRfqs + pendingSellerRfqs,
  };

  return {
    inquiries: {
      as_buyer: asBuyerInquiries,
      as_seller: asSellerInquiries,
      total: asBuyerInquiries.total + asSellerInquiries.total,
    },
    rfqs: {
      as_buyer: asBuyerRfqs,
      as_seller: asSellerRfqs,
      total: asBuyerRfqs.total + asSellerRfqs.total,
    },
    pending_inquiries,
    pending_rfqs,
  };
};

/**
 * Aggregate badge counts for the profile payload (loaded in parallel).
 *
 * Shape:
 * - wishlist: number
 * - notifications_unread: { total, buyer, seller }
 * - chat_unread: { total, as_buyer, as_seller }
 * - inquiries: { total, as_buyer, as_seller } — each side has status fields + by_status
 * - rfqs: { total, as_buyer, as_seller } — buyer by RFQ status; seller also by_invite_status
 * - pending_inquiries / pending_rfqs: badge shortcuts { total, as_buyer, as_seller }
 *
 * @param {number} userId
 * @returns {Promise<Object>}
 */
const getProfileCounts = async (userId) => {
  const [wishlist, notifications_unread, chat_unread, inquiryRfqCounts] = await Promise.all([
    wishlistModel.countForUser(userId),
    notificationModel.countUnreadByRole(userId),
    chatConversationModel.getTotalUnreadCount(userId),
    countInquiriesAndRfqs(userId),
  ]);

  return {
    wishlist,
    notifications_unread,
    chat_unread,
    ...inquiryRfqCounts,
  };
};

// ==========================================
// Profile read
// ==========================================

/**
 * Get the authenticated user's profile formatted for API response.
 * Includes `counts` badges for notifications, chat, wishlist, inquiries, RFQs.
 * @param {number} userId
 * @returns {Promise<Object>}
 */
const getProfile = async (userId) => {
  const profile = await userModel.getFullProfile(userId);
  if (!profile) throw new AppError('User not found', 404);

  const [formatted, counts] = await Promise.all([
    Promise.resolve(userModel.formatUser(profile)),
    getProfileCounts(userId),
  ]);

  return { ...formatted, counts };
};

// ==========================================
// Profile update
// ==========================================

/**
 * Update user profile for buyer, seller, or buyer_seller roles.
 *
 * - Text fields are validated in middleware (role-specific rules).
 * - Image fields are optional on update (multipart file uploads).
 * - Sets is_completed_profile = true on successful update.
 * - Response includes the same `counts` object as GET /auth/profile.
 *
 * @param {number} userId
 * @param {Object} data - Validated text fields from req.body
 * @param {Object} [files] - Multer files from req.files
 * @returns {Promise<Object>}
 */
const updateProfile = async (userId, data, files = {}) => {
  const fullProfile = await userModel.getFullProfile(userId);
  if (!fullProfile) throw new AppError('User not found', 404);

  const roleCode = fullProfile.roles?.[0]?.code;
  if (![ROLE_CODES.BUYER, ROLE_CODES.SELLER, ROLE_CODES.BUYER_SELLER].includes(roleCode)) {
    throw new AppError('Profile completion is not available for this role', 400);
  }

  const existingProfile = fullProfile.profile || {};
  const profilePath = uploadPaths.userProfile(userId);

  // profile_image → users table; company_logo/banner → company_details
  const userImageUpdates = await processUploadedFiles({
    files,
    fields: USER_IMAGE_FIELDS,
    pathSegments: profilePath,
    existing: { profile_image: fullProfile.profile_image },
  });

  const companyImageUpdates = await processUploadedFiles({
    files,
    fields: COMPANY_IMAGE_FIELDS,
    pathSegments: profilePath,
    existing: existingProfile,
  });

  const userUpdate = { updated_by: userId, ...userImageUpdates };
  const companyUpdate = { updated_by: userId, ...companyImageUpdates };

  // Buyer / buyer_seller company fields
  if ([ROLE_CODES.BUYER, ROLE_CODES.BUYER_SELLER].includes(roleCode)) {
    companyUpdate.company_name = data.company_name;
    companyUpdate.industry = data.industry;
    companyUpdate.gst_number = data.gst_number || null;
  }

  // Seller / buyer_seller business fields
  if ([ROLE_CODES.SELLER, ROLE_CODES.BUYER_SELLER].includes(roleCode)) {
    companyUpdate.company_name = data.company_name;
    companyUpdate.gst_number = data.gst_number;
    companyUpdate.pan_number = data.pan_number;
    companyUpdate.cin = data.cin || null;
    companyUpdate.iec = data.iec || null;
    companyUpdate.business_description = data.business_description;
  }

  userUpdate.is_completed_profile = true;
  await userModel.updateUser(userId, userUpdate);
  await userModel.upsertProfile(userId, companyUpdate);

  // Buyer / buyer_seller primary address
  if ([ROLE_CODES.BUYER, ROLE_CODES.BUYER_SELLER].includes(roleCode)) {
    await userModel.updateAddress(userId, {
      address_line_1: data.address_line_1,
      address_line_2: data.address_line_2 || null,
      pincode: data.pincode,
      country_id: Number(data.country_id),
      state_id: Number(data.state_id),
      city_id: Number(data.city_id),
    });
  }

  const updated = await userModel.getFullProfile(userId);
  const [formatted, counts] = await Promise.all([
    Promise.resolve(userModel.formatUser(updated)),
    getProfileCounts(userId),
  ]);
  return { ...formatted, counts };
};

module.exports = {
  getProfile,
  updateProfile,
  getProfileCounts,
};
