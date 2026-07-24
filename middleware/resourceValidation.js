/**
 * Resource validation rules for CRUD endpoints.
 *
 * express-validator schemas for route params, query strings, and request bodies.
 *
 * Shared helpers:
 * - blockedUploadField / blockedOptionalUploadField — multipart file fields (no URL strings)
 * - optionalRequired* — update-only: validate when sent, skip when omitted
 */
const { body, param, query } = require('express-validator');
const {
  PRODUCT_CONDITION_VALUES,
  PRODUCT_STOCK_STATUS_VALUES,
  PRODUCT_APPROVAL_STATUS_VALUES,
} = require('../constants/product');

// ==========================================
// Common parameters
// ==========================================

const idParam = [param('id').isInt().withMessage('ID must be an integer')];

const categoryIdParam = [
  param('categoryId').isInt({ min: 1 }).withMessage('Category ID must be a positive integer'),
];

const paginationQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().trim(),
];

/** Optional is_active filter (true/false string). */
const isActiveQuery = () =>
  query('is_active')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_active must be true or false');

/** Optional sort_by + sort_order for list endpoints. */
const listSortQuery = (values) => [
  query('sort_by')
    .optional()
    .isIn(values)
    .withMessage(`sort_by must be one of: ${values.join(', ')}`),
  query('sort_order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('sort_order must be asc or desc'),
];

// ==========================================
// Shared field helpers
// ==========================================

/**
 * Reject URL/string body values for file upload fields.
 * Empty explicit values return a required error (field was sent but not as a file).
 */
const blockedUploadField = (field, label) =>
  body(field).custom((val) => {
    if (val === undefined) return true;
    if (val === null || val === '') {
      throw new Error(`${label} is required.`);
    }
    throw new Error(`${label} must be uploaded as a file`);
  });

/** Reject non-empty URL/string values for optional file fields; allow omitted or empty keys. */
const blockedOptionalUploadField = (field, label) =>
  body(field).custom((val) => {
    if (val === undefined || val === null || val === '') return true;
    throw new Error(`${label} must be uploaded as a file`);
  });

// ==========================================
// Update-only validators (omitted = no change)
// ==========================================

/** On update: reject null/empty only when the field is explicitly sent. */
const optionalRequiredText = (field, label, min = 2, max = 200) =>
  body(field).custom((val) => {
    if (val === undefined) return true;
    if (val === null || (typeof val === 'string' && val.trim() === '')) {
      throw new Error(`${label} is required.`);
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.length < min || trimmed.length > max) {
        throw new Error(`${label} must be ${min} to ${max} chars`);
      }
    }
    return true;
  });

/** On update: reject null/empty integer when the field is explicitly sent. */
const optionalRequiredInt = (field, label, { min = 1 } = {}) =>
  body(field).custom((val) => {
    if (val === undefined) return true;
    if (val === null || val === '') throw new Error(`${label} is required.`);
    const parsed = parseInt(val, 10);
    if (Number.isNaN(parsed)) throw new Error(`${label} must be an integer`);
    if (parsed < min) throw new Error(`${label} must be at least ${min}`);
    return true;
  });

/** On update: reject null/empty number when the field is explicitly sent. */
const optionalRequiredFloat = (field, label, { min = 0 } = {}) =>
  body(field).custom((val) => {
    if (val === undefined) return true;
    if (val === null || val === '') {
      throw new Error(`${label} is required.`);
    }
    const parsed = parseFloat(val);
    if (Number.isNaN(parsed) || parsed < min) {
      throw new Error(`${label} is required and must be a positive number`);
    }
    return true;
  });

/** On update: reject null/empty ISO date when the field is explicitly sent. */
const optionalRequiredIsoDate = (field, label) =>
  body(field).custom((val) => {
    if (val === undefined) return true;
    if (val === null || val === '') throw new Error(`${label} is required.`);
    const date = new Date(val);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`${label} must be a valid ISO8601 timestamp`);
    }
    return true;
  });

/** Accept boolean values as true/false strings or booleans. */
const optionalBooleanField = (field) =>
  body(field)
    .optional({ values: 'falsy' })
    .custom((val) => {
      if (val === undefined || val === null || val === '') return true;
      if ([true, false, 'true', 'false'].includes(val)) return true;
      throw new Error(`${field} must be a boolean`);
    });

/** Required boolean on create (multipart sends strings). */
const requiredBooleanField = (field, label) =>
  body(field)
    .notEmpty()
    .withMessage(`${label} is required`)
    .custom((val) => {
      if ([true, false, 'true', 'false'].includes(val)) return true;
      throw new Error(`${label} must be true or false`);
    });

// ==========================================
// Category validations
// ==========================================

const categoryCreateRules = [
  body('name').trim().notEmpty().withMessage('Category name is required').isLength({ min: 2, max: 100 }).withMessage('Name must be 2 to 100 chars'),
  blockedUploadField('icon', 'Icon'),
  blockedOptionalUploadField('image', 'Image'),
  body('slug').optional({ values: 'falsy' }).trim().matches(/^[a-z0-9-_]+$/).withMessage('Invalid slug format'),
  optionalBooleanField('is_active'),
];

const categoryUpdateRules = [
  optionalRequiredText('name', 'Category name', 2, 100),
  blockedUploadField('icon', 'Icon'),
  blockedOptionalUploadField('image', 'Image'),
  body('slug').optional({ values: 'falsy' }).trim().matches(/^[a-z0-9-_]+$/).withMessage('Invalid slug format'),
  optionalBooleanField('is_active'),
];

const subcategoryCreateRules = [
  body('name').trim().notEmpty().withMessage('Subcategory name is required').isLength({ min: 2, max: 100 }),
  blockedUploadField('icon', 'Icon'),
  blockedOptionalUploadField('image', 'Image'),
  body('slug').optional({ values: 'falsy' }).trim().matches(/^[a-z0-9-_]+$/).withMessage('Invalid slug format'),
  optionalBooleanField('is_active'),
];

const subcategoryUpdateRules = [
  optionalRequiredText('name', 'Subcategory name', 2, 100),
  blockedUploadField('icon', 'Icon'),
  blockedOptionalUploadField('image', 'Image'),
  body('slug').optional({ values: 'falsy' }).trim().matches(/^[a-z0-9-_]+$/).withMessage('Invalid slug format'),
  optionalBooleanField('is_active'),
];

