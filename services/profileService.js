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
const { RFQ_STATUS } = require('../constants/rfq');
const { USER_IMAGE_FIELDS, COMPANY_IMAGE_FIELDS } = require('../constants/profileFields');
const { uploadPaths } = require('../constants/uploadPaths');
const { processUploadedFiles } = require('../services/uploadService');

// ==========================================
// Profile badge counts — helpers
// ==========================================

const toStatusMap = (rows) =>
  rows.reduce((acc, row) => {
    acc[row.status] = parseInt(row.count, 10) || 0;
    return acc;
  }, {});

const sumMap = (map) => Object.values(map).reduce((a, b) => a + b, 0);

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

  const statusMap = withZeroFilled(toStatusMap(rows), INQUIRY_STATUS_VALUES);
  return {
    total: sumMap(statusMap),
    pending: statusMap[INQUIRY_STATUS.PENDING],
    quoted: statusMap[INQUIRY_STATUS.QUOTED],
    accepted: statusMap[INQUIRY_STATUS.ACCEPTED],
    rejected: statusMap[INQUIRY_STATUS.REJECTED],
    cancelled: statusMap[INQUIRY_STATUS.CANCELLED],
    closed: statusMap[INQUIRY_STATUS.CLOSED],
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

  const statusMap = withZeroFilled(toStatusMap(rows), Object.values(RFQ_STATUS));
  return {
    total: sumMap(statusMap),
    draft: statusMap[RFQ_STATUS.DRAFT],
    open: statusMap[RFQ_STATUS.OPEN],
    published: statusMap[RFQ_STATUS.PUBLISHED],
    quotation_received: statusMap[RFQ_STATUS.QUOTATION_RECEIVED],
    negotiation: statusMap[RFQ_STATUS.NEGOTIATION],
    awarded: statusMap[RFQ_STATUS.AWARDED],
    completed: statusMap[RFQ_STATUS.COMPLETED],
    expired: statusMap[RFQ_STATUS.EXPIRED],
    cancelled: statusMap[RFQ_STATUS.CANCELLED],
    closed: statusMap[RFQ_STATUS.CLOSED],
  };
};

/**
 * Seller RFQ involvement grouped by RFQ lifecycle status.
 * @param {number} userId
 */
const countSellerRfqsByStatus = async (userId) => {
  const rfqRows = await db('rfq_sellers')
    .innerJoin('rfqs', 'rfqs.id', 'rfq_sellers.rfq_id')
    .where({ 'rfq_sellers.seller_id': userId })
    .whereNull('rfqs.deleted_at')
    .select('rfqs.status')
    .countDistinct('rfqs.id as count')
    .groupBy('rfqs.status');

  const rfqStatusMap = withZeroFilled(toStatusMap(rfqRows), Object.values(RFQ_STATUS));

  return {
    total: sumMap(rfqStatusMap),
    draft: rfqStatusMap[RFQ_STATUS.DRAFT],
    open: rfqStatusMap[RFQ_STATUS.OPEN],
    published: rfqStatusMap[RFQ_STATUS.PUBLISHED],
    quotation_received: rfqStatusMap[RFQ_STATUS.QUOTATION_RECEIVED],
    negotiation: rfqStatusMap[RFQ_STATUS.NEGOTIATION],
    awarded: rfqStatusMap[RFQ_STATUS.AWARDED],
    completed: rfqStatusMap[RFQ_STATUS.COMPLETED],
    expired: rfqStatusMap[RFQ_STATUS.EXPIRED],
    cancelled: rfqStatusMap[RFQ_STATUS.CANCELLED],
    closed: rfqStatusMap[RFQ_STATUS.CLOSED],
  };
};

/**
 * Role + status breakdowns for inquiries and RFQs.
 * @param {number} userId
 */
const countInquiriesAndRfqs = async (userId) => {
  const [asBuyerInquiries, asSellerInquiries, asBuyerRfqs, asSellerRfqs] = await Promise.all([
    countInquiriesByRole(userId, 'buyer_id'),
    countInquiriesByRole(userId, 'seller_id'),
    countBuyerRfqsByStatus(userId),
    countSellerRfqsByStatus(userId),
  ]);

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
  };
};

/**
 * Aggregate badge counts for the profile payload (loaded in parallel).
 *
 * Shape:
 * - wishlist: number
 * - notifications_unread: { total, buyer, seller }
 * - chat_unread: { total, as_buyer, as_seller }
 * - inquiries: { total, as_buyer, as_seller } — each side has flat status fields
 * - rfqs: { total, as_buyer, as_seller } — flat RFQ status fields
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
