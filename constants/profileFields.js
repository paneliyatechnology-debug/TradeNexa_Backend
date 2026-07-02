/**
 * Profile image field names by storage location.
 * Used by profileService and profileValidation.
 */

// ==========================================
// Image field groups
// ==========================================

/** Stored on users table */
const USER_IMAGE_FIELDS = ['profile_image'];

/** Stored on company_details table */
const COMPANY_IMAGE_FIELDS = ['company_logo', 'company_banner'];

/** All profile image fields — optional on update */
const PROFILE_IMAGE_FIELDS = [...USER_IMAGE_FIELDS, ...COMPANY_IMAGE_FIELDS];

// ==========================================
// Exports
// ==========================================

module.exports = {
  USER_IMAGE_FIELDS,
  COMPANY_IMAGE_FIELDS,
  PROFILE_IMAGE_FIELDS,
};