const CATEGORY_SORT_BY_VALUES = ['id', 'name', 'slug', 'is_active', 'subcategory_count', 'product_count'];
const SUBCATEGORY_SORT_BY_VALUES = ['id', 'name', 'slug', 'is_active', 'product_count'];

const categoryListQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().trim(),
  query('is_active')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_active must be true or false'),
  query('slug').optional().trim(),
  query('sort_by')
    .optional()
    .isIn(CATEGORY_SORT_BY_VALUES)
    .withMessage(`sort_by must be one of: ${CATEGORY_SORT_BY_VALUES.join(', ')}`),
  query('sort_order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('sort_order must be asc or desc'),
];

const subcategoryListQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().trim(),
  query('is_active')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_active must be true or false'),
  query('slug').optional().trim(),
  query('sort_by')
    .optional()
    .isIn(SUBCATEGORY_SORT_BY_VALUES)
    .withMessage(`sort_by must be one of: ${SUBCATEGORY_SORT_BY_VALUES.join(', ')}`),
  query('sort_order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('sort_order must be asc or desc'),
];

// ==========================================
// Banner validations
// ==========================================

const BANNER_SORT_BY_VALUES = ['id', 'title', 'priority', 'is_active', 'created_at'];

const bannerListQuery = [
  ...paginationQuery,
  isActiveQuery(),
  query('redirect_type')
    .optional()
    .trim()
    .isIn(['category', 'product', 'offer', 'brand', 'url'])
    .withMessage('Invalid redirect type'),
  ...listSortQuery(BANNER_SORT_BY_VALUES),
];

const bannerCreateRules = [
  body('title').trim().notEmpty().withMessage('Banner title is required').isLength({ min: 2, max: 200 }).withMessage('Title must be 2 to 200 chars'),
  blockedUploadField('image', 'Image'),
  body('redirect_type').optional({ values: 'falsy' }).trim().isIn(['category', 'product', 'offer', 'brand', 'url']).withMessage('Invalid redirect type'),
  body('redirect_id').optional({ values: 'falsy' }).isInt().withMessage('Redirect ID must be an integer'),
  body('priority').optional().isInt().withMessage('Priority must be an integer'),
  optionalBooleanField('is_active'),
];

const bannerUpdateRules = [
  optionalRequiredText('title', 'Banner title', 2, 200),
  blockedUploadField('image', 'Image'),
  body('redirect_type').optional({ values: 'falsy' }).trim().isIn(['category', 'product', 'offer', 'brand', 'url']).withMessage('Invalid redirect type'),
  body('redirect_id').optional({ values: 'falsy' }).isInt().withMessage('Redirect ID must be an integer'),
  body('priority').optional().isInt().withMessage('Priority must be an integer'),
  optionalBooleanField('is_active'),
];

// ==========================================
// Brand validations
// ==========================================

const brandCreateRules = [
  body('name').trim().notEmpty().withMessage('Brand name is required').isLength({ min: 2, max: 100 }).withMessage('Name must be 2 to 100 chars'),
  body('description').trim().notEmpty().withMessage('Description is required').isLength({ min: 10, max: 2000 }).withMessage('Description must be 10 to 2000 chars'),
  body('country').trim().notEmpty().withMessage('Country is required').isLength({ min: 2, max: 100 }).withMessage('Country must be 2 to 100 chars'),
  body('website').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Website too long'),
  blockedUploadField('logo', 'Logo'),
  optionalBooleanField('is_popular'),
  optionalBooleanField('is_featured'),
  optionalBooleanField('is_active'),
];

const brandUpdateRules = [
  optionalRequiredText('name', 'Brand name', 2, 100),
  optionalRequiredText('description', 'Description', 10, 2000),
  body('country').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 100 }).withMessage('Country must be 2 to 100 chars'),
  body('website').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Website too long'),
  blockedUploadField('logo', 'Logo'),
  optionalBooleanField('is_popular'),
  optionalBooleanField('is_featured'),
  optionalBooleanField('is_active'),
];

const BRAND_SORT_BY_VALUES = ['id', 'name', 'slug', 'country', 'is_popular', 'is_featured', 'is_active', 'created_at'];

const brandListQuery = [
  ...paginationQuery,
  query('country').optional().trim().isLength({ max: 100 }).withMessage('Country filter too long'),
  query('is_popular')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_popular must be true or false'),
  query('is_featured')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_featured must be true or false'),
  isActiveQuery(),
  ...listSortQuery(BRAND_SORT_BY_VALUES),
];

// ==========================================
// Seller validations
// ==========================================

const SELLER_SORT_BY_VALUES = [
  'id',
  'company_name',
  'rating',
  'response_rate',
  'years_in_business',
  'created_at',
  'product_count',
];

const sellerListQuery = [
  ...paginationQuery,
  query('is_verified')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_verified must be true or false'),
  isActiveQuery(),
  ...listSortQuery(SELLER_SORT_BY_VALUES),
];

const sellerNearbyRules = [
  query('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude is required and must be between -90 and 90'),
  query('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude is required and must be between -180 and 180'),
  query('max_distance').optional().isFloat({ min: 0 }).withMessage('max_distance must be a positive number'),
  ...paginationQuery,
];

// ==========================================
// Product validations
// ==========================================

const parseJsonBodyValue = (value, label) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
};

