const userModel = require('../models/userModel');
const { AppError } = require('../utils/response');
const { ROLE_CODES } = require('../constants');
const { replaceStoredImage } = require('../utils/media');

const IMAGE_FIELDS_BY_ROLE = {
  [ROLE_CODES.BUYER]: ['profile_image'],
  [ROLE_CODES.SELLER]: ['company_logo', 'company_banner'],
  [ROLE_CODES.BUYER_SELLER]: ['profile_image', 'company_logo', 'company_banner'],
};

const setImageField = async (companyUpdate, field, files, userId, existingValue) => {
  const newPath = await replaceStoredImage(files, field, userId, existingValue);
  if (newPath) {
    companyUpdate[field] = newPath;
  }
};

/**
 * Get profile data formatted for response.
 */
const getProfile = async (userId) => {
  const profile = await userModel.getFullProfile(userId);
  if (!profile) throw new AppError('User not found', 404);

  return userModel.formatUser(profile);
};

/**
 * Update user profile — all required role fields must be sent (validated in middleware).
 */
const updateProfile = async (userId, data, files = {}) => {
  const fullProfile = await userModel.getFullProfile(userId);
  if (!fullProfile) throw new AppError('User not found', 404);

  const roleCode = fullProfile.roles?.[0]?.code;
  if (![ROLE_CODES.BUYER, ROLE_CODES.SELLER, ROLE_CODES.BUYER_SELLER].includes(roleCode)) {
    throw new AppError('Profile completion is not available for this role', 400);
  }

  const existingProfile = fullProfile.profile || {};
  const companyUpdate = { updated_by: userId };
  const imageFields = IMAGE_FIELDS_BY_ROLE[roleCode] || [];

  for (const field of imageFields) {
    await setImageField(companyUpdate, field, files, userId, existingProfile[field]);
  }

  if ([ROLE_CODES.BUYER, ROLE_CODES.BUYER_SELLER].includes(roleCode)) {
    companyUpdate.company_name = data.company_name;
    companyUpdate.industry = data.industry;
    companyUpdate.gst_number = data.gst_number || null;
  }

  if ([ROLE_CODES.SELLER, ROLE_CODES.BUYER_SELLER].includes(roleCode)) {
    companyUpdate.company_name = data.company_name;
    companyUpdate.gst_number = data.gst_number;
    companyUpdate.pan_number = data.pan_number;
    companyUpdate.cin = data.cin || null;
    companyUpdate.iec = data.iec || null;
    companyUpdate.business_description = data.business_description;
  }

  await userModel.upsertProfile(userId, companyUpdate);

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
