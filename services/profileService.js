const userModel = require('../models/userModel');
const { AppError } = require('../utils/response');
const { ROLE_CODES } = require('../constants');
const { USER_IMAGE_FIELDS, COMPANY_IMAGE_FIELDS } = require('../constants/profileFields');
const { uploadPaths } = require('../constants/uploadPaths');
const { processUploadedFiles } = require('../services/uploadService');

// ==========================================
// Profile read
// ==========================================

/**
 * Get the authenticated user's profile formatted for API response.
 * @param {number} userId
 * @returns {Promise<Object>}
 */
const getProfile = async (userId) => {
  const profile = await userModel.getFullProfile(userId);
  if (!profile) throw new AppError('User not found', 404);

  return userModel.formatUser(profile);
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
    const loc = await userModel.findLocationIds(data.city, data.state, data.country);
    await userModel.updateAddress(userId, {
      address_line_1: data.address_line_1,
      address_line_2: data.address_line_2 || null,
      pincode: data.pincode || null,
      country_id: loc.country_id,
      state_id: loc.state_id || null,
      city_id: loc.city_id || null,
    });
  }

  const updated = await userModel.getFullProfile(userId);
  return userModel.formatUser(updated);
};

module.exports = {
  getProfile,
  updateProfile,
};