const productCreateRules = [
  body('name').trim().notEmpty().withMessage('Product name is required').isLength({ min: 2, max: 200 }).withMessage('Product name must be 2 to 200 chars'),
  body('category_id').isInt({ min: 1 }).withMessage('Category ID is required and must be a positive integer'),
  body('subcategory_id').isInt({ min: 1 }).withMessage('Subcategory ID is required and must be a positive integer'),
  body('brand_id').isInt({ min: 1 }).withMessage('Brand ID is required and must be a positive integer'),
  body('short_description')
    .trim()
    .notEmpty()
    .withMessage('Short description is required')
    .isLength({ min: 10, max: 500 })
    .withMessage('Short description must be 10 to 500 chars'),
  blockedUploadField('thumbnail', 'Main image'),
  blockedOptionalUploadField('image', 'Product image'),
  blockedOptionalUploadField('video', 'Product video'),
  body('price').isFloat({ min: 0 }).withMessage('Price is required and must be a positive number'),
  body('currency').trim().notEmpty().withMessage('Currency is required').isLength({ max: 10 }).withMessage('Currency code too long'),
  body('moq').isInt({ min: 1 }).withMessage('MOQ is required and must be at least 1'),
  body('unit').trim().notEmpty().withMessage('Unit is required').isLength({ max: 50 }).withMessage('Unit string too long'),
  body('material').trim().notEmpty().withMessage('Material is required').isLength({ max: 150 }).withMessage('Material must be at most 150 chars'),
  body('country_of_origin').trim().notEmpty().withMessage('Country of origin is required').isLength({ max: 100 }).withMessage('Country of origin too long'),
  body('product_condition')
    .trim()
    .notEmpty()
    .withMessage('Product condition is required')
    .isIn(PRODUCT_CONDITION_VALUES)
    .withMessage(`Product condition must be one of: ${PRODUCT_CONDITION_VALUES.join(', ')}`),
  body('stock_status')
    .trim()
    .notEmpty()
    .withMessage('Stock status is required')
    .isIn(PRODUCT_STOCK_STATUS_VALUES)
    .withMessage(`Stock status must be one of: ${PRODUCT_STOCK_STATUS_VALUES.join(', ')}`),
  requiredBooleanField('show_price', 'Show price'),
  requiredBooleanField('accept_inquiry', 'Accept inquiry'),
  requiredBooleanField('is_active', 'Product status'),
  // seller_id comes from JWT — do not accept from body
  body('description').optional({ values: 'falsy' }).trim().isLength({ max: 5000 }).withMessage('Description too long'),
  body('warranty').optional({ values: 'falsy' }).trim().isLength({ max: 100 }).withMessage('Warranty too long'),
  body('stock_quantity').optional({ values: 'falsy' }).isInt({ min: 0 }).withMessage('Stock quantity must be a non-negative integer'),
  body('hsn_code').optional({ values: 'falsy' }).trim().isLength({ max: 20 }).withMessage('HSN code too long'),
  body('gst_percentage').optional({ values: 'falsy' }).isFloat({ min: 0, max: 100 }).withMessage('GST percentage must be between 0 and 100'),
  body('search_tags').optional({ values: 'falsy' }).custom((val) => {
    if (val === undefined || val === null || val === '') return true;
    if (Array.isArray(val)) return true;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return true;
      if (trimmed.startsWith('[')) {
        parseJsonBodyValue(trimmed, 'search_tags');
        return true;
      }
      return true;
    }
    throw new Error('search_tags must be a comma-separated string or JSON array');
  }),
  body('specifications').optional({ values: 'falsy' }).custom((val) => {
    if (val === undefined || val === null || val === '') return true;
    const parsed = parseJsonBodyValue(val, 'specifications');
    if (Array.isArray(parsed) || (parsed && typeof parsed === 'object')) return true;
    throw new Error('specifications must be a JSON object or array');
  }),
  optionalBooleanField('is_trending'),
  body('rating').optional().isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
  body('slug').optional({ values: 'falsy' }).trim().matches(/^[a-z0-9-_]+$/).withMessage('Invalid slug format'),
];

const productUpdateRules = [
  optionalRequiredText('name', 'Product name', 2, 200),
  optionalRequiredInt('category_id', 'Category ID', { min: 1 }),
  optionalRequiredInt('subcategory_id', 'Subcategory ID', { min: 1 }),
  optionalRequiredInt('brand_id', 'Brand ID', { min: 1 }),
  optionalRequiredText('short_description', 'Short description', 10, 500),
  blockedUploadField('thumbnail', 'Main image'),
  blockedOptionalUploadField('image', 'Product image'),
  blockedOptionalUploadField('video', 'Product video'),
  optionalRequiredFloat('price', 'Price', { min: 0 }),
  body('currency').optional().trim().isLength({ max: 10 }).withMessage('Currency code too long'),
  body('moq').optional().isInt({ min: 1 }).withMessage('MOQ must be at least 1'),
  body('unit').optional().trim().isLength({ max: 50 }).withMessage('Unit string too long'),
  body('material').optional().trim().isLength({ max: 150 }).withMessage('Material must be at most 150 chars'),
  body('country_of_origin').optional().trim().isLength({ max: 100 }).withMessage('Country of origin too long'),
  body('product_condition')
    .optional({ values: 'falsy' })
    .trim()
    .isIn(PRODUCT_CONDITION_VALUES)
    .withMessage(`Product condition must be one of: ${PRODUCT_CONDITION_VALUES.join(', ')}`),
  body('stock_status')
    .optional({ values: 'falsy' })
    .trim()
    .isIn(PRODUCT_STOCK_STATUS_VALUES)
    .withMessage(`Stock status must be one of: ${PRODUCT_STOCK_STATUS_VALUES.join(', ')}`),
  optionalBooleanField('show_price'),
  optionalBooleanField('accept_inquiry'),
  optionalBooleanField('is_active'),
  // seller_id comes from JWT / existing owner — ignore body
  body('description').optional({ values: 'falsy' }).trim().isLength({ max: 5000 }).withMessage('Description too long'),
  body('warranty').optional({ values: 'falsy' }).trim().isLength({ max: 100 }).withMessage('Warranty too long'),
  body('stock_quantity').optional({ values: 'falsy' }).isInt({ min: 0 }).withMessage('Stock quantity must be a non-negative integer'),
  body('hsn_code').optional({ values: 'falsy' }).trim().isLength({ max: 20 }).withMessage('HSN code too long'),
  body('gst_percentage').optional({ values: 'falsy' }).isFloat({ min: 0, max: 100 }).withMessage('GST percentage must be between 0 and 100'),
  body('search_tags').optional({ values: 'falsy' }).custom((val) => {
    if (val === undefined || val === null || val === '') return true;
    if (Array.isArray(val)) return true;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return true;
      if (trimmed.startsWith('[')) parseJsonBodyValue(trimmed, 'search_tags');
      return true;
    }
    throw new Error('search_tags must be a comma-separated string or JSON array');
  }),
  body('specifications').optional({ values: 'falsy' }).custom((val) => {
    if (val === undefined || val === null || val === '') return true;
    const parsed = parseJsonBodyValue(val, 'specifications');
    if (Array.isArray(parsed) || (parsed && typeof parsed === 'object')) return true;
    throw new Error('specifications must be a JSON object or array');
  }),
  optionalBooleanField('is_trending'),
  body('rating').optional().isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
  body('slug').optional({ values: 'falsy' }).trim().matches(/^[a-z0-9-_]+$/).withMessage('Invalid slug format'),
];

