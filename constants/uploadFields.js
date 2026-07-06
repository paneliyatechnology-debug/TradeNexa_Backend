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

/** POST/PUT /brands */
const BRAND_UPLOAD_FIELDS = [{ name: 'logo', maxCount: 1 }];

/** POST/PUT /banners */
const BANNER_UPLOAD_FIELDS = [{ name: 'image', maxCount: 1 }];

const PRODUCT_UPLOAD_FIELDS = [
  { name: 'thumbnail', maxCount: 1 },
  { name: 'image', maxCount: 10 },
  { name: 'video', maxCount: 10 },
];

/** Max combined gallery images + videos per product (thumbnail excluded). */
const MAX_PRODUCT_GALLERY_MEDIA = 10;

const PRODUCT_IMAGE_FIELD_NAMES = ['thumbnail', 'image'];
const PRODUCT_VIDEO_FIELD_NAMES = ['video'];

// ==========================================
// Exports
// ==========================================

module.exports = {
  PROFILE_UPLOAD_FIELDS,
  CATEGORY_UPLOAD_FIELDS,
  BRAND_UPLOAD_FIELDS,
  BANNER_UPLOAD_FIELDS,
  PRODUCT_UPLOAD_FIELDS,
  PRODUCT_IMAGE_FIELD_NAMES,
  PRODUCT_VIDEO_FIELD_NAMES,
  MAX_PRODUCT_GALLERY_MEDIA,
};
