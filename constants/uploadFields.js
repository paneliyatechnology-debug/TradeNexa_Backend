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

/** POST/PUT /offers — DB column is `banner` */
const OFFER_UPLOAD_FIELDS = [{ name: 'banner', maxCount: 1 }];

/** POST/PUT /news */
const NEWS_UPLOAD_FIELDS = [{ name: 'thumbnail', maxCount: 1 }];

/** POST/PUT /services */
const SERVICE_UPLOAD_FIELDS = [{ name: 'icon', maxCount: 1 }];

/** Max combined gallery images + videos per product (thumbnail excluded). */
const MAX_PRODUCT_GALLERY_MEDIA = 10;

/**
 * Multer per-field max for image/video.
 * Set above the business limit so validateProductGalleryMediaCount runs first
 * and returns the proper validation message (not a Multer "Unexpected field" error).
 */
const PRODUCT_GALLERY_MULTER_MAX_PER_FIELD = MAX_PRODUCT_GALLERY_MEDIA * 2;

/** POST/PUT /products — thumbnail + gallery image/video fields */
const PRODUCT_UPLOAD_FIELDS = [
  { name: 'thumbnail', maxCount: 1 },
  { name: 'image', maxCount: PRODUCT_GALLERY_MULTER_MAX_PER_FIELD },
  { name: 'video', maxCount: PRODUCT_GALLERY_MULTER_MAX_PER_FIELD },
];

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
  OFFER_UPLOAD_FIELDS,
  NEWS_UPLOAD_FIELDS,
  SERVICE_UPLOAD_FIELDS,
  PRODUCT_UPLOAD_FIELDS,
  PRODUCT_IMAGE_FIELD_NAMES,
  PRODUCT_VIDEO_FIELD_NAMES,
  MAX_PRODUCT_GALLERY_MEDIA,
};