const productDeleteMediaRules = [
  body('image_ids')
    .optional()
    .isArray({ min: 1 })
    .withMessage('image_ids must be a non-empty array when provided'),
  body('image_ids.*').isInt({ min: 1 }).withMessage('Each image ID must be a positive integer'),
  body('video_ids')
    .optional()
    .isArray({ min: 1 })
    .withMessage('video_ids must be a non-empty array when provided'),
  body('video_ids.*').isInt({ min: 1 }).withMessage('Each video ID must be a positive integer'),
  body().custom((value) => {
    const imageIds = value.image_ids || [];
    const videoIds = value.video_ids || [];
    if (!imageIds.length && !videoIds.length) {
      throw new Error('At least one of image_ids or video_ids is required');
    }
    return true;
  }),
];

const PRODUCT_SORT_BY_VALUES = [
  'id',
  'name',
  'slug',
  'price',
  'moq',
  'rating',
  'is_trending',
  'created_at',
  'updated_at',
  'submitted_at',
  'reviewed_at',
  'seller_name',
];

const productListFilterSortQuery = [
  query('brand_id').optional().isInt().withMessage('Brand ID must be an integer'),
  query('seller_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('seller_id must be a positive integer'),
  query('min_price').optional().isFloat({ min: 0 }).withMessage('Min price must be positive'),
  query('max_price').optional().isFloat({ min: 0 }).withMessage('Max price must be positive'),
  query('is_wishlist')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_wishlist must be true or false'),
  query('approval_status')
    .optional()
    .isIn([...PRODUCT_APPROVAL_STATUS_VALUES, 'all'])
    .withMessage(`approval_status must be one of: ${PRODUCT_APPROVAL_STATUS_VALUES.join(', ')}, all`),
  query('sort_by')
    .optional()
    .isIn(PRODUCT_SORT_BY_VALUES)
    .withMessage(`sort_by must be one of: ${PRODUCT_SORT_BY_VALUES.join(', ')}`),
  query('sort_order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('sort_order must be asc or desc'),
];

/** Catalog filters/sort without query seller_id (seller is path :id). */
const productCatalogFilterSortQuery = [
  query('brand_id').optional().isInt().withMessage('Brand ID must be an integer'),
  query('min_price').optional().isFloat({ min: 0 }).withMessage('Min price must be positive'),
  query('max_price').optional().isFloat({ min: 0 }).withMessage('Max price must be positive'),
  query('is_wishlist')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_wishlist must be true or false'),
  query('sort_by')
    .optional()
    .isIn(PRODUCT_SORT_BY_VALUES)
    .withMessage(`sort_by must be one of: ${PRODUCT_SORT_BY_VALUES.join(', ')}`),
  query('sort_order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('sort_order must be asc or desc'),
];

const productListQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().trim(),
  query('category_id').optional().isInt({ min: 1 }).withMessage('Category ID must be an integer'),
  query('subcategory_id').optional().isInt({ min: 1 }).withMessage('Subcategory ID must be an integer'),
  query('city_id').optional().isInt({ min: 1 }).withMessage('City ID must be a positive integer'),
  query('is_active')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_active must be true or false'),
  ...productListFilterSortQuery,
];

/** GET /sellers/:id/products — path seller_id + full catalog filters. */
const sellerProductsQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().trim(),
  query('category_id').optional().isInt({ min: 1 }).withMessage('Category ID must be an integer'),
  query('subcategory_id').optional().isInt({ min: 1 }).withMessage('Subcategory ID must be an integer'),
  query('city_id').optional().isInt({ min: 1 }).withMessage('City ID must be a positive integer'),
  query('is_active')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_active must be true or false'),
  query('is_trending')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_trending must be true or false'),
  ...productCatalogFilterSortQuery,
];

const productTrendingQuery = [
  ...paginationQuery,
  query('category_id').optional().isInt({ min: 1 }).withMessage('Category ID must be an integer'),
  query('subcategory_id').optional().isInt({ min: 1 }).withMessage('Subcategory ID must be an integer'),
  query('city_id').optional().isInt({ min: 1 }).withMessage('City ID must be a positive integer'),
  ...productListFilterSortQuery,
];

const productRelatedQuery = [
  query('subcategory_id').isInt({ min: 1 }).withMessage('Subcategory ID is required'),
  query('product_id').optional().isInt({ min: 1 }).withMessage('Product ID must be a positive integer'),
  query('city_id').optional().isInt({ min: 1 }).withMessage('City ID must be a positive integer'),
  ...paginationQuery,
  ...productListFilterSortQuery,
];

/**
 * Admin approve — product_ids always an array (1–100), remarks optional.
 * Use [12] for one product or [12, 15, 18] for many.
 */
const productApproveRules = [
  body('product_ids').isArray({ min: 1, max: 100 }).withMessage('product_ids must be an array of 1 to 100 IDs'),
  body('product_ids.*').isInt({ min: 1 }).withMessage('Each product ID must be a positive integer'),
  body('remarks')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Remarks must be 10 to 2000 characters'),
];

/**
 * Admin request-revision / reject — product_ids[] + required shared remarks.
 */
const productRevisionOrRejectRules = [
  body('product_ids').isArray({ min: 1, max: 100 }).withMessage('product_ids must be an array of 1 to 100 IDs'),
  body('product_ids.*').isInt({ min: 1 }).withMessage('Each product ID must be a positive integer'),
  body('remarks')
    .trim()
    .notEmpty()
    .withMessage('Remarks are required')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Remarks must be 10 to 2000 characters'),
];

/** GET /products/admin/reviews query params. */
const productAdminReviewQuery = [
  ...paginationQuery,
  query('approval_status')
    .optional()
    .isIn([...PRODUCT_APPROVAL_STATUS_VALUES, 'all'])
    .withMessage(`approval_status must be one of: ${PRODUCT_APPROVAL_STATUS_VALUES.join(', ')}, all`),
  query('category_id').optional().isInt({ min: 1 }),
  query('brand_id').optional().isInt({ min: 1 }),
  query('seller_id').optional().isInt({ min: 1 }),
  query('search').optional().trim(),
  query('sort_by')
    .optional()
    .isIn(PRODUCT_SORT_BY_VALUES)
    .withMessage(`sort_by must be one of: ${PRODUCT_SORT_BY_VALUES.join(', ')}`),
  query('sort_order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('sort_order must be asc or desc'),
  query('is_active').optional().isIn(['true', 'false']),
];

// ==========================================
// Offer validations
// ==========================================

const OFFER_SORT_BY_VALUES = ['id', 'title', 'discount', 'expiry_date', 'is_active', 'created_at'];

const offerListQuery = [
  ...paginationQuery,
  isActiveQuery(),
  query('include_expired')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('include_expired must be true or false'),
  ...listSortQuery(OFFER_SORT_BY_VALUES),
];

const offerCreateRules = [
  body('title').trim().notEmpty().withMessage('Offer title is required').isLength({ min: 2, max: 200 }).withMessage('Title must be 2 to 200 chars'),
  blockedOptionalUploadField('banner', 'Banner'),
  body('discount').notEmpty().withMessage('Discount is required').isFloat({ min: 0 }).withMessage('Discount must be a positive number'),
  body('expiry_date').notEmpty().withMessage('Expiry date is required').isISO8601().withMessage('Expiry date must be a valid ISO8601 timestamp'),
  optionalBooleanField('is_active'),
];

const offerUpdateRules = [
  optionalRequiredText('title', 'Offer title', 2, 200),
  blockedOptionalUploadField('banner', 'Banner'),
  optionalRequiredFloat('discount', 'Discount', { min: 0 }),
  optionalRequiredIsoDate('expiry_date', 'Expiry date'),
  optionalBooleanField('is_active'),
];

// ==========================================
// RFQ validations
// ==========================================

const { RFQ_STATUS, RFQ_VISIBILITY, RFQ_SORT_BY_VALUES, QUOTATION_STATUS, QUOTATION_SORT_BY_VALUES } = require('../constants/rfq');
const {
  INQUIRY_STATUS_VALUES,
  INQUIRY_SORT_BY_VALUES,
} = require('../constants/inquiry');

// ==========================================
// Inquiry validations (/inquiries)
// ==========================================

/** POST /inquiries — buyer product inquiry form. */
const inquiryCreateRules = [
  body('product_id').isInt({ min: 1 }).withMessage('product_id is required and must be a positive integer'),
  body('quantity').isInt({ min: 1 }).withMessage('quantity is required and must be at least 1'),
  body('message')
    .trim()
    .notEmpty()
    .withMessage('message is required')
    .isLength({ min: 10, max: 2000 })
    .withMessage('message must be 10 to 2000 characters'),
  body('unit').optional({ values: 'falsy' }).trim().isLength({ max: 50 }).withMessage('Unit must be at most 50 characters'),
  body('expected_price').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('expected_price must be positive'),
  body('currency').optional({ values: 'falsy' }).trim().isLength({ max: 10 }),
  body('required_before').optional({ values: 'falsy' }).isISO8601().withMessage('required_before must be a valid ISO8601 timestamp'),
];

/** PUT /inquiries/:id — buyer may update while pending. */
const inquiryUpdateRules = [
  body('quantity').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('quantity must be at least 1'),
  body('message')
    .optional()
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('message must be 10 to 2000 characters'),
  body('unit').optional({ values: 'falsy' }).trim().isLength({ max: 50 }),
  body('expected_price').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('currency').optional({ values: 'falsy' }).trim().isLength({ max: 10 }),
  body('required_before').optional({ values: 'falsy' }).isISO8601(),
];

/** GET /inquiries/my and /inquiries/seller list query. */
const inquiryListQuery = [
  ...paginationQuery,
  query('status').optional().isIn(INQUIRY_STATUS_VALUES).withMessage('Invalid inquiry status'),
  query('product_id').optional().isInt({ min: 1 }).withMessage('product_id must be a positive integer'),
  query('date')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('date must be YYYY-MM-DD'),
  ...listSortQuery(INQUIRY_SORT_BY_VALUES),
];

const SELLER_TOP_PERFORMING_PRODUCT_SORT_BY_VALUES = [
  'inquiries_total',
  'inquiries_pending',
  'inquiries_quoted',
  'inquiries_accepted',
  'name',
  'price',
  'id',
  'created_at',
];

/** GET /dashboard/seller/top-performing-products */
const sellerTopPerformingProductsQuery = [
  ...paginationQuery,
  ...listSortQuery(SELLER_TOP_PERFORMING_PRODUCT_SORT_BY_VALUES),
];

/** POST /inquiries/:id/reject — optional seller reason. */
const inquiryRejectRules = [
  body('reason').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }),
  body('reject_reason').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }),
];

