/**
 * Profile read/update + badge counts for GET /auth/profile.
 *
 * `counts` on the profile payload supports dual-role (buyer_seller) apps:
 * notification / chat unread and pending inquiry / RFQ totals are split
 * by marketplace side (as_buyer vs as_seller, or buyer vs seller).
 */
const userModel = require('../models/userModel');
const wishlistModel = require('../models/wishlistModel');
const notificationModel = require('../models/notificationModel');
const chatConversationModel = require('../models/chatConversationModel');
const db = require('../database/knex');
const { AppError } = require('../utils/response');
const { ROLE_CODES } = require('../constants');
const { INQUIRY_STATUS } = require('../constants/inquiry');
const {
  RFQ_STATUS,
  RFQ_SELLER_VISIBLE_STATUSES,
  RFQ_SELLER_STATUS,
} = require('../constants/rfq');
const { USER_IMAGE_FIELDS, COMPANY_IMAGE_FIELDS } = require('../constants/profileFields');
const { uploadPaths } = require('../constants/uploadPaths');
const { processUploadedFiles } = require('../services/uploadService');

// ==========================================
// Profile badge counts
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

/**
 * Pending product inquiries for this user as buyer and as seller.
 * Status = `pending` only (not quoted / accepted / closed).
 * @param {number} userId
 * @returns {Promise<{ as_buyer: number, as_seller: number, total: number }>}
 */
const countPendingInquiries = async (userId) => {
  const [asBuyer, asSeller] = await Promise.all([
    db('inquiries')
      .where({ buyer_id: userId, status: INQUIRY_STATUS.PENDING })
      .whereNull('deleted_at')
      .count({ total: '*' })
      .first(),
    db('inquiries')
      .where({ seller_id: userId, status: INQUIRY_STATUS.PENDING })
      .whereNull('deleted_at')
      .count({ total: '*' })
      .first(),
  ]);

  const as_buyer = parseInt(asBuyer?.total || 0, 10);
  const as_seller = parseInt(asSeller?.total || 0, 10);
  return { as_buyer, as_seller, total: as_buyer + as_seller };
};

/**
 * Pending RFQs for this user:
 * - as_buyer: own RFQs in open / published / quotation / negotiation
 * - as_seller: private invites still INVITED or VIEWED on active RFQs
 * @param {number} userId
 * @returns {Promise<{ as_buyer: number, as_seller: number, total: number }>}
 */
const countPendingRfqs = async (userId) => {
  const [asBuyer, asSeller] = await Promise.all([
    db('rfqs')
      .where({ buyer_id: userId })
      .whereIn('status', BUYER_PENDING_RFQ_STATUSES)
      .whereNull('deleted_at')
      .count({ total: '*' })
      .first(),
    db('rfq_sellers')
      .innerJoin('rfqs', 'rfqs.id', 'rfq_sellers.rfq_id')
      .where({ 'rfq_sellers.seller_id': userId })
      .whereIn('rfq_sellers.status', SELLER_PENDING_RFQ_INVITE_STATUSES)
      .whereIn('rfqs.status', RFQ_SELLER_VISIBLE_STATUSES)
      .whereNull('rfqs.deleted_at')
      .countDistinct('rfqs.id as total')
      .first(),
  ]);

  const as_buyer = parseInt(asBuyer?.total || 0, 10);
  const as_seller = parseInt(asSeller?.total || 0, 10);
  return { as_buyer, as_seller, total: as_buyer + as_seller };
};

/**
 * Aggregate badge counts for the profile payload (loaded in parallel).
 *
 * Shape:
 * - wishlist: number
 * - notifications_unread: { total, buyer, seller }
 * - chat_unread: { total, as_buyer, as_seller }
 * - pending_inquiries / pending_rfqs: { total, as_buyer, as_seller }
 *
 * @param {number} userId
 * @returns {Promise<Object>}
 */
const getProfileCounts = async (userId) => {
  const [wishlist, notifications_unread, chat_unread, pending_inquiries, pending_rfqs] =
    await Promise.all([
      wishlistModel.countForUser(userId),
      notificationModel.countUnreadByRole(userId),
      chatConversationModel.getTotalUnreadCount(userId),
      countPendingInquiries(userId),
      countPendingRfqs(userId),
    ]);

  return {
    wishlist,
    notifications_unread,
    chat_unread,
    pending_inquiries,
    pending_rfqs,
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
