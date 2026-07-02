/**
 * Multer field definitions shared across upload middleware.
 * Each entry: { name, maxCount } — maps to multipart form field names.
 */

// ==========================================
// Upload field definitions
// ==========================================

/** PUT /auth/profile */
const PROFILE_UPLOAD_FIELDS = [
  { name: 'profile_image', maxCount: 1 },
  { name: 'company_logo', maxCount: 1 },
  { name: 'company_banner', maxCount: 1 },
];

/** POST/PUT /categories and subcategories */
const CATEGORY_UPLOAD_FIELDS = [
  { name: 'icon', maxCount: 1 },
  { name: 'image', maxCount: 1 },
];

// ==========================================
// Exports
// ==========================================

module.exports = {
  PROFILE_UPLOAD_FIELDS,
  CATEGORY_UPLOAD_FIELDS,
};