const RFQ_PINCODE_REGEX = /^[1-9][0-9]{5}$/;

const rfqDateFields = [
  body('required_before').optional({ values: 'falsy' }).isISO8601().withMessage('Required before must be a valid ISO8601 timestamp'),
  body('quotation_deadline').optional({ values: 'falsy' }).isISO8601().withMessage('Quotation deadline must be a valid ISO8601 timestamp'),
];

const rfqAddressFields = [
  body('address_line_1').trim().notEmpty().withMessage('Address line 1 is required').isLength({ min: 3, max: 255 }),
  body('address_line_2').optional({ values: 'falsy' }).trim().isLength({ max: 255 }),
  body('city').trim().notEmpty().withMessage('City is required').isLength({ min: 2, max: 100 }),
  body('state').trim().notEmpty().withMessage('State is required').isLength({ min: 2, max: 100 }),
  body('country').trim().notEmpty().withMessage('Country is required').isLength({ min: 2, max: 100 }),
  body('pincode').trim().notEmpty().withMessage('Pincode is required').matches(RFQ_PINCODE_REGEX).withMessage('Invalid pincode'),
];

const rfqAddressUpdateFields = [
  body('address_line_1').optional({ values: 'falsy' }).trim().isLength({ min: 3, max: 255 }).withMessage('Address line 1 must be 3 to 255 chars'),
  body('address_line_2').optional({ values: 'falsy' }).trim().isLength({ max: 255 }),
  body('city').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 100 }),
  body('state').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 100 }),
  body('country').optional({ values: 'falsy' }).trim().isLength({ min: 2, max: 100 }),
  body('pincode').optional({ values: 'falsy' }).trim().matches(RFQ_PINCODE_REGEX).withMessage('Invalid pincode'),
];

