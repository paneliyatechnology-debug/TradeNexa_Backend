const userModel = require('../models/userModel');
const { AppError } = require('../utils/response');
const { ROLE_CODES } = require('../constants');

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
const updateProfile = async (userId, data) => {
  const fullProfile = await userModel.getFullProfile(userId);
  if (!fullProfile) throw new AppError('User not found', 404);

  const roleCode = fullProfile.roles?.[0]?.code;
  if (![ROLE_CODES.BUYER, ROLE_CODES.SELLER, ROLE_CODES.BUYER_SELLER].includes(roleCode)) {
    throw new AppError('Profile completion is not available for this role', 400);
  }

  const companyUpdate = { updated_by: userId };

  if ([ROLE_CODES.BUYER, ROLE_CODES.BUYER_SELLER].includes(roleCode)) {
    companyUpdate.profile_image = data.profile_image;
    companyUpdate.company_name = data.company_name;
    companyUpdate.industry = data.industry;
    companyUpdate.gst_number = data.gst_number || null;
  }

  if ([ROLE_CODES.SELLER, ROLE_CODES.BUYER_SELLER].includes(roleCode)) {
    companyUpdate.company_logo = data.company_logo;
    companyUpdate.company_banner = data.company_banner;
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
