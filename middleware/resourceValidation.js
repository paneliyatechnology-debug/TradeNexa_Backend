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
  blockedUploadField('logo', 'Logo'),
  optionalBooleanField('is_popular'),
  optionalBooleanField('is_active'),
];

const brandUpdateRules = [
  optionalRequiredText('name', 'Brand name', 2, 100),
  blockedUploadField('logo', 'Logo'),
  optionalBooleanField('is_popular'),
  optionalBooleanField('is_active'),
];

const BRAND_SORT_BY_VALUES = ['id', 'name', 'is_popular', 'is_active', 'created_at'];

const brandListQuery = [
  ...paginationQuery,
  query('is_popular')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_popular must be true or false'),
  isActiveQuery(),
  ...listSortQuery(BRAND_SORT_BY_VALUES),
];

// ==========================================
// Supplier validations
// ==========================================

const SUPPLIER_SORT_BY_VALUES = [
  'id',
  'company_name',
  'rating',
  'response_rate',
  'years_in_business',
  'created_at',
];

const supplierListQuery = [
  ...paginationQuery,
  query('is_verified')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_verified must be true or false'),
  isActiveQuery(),
  ...listSortQuery(SUPPLIER_SORT_BY_VALUES),
];

const supplierNearbyRules = [
  query('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude is required and must be between -90 and 90'),
  query('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude is required and must be between -180 and 180'),
  query('max_distance').optional().isFloat({ min: 0 }).withMessage('max_distance must be a positive number'),
  ...paginationQuery,
];

// ==========================================
// Product validations
// ==========================================

const productCreateRules = [
  body('name').trim().notEmpty().withMessage('Product name is required').isLength({ min: 2, max: 200 }).withMessage('Product name must be 2 to 200 chars'),
  blockedUploadField('thumbnail', 'Thumbnail'),
  blockedOptionalUploadField('image', 'Image'),
  blockedOptionalUploadField('video', 'Video'),
  body('price').isFloat({ min: 0 }).withMessage('Price is required and must be a positive number'),
  body('currency').optional().trim().isLength({ max: 10 }).withMessage('Currency code too long'),
  body('moq').optional().isInt({ min: 1 }).withMessage('MOQ must be at least 1'),
  body('unit').optional().trim().isLength({ max: 50 }).withMessage('Unit string too long'),
  body('supplier_id').isInt().withMessage('Supplier ID is required and must be an integer'),
  body('subcategory_id').isInt({ min: 1 }).withMessage('Subcategory ID is required and must be an integer'),
  body('brand_id').optional({ values: 'falsy' }).isInt().withMessage('Brand ID must be an integer'),
  optionalBooleanField('is_trending'),
  optionalBooleanField('is_active'),
  body('rating').optional().isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
  body('slug').optional({ values: 'falsy' }).trim().matches(/^[a-z0-9-_]+$/).withMessage('Invalid slug format'),
];

const productUpdateRules = [
  optionalRequiredText('name', 'Product name', 2, 200),
  blockedUploadField('thumbnail', 'Thumbnail'),
  blockedOptionalUploadField('image', 'Image'),
  blockedOptionalUploadField('video', 'Video'),
  optionalRequiredFloat('price', 'Price', { min: 0 }),
  body('currency').optional().trim().isLength({ max: 10 }).withMessage('Currency code too long'),
  body('moq').optional().isInt({ min: 1 }).withMessage('MOQ must be at least 1'),
  body('unit').optional().trim().isLength({ max: 50 }).withMessage('Unit string too long'),
  optionalRequiredInt('supplier_id', 'Supplier ID', { min: 1 }),
  optionalRequiredInt('subcategory_id', 'Subcategory ID', { min: 1 }),
  body('brand_id').optional({ values: 'falsy' }).isInt().withMessage('Brand ID must be an integer'),
  optionalBooleanField('is_trending'),
  optionalBooleanField('is_active'),
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
  'supplier_name',
];

const productListFilterSortQuery = [
  query('brand_id').optional().isInt().withMessage('Brand ID must be an integer'),
  query('min_price').optional().isFloat({ min: 0 }).withMessage('Min price must be positive'),
  query('max_price').optional().isFloat({ min: 0 }).withMessage('Max price must be positive'),
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
  query('is_active')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_active must be true or false'),
  ...productListFilterSortQuery,
];

const productTrendingQuery = [
  ...paginationQuery,
  query('category_id').optional().isInt({ min: 1 }).withMessage('Category ID must be an integer'),
  query('subcategory_id').optional().isInt({ min: 1 }).withMessage('Subcategory ID must be an integer'),
  ...productListFilterSortQuery,
];

const productRelatedQuery = [
  query('subcategory_id').isInt({ min: 1 }).withMessage('Subcategory ID is required'),
  query('product_id').optional().isInt({ min: 1 }).withMessage('Product ID must be a positive integer'),
  ...paginationQuery,
  ...productListFilterSortQuery,
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

const { RFQ_STATUS, RFQ_VISIBILITY, RFQ_SORT_BY_VALUES } = require('../constants/rfq');

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
  body('supplier_ids').optional().isArray().withMessage('supplier_ids must be an array'),
  body('supplier_ids.*').optional().isInt({ min: 1 }).withMessage('Each supplier ID must be a positive integer'),
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
  body('supplier_ids').optional().isArray(),
  body('supplier_ids.*').optional().isInt({ min: 1 }),
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
  supplierNearbyRules,
  supplierListQuery,
  productCreateRules,
  productUpdateRules,
  productDeleteMediaRules,
  productListQuery,
  productTrendingQuery,
  productRelatedQuery,
  offerCreateRules,
  offerUpdateRules,
  offerListQuery,
  rfqCreateRules,
  rfqUpdateRules,
  rfqListQuery,
  quotationCreateRules,
  quotationUpdateRules,
  quotationRevisionRules,
  adminRfqStatusRules,
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
};