const rfqCreateRules = [
  body('title').trim().notEmpty().withMessage('RFQ title is required').isLength({ min: 2, max: 200 }).withMessage('Title must be 2 to 200 chars'),
  body('category_id').isInt({ min: 1 }).withMessage('Category ID is required and must be an integer'),
  body('subcategory_id').isInt({ min: 1 }).withMessage('Subcategory ID is required and must be an integer'),
  body('description').trim().notEmpty().withMessage('Description is required').isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity is required and must be at least 1'),
  body('unit').trim().notEmpty().withMessage('Unit is required').isLength({ max: 50 }).withMessage('Unit must be at most 50 characters'),
  body('quotation_deadline').isISO8601().withMessage('Quotation deadline is required and must be a valid ISO8601 timestamp'),
  ...rfqAddressFields,
  body('product_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Product ID must be an integer'),
  body('expected_price').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Expected price must be positive'),
  body('budget').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Budget must be positive'),
  body('currency').optional({ values: 'falsy' }).trim().isLength({ max: 10 }),
  body('required_before').optional({ values: 'falsy' }).isISO8601().withMessage('Required before must be a valid ISO8601 timestamp'),
  body('payment_terms').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  body('visibility').optional().isIn(Object.values(RFQ_VISIBILITY)).withMessage('Invalid visibility'),
  body('seller_ids')
    .optional()
    .customSanitizer((value) => {
      if (value === undefined || value === null || value === '') return undefined;
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          /* fall through */
        }
        return value.split(',').map((part) => part.trim()).filter(Boolean);
      }
      return value;
    })
    .isArray()
    .withMessage('seller_ids must be an array'),
  body('seller_ids.*').toInt().isInt({ min: 1 }).withMessage('Each seller ID must be a positive integer'),
];

const rfqUpdateRules = [
  optionalRequiredText('title', 'RFQ title', 2, 200),
  optionalRequiredInt('category_id', 'Category ID', { min: 1 }),
  optionalRequiredInt('subcategory_id', 'Subcategory ID', { min: 1 }),
  body('description').optional({ values: 'falsy' }).trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  ...rfqAddressUpdateFields,
  body('product_id').optional({ values: 'falsy' }).isInt({ min: 1 }),
  body('unit').optional({ values: 'falsy' }).trim().isLength({ max: 50 }).withMessage('Unit must be at most 50 characters'),
  body('quantity').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('expected_price').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Expected price must be positive'),
  body('budget').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Budget must be positive'),
  body('currency').optional({ values: 'falsy' }).trim().isLength({ max: 10 }),
  body('payment_terms').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  body('visibility').optional().isIn(Object.values(RFQ_VISIBILITY)).withMessage('Invalid visibility'),
  body('seller_ids')
    .optional()
    .customSanitizer((value) => {
      if (value === undefined || value === null || value === '') return undefined;
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          /* fall through */
        }
        return value.split(',').map((part) => part.trim()).filter(Boolean);
      }
      return value;
    })
    .isArray()
    .withMessage('seller_ids must be an array'),
  body('seller_ids.*').optional().toInt().isInt({ min: 1 }),
  ...rfqDateFields,
];

const rfqListQuery = [
  query('category_id').optional().isInt().withMessage('Category ID must be an integer'),
  query('subcategory_id').optional().isInt({ min: 1 }).withMessage('Subcategory ID must be an integer'),
  query('city').optional().trim().isLength({ max: 100 }).withMessage('City filter too long'),
  query('state').optional().trim().isLength({ max: 100 }).withMessage('State filter too long'),
  query('country').optional().trim().isLength({ max: 100 }).withMessage('Country filter too long'),
  query('buyer_id').optional().isInt({ min: 1 }).withMessage('Buyer ID must be a positive integer'),
  query('status').optional().isIn(Object.values(RFQ_STATUS)).withMessage('Invalid RFQ status'),
  query('min_budget').optional().isFloat({ min: 0 }).withMessage('Min budget must be positive'),
  query('max_budget').optional().isFloat({ min: 0 }).withMessage('Max budget must be positive'),
  query('min_expected_price').optional().isFloat({ min: 0 }).withMessage('Min expected price must be positive'),
  query('max_expected_price').optional().isFloat({ min: 0 }).withMessage('Max expected price must be positive'),
  query('date_from').optional().isISO8601().withMessage('date_from must be a valid ISO8601 timestamp'),
  query('date_to').optional().isISO8601().withMessage('date_to must be a valid ISO8601 timestamp'),
  query('date')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('date must be YYYY-MM-DD'),
  ...paginationQuery,
  isActiveQuery(),
  ...listSortQuery(RFQ_SORT_BY_VALUES),
];

const quotationCreateRules = [
  body('price').isFloat({ min: 0 }).withMessage('Price is required and must be positive'),
  body('quantity').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('unit').optional({ values: 'falsy' }).trim().isLength({ max: 50 }).withMessage('Unit must be at most 50 characters'),
  body('gst_percentage').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('GST percentage must be positive'),
  body('transportation_charge').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('delivery_days').optional({ values: 'falsy' }).isInt({ min: 0 }),
  body('payment_terms').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  body('validity_days').optional({ values: 'falsy' }).isInt({ min: 1 }),
  body('remarks').optional({ values: 'falsy' }).trim(),
];

const quotationUpdateRules = [
  optionalRequiredFloat('price', 'Price', { min: 0 }),
  body('quantity').optional({ values: 'falsy' }).isInt({ min: 1 }),
  body('unit').optional({ values: 'falsy' }).trim().isLength({ max: 50 }).withMessage('Unit must be at most 50 characters'),
  body('gst_percentage').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('transportation_charge').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('delivery_days').optional({ values: 'falsy' }).isInt({ min: 0 }),
  body('payment_terms').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  body('validity_days').optional({ values: 'falsy' }).isInt({ min: 1 }),
  body('remarks').optional({ values: 'falsy' }).trim(),
];

const quotationRevisionRules = [
  body('remarks').trim().notEmpty().withMessage('Revision remarks are required'),
];

const adminRfqStatusRules = [
  body('status').isIn(Object.values(RFQ_STATUS)).withMessage('Invalid RFQ status'),
];

const quotationListQuery = [
  ...paginationQuery,
  query('status').optional().isIn(Object.values(QUOTATION_STATUS)).withMessage('Invalid quotation status'),
  query('rfq_id').optional().isInt({ min: 1 }).withMessage('rfq_id must be a positive integer'),
  query('inquiry_id').optional().isInt({ min: 1 }).withMessage('inquiry_id must be a positive integer'),
  query('seller_id').optional().isInt({ min: 1 }).withMessage('seller_id must be a positive integer'),
  ...listSortQuery(QUOTATION_SORT_BY_VALUES),
];

const rfqLatestQuery = [
  ...paginationQuery,
  ...listSortQuery(RFQ_SORT_BY_VALUES),
];

// ==========================================
// Service validations
// ==========================================

const SERVICE_SORT_BY_VALUES = ['id', 'name', 'is_active', 'created_at'];

const serviceListQuery = [
  ...paginationQuery,
  isActiveQuery(),
  ...listSortQuery(SERVICE_SORT_BY_VALUES),
];

const serviceCreateRules = [
  body('name').trim().notEmpty().withMessage('Service name is required').isLength({ min: 2, max: 100 }).withMessage('Name must be 2 to 100 chars'),
  blockedOptionalUploadField('icon', 'Icon'),
  body('description').optional({ values: 'falsy' }).trim(),
  optionalBooleanField('is_active'),
];

const serviceUpdateRules = [
  optionalRequiredText('name', 'Service name', 2, 100),
  blockedOptionalUploadField('icon', 'Icon'),
  body('description').optional({ values: 'falsy' }).trim(),
  optionalBooleanField('is_active'),
];

// ==========================================
// News validations
// ==========================================

const NEWS_SORT_BY_VALUES = ['id', 'title', 'published_at', 'is_active', 'created_at'];

const newsListQuery = [
  ...paginationQuery,
  isActiveQuery(),
  ...listSortQuery(NEWS_SORT_BY_VALUES),
];

const newsCreateRules = [
  body('title').trim().notEmpty().withMessage('News title is required').isLength({ min: 2, max: 200 }).withMessage('Title must be 2 to 200 chars'),
  blockedOptionalUploadField('thumbnail', 'Thumbnail'),
  body('content').trim().notEmpty().withMessage('News content is required'),
  body('published_at').optional({ values: 'falsy' }).isISO8601().withMessage('Published date must be a valid ISO8601 timestamp'),
  optionalBooleanField('is_active'),
];

const newsUpdateRules = [
  optionalRequiredText('title', 'News title', 2, 200),
  blockedOptionalUploadField('thumbnail', 'Thumbnail'),
  optionalRequiredText('content', 'News content', 1, 50000),
  body('published_at').optional({ values: 'falsy' }).isISO8601().withMessage('Published date must be a valid ISO8601 timestamp'),
  optionalBooleanField('is_active'),
];

// ==========================================
// Business type validations
// ==========================================

const BUSINESS_TYPE_SORT_BY_VALUES = ['id', 'name', 'code', 'is_active', 'created_at'];

const businessTypeListQuery = [
  query('role_id').optional().isInt({ min: 1 }).withMessage('role_id must be a positive integer'),
  ...paginationQuery,
  isActiveQuery(),
  ...listSortQuery(BUSINESS_TYPE_SORT_BY_VALUES),
];

const businessTypeCreateRules = [
  body('name').trim().notEmpty().isLength({ min: 2, max: 100 }).withMessage('Name is required'),
  body('code').optional({ values: 'falsy' }).trim().isLength({ max: 50 }),
  body('role_id').isInt({ min: 1 }).withMessage('role_id is required'),
  body('is_active').optional().isBoolean(),
];

const businessTypeUpdateRules = [
  optionalRequiredText('name', 'Name', 2, 100),
  body('code').optional({ values: 'falsy' }).trim().isLength({ max: 50 }),
  optionalRequiredInt('role_id', 'role_id', { min: 1 }),
  body('is_active').optional().isBoolean(),
];

// ==========================================
// Role validations
// ==========================================

const ROLE_SORT_BY_VALUES = ['id', 'name', 'code', 'is_active', 'created_at'];

const roleListQuery = [
  ...paginationQuery,
  isActiveQuery(),
  ...listSortQuery(ROLE_SORT_BY_VALUES),
];

// ==========================================
// Chat validations (/chats)
// ==========================================

const { CHAT_MESSAGE_TYPE_VALUES, CHAT_CONVERSATION_SORT_BY_VALUES } = require('../constants/chat');

/** GET /chats/conversations — inbox list query params. */
const chatConversationListQuery = [
  ...paginationQuery,
  query('rfq_id').optional().isInt({ min: 1 }).withMessage('rfq_id must be a positive integer'),
  query('inquiry_id').optional().isInt({ min: 1 }).withMessage('inquiry_id must be a positive integer'),
  query('context_type').optional().isIn(['rfq', 'inquiry']).withMessage('context_type must be rfq or inquiry'),
  query('role').optional().isIn(['buyer', 'seller']).withMessage('role must be buyer or seller'),
  query('search').optional().trim(),
  ...listSortQuery(CHAT_CONVERSATION_SORT_BY_VALUES),
];

/** GET /chats/conversations/:id/messages — message history query params. */
const chatMessageListQuery = [
  ...paginationQuery,
  query('before_id').optional().isInt({ min: 1 }).withMessage('before_id must be a positive integer'),
  query('after_id').optional().isInt({ min: 1 }).withMessage('after_id must be a positive integer'),
  query('order').optional().isIn(['asc', 'desc']).withMessage('order must be asc or desc'),
];

/** POST /chats/conversations — start or get RFQ or inquiry thread. */
const chatStartConversationRules = [
  body('rfq_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('rfq_id must be a positive integer'),
  body('inquiry_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('inquiry_id must be a positive integer'),
  body('seller_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('seller_id must be a positive integer'),
  body().custom((_, { req }) => {
    const hasRfq = !!req.body.rfq_id;
    const hasInquiry = !!req.body.inquiry_id;
    if (hasRfq === hasInquiry) {
      throw new Error('Provide exactly one of rfq_id or inquiry_id');
    }
    return true;
  }),
];

/** POST /chats/conversations/:id/messages — TEXT, PRODUCT, QUOTATION body rules. */
const chatMessageRules = [
  body('message_type')
    .trim()
    .notEmpty()
    .isIn(CHAT_MESSAGE_TYPE_VALUES.filter((type) => type !== 'SYSTEM' && type !== 'IMAGE' && type !== 'DOCUMENT'))
    .withMessage('Invalid message type'),
  body('content')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Message content too long'),
  body('message_type').custom((value, { req }) => {
    if (value === 'TEXT' && (!req.body.content || !String(req.body.content).trim())) {
      throw new Error('content is required for TEXT messages');
    }
    if (value === 'PRODUCT' && !req.body.product_id) {
      throw new Error('product_id is required for PRODUCT messages');
    }
    if (value === 'QUOTATION' && !req.body.quotation_id) {
      throw new Error('quotation_id is required for QUOTATION messages');
    }
    return true;
  }),
  body('product_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('product_id must be a positive integer'),
  body('quotation_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('quotation_id must be a positive integer'),
  body('reply_to_message_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('reply_to_message_id must be a positive integer'),
];

/** POST /chats/conversations/:id/messages/media — IMAGE, DOCUMENT multipart rules. */
const chatMediaMessageRules = [
  body('message_type')
    .trim()
    .notEmpty()
    .isIn(['IMAGE', 'DOCUMENT'])
    .withMessage('message_type must be IMAGE or DOCUMENT'),
  body('content')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Caption too long'),
];

/** POST /chats/conversations/:id/read — read receipt body rules. */
const chatMarkReadRules = [
  body('last_read_message_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('last_read_message_id must be a positive integer'),
];

// ==========================================
// Wishlist validations
// ==========================================

const wishlistAddRules = [
  body('product_id').isInt({ min: 1 }).withMessage('Product ID is required and must be a positive integer'),
];

const wishlistToggleRules = [...wishlistAddRules];

const wishlistProductIdParam = [
  param('product_id').isInt({ min: 1 }).withMessage('Product ID must be a positive integer'),
];

const WISHLIST_SORT_BY_VALUES = ['wishlisted_at', 'id', 'name', 'price', 'rating', 'created_at'];

const wishlistListQuery = [
  ...paginationQuery,
  query('search').optional().trim(),
  ...listSortQuery(WISHLIST_SORT_BY_VALUES),
];

// ==========================================
// Notification validations (/notifications)
// ==========================================

const { IN_APP_NOTIFICATION_TYPES, NOTIFICATION_ROLE_VALUES } = require('../constants/notification');

const notificationListQuery = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('is_read')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_read must be true or false'),
  query('type')
    .optional()
    .trim()
    .isIn(IN_APP_NOTIFICATION_TYPES)
    .withMessage(`type must be one of: ${IN_APP_NOTIFICATION_TYPES.join(', ')}`),
  query('role')
    .optional()
    .trim()
    .isIn(NOTIFICATION_ROLE_VALUES)
    .withMessage(`role must be one of: ${NOTIFICATION_ROLE_VALUES.join(', ')}`),
];

const notificationUnreadCountQuery = [
  query('role')
    .optional()
    .trim()
    .isIn(NOTIFICATION_ROLE_VALUES)
    .withMessage(`role must be one of: ${NOTIFICATION_ROLE_VALUES.join(', ')}`),
];

const notificationMarkManyReadRules = [
  body('ids').isArray({ min: 1, max: 100 }).withMessage('ids must be an array of 1 to 100 IDs'),
  body('ids.*').isInt({ min: 1 }).withMessage('Each id must be a positive integer'),
];

const notificationMarkAllReadRules = [
  query('role')
    .optional()
    .trim()
    .isIn(NOTIFICATION_ROLE_VALUES)
    .withMessage(`role must be one of: ${NOTIFICATION_ROLE_VALUES.join(', ')}`),
  body('role')
    .optional()
    .trim()
    .isIn(NOTIFICATION_ROLE_VALUES)
    .withMessage(`role must be one of: ${NOTIFICATION_ROLE_VALUES.join(', ')}`),
];

// ==========================================
// Location validations
// ==========================================

const LOCATION_COUNTRY_SORT_BY_VALUES = ['name', 'code', 'id', 'created_at'];
const LOCATION_STATE_SORT_BY_VALUES = ['name', 'code', 'id', 'created_at'];
const LOCATION_CITY_SORT_BY_VALUES = ['name', 'id', 'created_at'];

const locationCountriesQuery = [
  ...paginationQuery,
  query('search').optional().trim(),
  query('code').optional().trim().isLength({ max: 10 }).withMessage('code filter too long'),
  isActiveQuery(),
  ...listSortQuery(LOCATION_COUNTRY_SORT_BY_VALUES),
];

const locationStatesQuery = [
  query('country_id')
    .notEmpty()
    .withMessage('country_id is required')
    .isInt({ min: 1 })
    .withMessage('country_id must be a positive integer'),
  ...paginationQuery,
  query('search').optional().trim(),
  query('code').optional().trim().isLength({ max: 10 }).withMessage('code filter too long'),
  isActiveQuery(),
  ...listSortQuery(LOCATION_STATE_SORT_BY_VALUES),
];

const locationCitiesQuery = [
  query('state_id').optional().isInt({ min: 1 }).withMessage('state_id must be a positive integer'),
  ...paginationQuery,
  query('search').optional().trim(),
  isActiveQuery(),
  ...listSortQuery(LOCATION_CITY_SORT_BY_VALUES),
];

module.exports = {
  idParam,
  categoryIdParam,
  paginationQuery,
  categoryCreateRules,
  categoryUpdateRules,
  categoryListQuery,
  subcategoryCreateRules,
  subcategoryUpdateRules,
  subcategoryListQuery,
  bannerCreateRules,
  bannerUpdateRules,
  bannerListQuery,
  brandCreateRules,
  brandUpdateRules,
  brandListQuery,
  sellerNearbyRules,
  sellerListQuery,
  /** @deprecated */ supplierNearbyRules: sellerNearbyRules,
  /** @deprecated */ supplierListQuery: sellerListQuery,
  productCreateRules,
  productUpdateRules,
  productDeleteMediaRules,
  productListQuery,
  sellerProductsQuery,
  productTrendingQuery,
  productRelatedQuery,
  productApproveRules,
  productRevisionOrRejectRules,
  productAdminReviewQuery,
  offerCreateRules,
  offerUpdateRules,
  offerListQuery,
  rfqCreateRules,
  rfqUpdateRules,
  rfqListQuery,
  rfqLatestQuery,
  quotationListQuery,
  quotationCreateRules,
  quotationUpdateRules,
  quotationRevisionRules,
  adminRfqStatusRules,
  inquiryCreateRules,
  inquiryUpdateRules,
  inquiryListQuery,
  inquiryRejectRules,
  sellerTopPerformingProductsQuery,
  serviceCreateRules,
  serviceUpdateRules,
  serviceListQuery,
  newsCreateRules,
  newsUpdateRules,
  newsListQuery,
  businessTypeListQuery,
  businessTypeCreateRules,
  businessTypeUpdateRules,
  roleListQuery,
  chatConversationListQuery,
  chatMessageListQuery,
  chatStartConversationRules,
  chatMessageRules,
  chatMediaMessageRules,
  chatMarkReadRules,
  wishlistAddRules,
  wishlistToggleRules,
  wishlistListQuery,
  wishlistProductIdParam,
  notificationListQuery,
  notificationUnreadCountQuery,
  notificationMarkManyReadRules,
  notificationMarkAllReadRules,
  locationCountriesQuery,
  locationStatesQuery,
  locationCitiesQuery,
};
