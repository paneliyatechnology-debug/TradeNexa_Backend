/**
 * Resource validation rules for CRUD endpoints.
 *
 * express-validator schemas for route params, query strings, and request bodies.
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
  query('q').optional().trim()
];

// ==========================================
// Shared field helpers
// ==========================================

/** Reject a body field when a file upload is expected instead. */
const blockedUploadField = (field, label) =>
  body(field).custom((val) => {
    if (val !== undefined && val !== null && val !== '') {
      throw new Error(`${label} must be uploaded as a file`);
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
  blockedUploadField('image', 'Image'),
  body('slug').optional({ values: 'falsy' }).trim().matches(/^[a-z0-9-_]+$/).withMessage('Invalid slug format'),
  optionalBooleanField('is_active'),
];

const categoryUpdateRules = [
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2 to 100 chars'),
  blockedUploadField('icon', 'Icon'),
  blockedUploadField('image', 'Image'),
  body('slug').optional({ values: 'falsy' }).trim().matches(/^[a-z0-9-_]+$/).withMessage('Invalid slug format'),
  optionalBooleanField('is_active'),
];

const subcategoryCreateRules = [
  body('name').trim().notEmpty().withMessage('Subcategory name is required').isLength({ min: 2, max: 100 }),
  blockedUploadField('icon', 'Icon'),
  blockedUploadField('image', 'Image'),
  body('slug').optional({ values: 'falsy' }).trim().matches(/^[a-z0-9-_]+$/).withMessage('Invalid slug format'),
  optionalBooleanField('is_active'),
];

const subcategoryUpdateRules = [
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  blockedUploadField('icon', 'Icon'),
  blockedUploadField('image', 'Image'),
  body('slug').optional({ values: 'falsy' }).trim().matches(/^[a-z0-9-_]+$/).withMessage('Invalid slug format'),
  optionalBooleanField('is_active'),
];

// ==========================================
// Banner validations
// ==========================================

const bannerCreateRules = [
  body('title').trim().notEmpty().withMessage('Banner title is required').isLength({ min: 2, max: 200 }).withMessage('Title must be 2 to 200 chars'),
  body('image').trim().notEmpty().withMessage('Banner image is required').isLength({ max: 500 }).withMessage('Image URL too long'),
  body('redirect_type').optional({ values: 'falsy' }).trim().isIn(['category', 'product', 'offer', 'brand', 'url']).withMessage('Invalid redirect type'),
  body('redirect_id').optional({ values: 'falsy' }).isInt().withMessage('Redirect ID must be an integer'),
  body('priority').optional().isInt().withMessage('Priority must be an integer')
];

const bannerUpdateRules = [
  body('title').optional().trim().isLength({ min: 2, max: 200 }).withMessage('Title must be 2 to 200 chars'),
  body('image').optional().trim().isLength({ max: 500 }).withMessage('Image URL too long'),
  body('redirect_type').optional({ values: 'falsy' }).trim().isIn(['category', 'product', 'offer', 'brand', 'url']).withMessage('Invalid redirect type'),
  body('redirect_id').optional({ values: 'falsy' }).isInt().withMessage('Redirect ID must be an integer'),
  body('priority').optional().isInt().withMessage('Priority must be an integer')
];

// ==========================================
// Brand validations
// ==========================================

const brandCreateRules = [
  body('name').trim().notEmpty().withMessage('Brand name is required').isLength({ min: 2, max: 100 }).withMessage('Name must be 2 to 100 chars'),
  body('logo').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Logo URL too long'),
  body('is_popular').optional().isBoolean().withMessage('is_popular must be a boolean')
];

const brandUpdateRules = [
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2 to 100 chars'),
  body('logo').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Logo URL too long'),
  body('is_popular').optional().isBoolean().withMessage('is_popular must be a boolean')
];

// ==========================================
// Supplier validations
// ==========================================

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
  body('thumbnail').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Thumbnail URL too long'),
  body('price').isFloat({ min: 0 }).withMessage('Price is required and must be a positive number'),
  body('currency').optional().trim().isLength({ max: 10 }).withMessage('Currency code too long'),
  body('moq').optional().isInt({ min: 1 }).withMessage('MOQ must be at least 1'),
  body('unit').optional().trim().isLength({ max: 50 }).withMessage('Unit string too long'),
  body('supplier_id').isInt().withMessage('Supplier ID is required and must be an integer'),
  body('subcategory_id').isInt({ min: 1 }).withMessage('Subcategory ID is required and must be an integer'),
  body('brand_id').optional({ values: 'falsy' }).isInt().withMessage('Brand ID must be an integer'),
  body('is_trending').optional().isBoolean().withMessage('is_trending must be a boolean'),
  body('is_recommended').optional().isBoolean().withMessage('is_recommended must be a boolean'),
  body('rating').optional().isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
  body('slug').optional({ values: 'falsy' }).trim().matches(/^[a-z0-9-_]+$/).withMessage('Invalid slug format')
];

const productUpdateRules = [
  body('name').optional().trim().isLength({ min: 2, max: 200 }).withMessage('Product name must be 2 to 200 chars'),
  body('thumbnail').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Thumbnail URL too long'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('currency').optional().trim().isLength({ max: 10 }).withMessage('Currency code too long'),
  body('moq').optional().isInt({ min: 1 }).withMessage('MOQ must be at least 1'),
  body('unit').optional().trim().isLength({ max: 50 }).withMessage('Unit string too long'),
  body('supplier_id').optional().isInt().withMessage('Supplier ID must be an integer'),
  body('subcategory_id').optional().isInt({ min: 1 }).withMessage('Subcategory ID must be an integer'),
  body('brand_id').optional({ values: 'falsy' }).isInt().withMessage('Brand ID must be an integer'),
  body('is_trending').optional().isBoolean().withMessage('is_trending must be a boolean'),
  body('is_recommended').optional().isBoolean().withMessage('is_recommended must be a boolean'),
  body('rating').optional().isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
  body('slug').optional({ values: 'falsy' }).trim().matches(/^[a-z0-9-_]+$/).withMessage('Invalid slug format')
];

const productListQuery = [
  query('category_id').optional().isInt({ min: 1 }).withMessage('Category ID must be an integer'),
  query('subcategory_id').optional().isInt({ min: 1 }).withMessage('Subcategory ID must be an integer'),
  query('brand_id').optional().isInt().withMessage('Brand ID must be an integer'),
  query('min_price').optional().isFloat({ min: 0 }).withMessage('Min price must be positive'),
  query('max_price').optional().isFloat({ min: 0 }).withMessage('Max price must be positive'),
  ...paginationQuery
];

// ==========================================
// Offer validations
// ==========================================

const offerCreateRules = [
  body('title').trim().notEmpty().withMessage('Offer title is required').isLength({ min: 2, max: 200 }).withMessage('Title must be 2 to 200 chars'),
  body('banner').trim().notEmpty().withMessage('Offer banner is required').isLength({ max: 500 }).withMessage('Banner URL too long'),
  body('discount').trim().notEmpty().withMessage('Offer discount details are required').isLength({ max: 100 }).withMessage('Discount detail too long'),
  body('expiry_date').isISO8601().withMessage('Expiry date must be a valid ISO8601 timestamp')
];

const offerUpdateRules = [
  body('title').optional().trim().isLength({ min: 2, max: 200 }).withMessage('Title must be 2 to 200 chars'),
  body('banner').optional().trim().isLength({ max: 500 }).withMessage('Banner URL too long'),
  body('discount').optional().trim().isLength({ max: 100 }).withMessage('Discount detail too long'),
  body('expiry_date').optional().isISO8601().withMessage('Expiry date must be a valid ISO8601 timestamp')
];

// ==========================================
// RFQ validations
// ==========================================

const rfqCreateRules = [
  body('title').trim().notEmpty().withMessage('RFQ title is required').isLength({ min: 2, max: 200 }).withMessage('Title must be 2 to 200 chars'),
  body('category_id').isInt().withMessage('Category ID is required and must be an integer'),
  body('city_id').isInt().withMessage('City ID is required and must be an integer'),
  body('description').optional({ values: 'falsy' }).trim(),
  body('quantity').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('budget').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Budget must be positive')
];

const rfqUpdateRules = [
  body('title').optional().trim().isLength({ min: 2, max: 200 }).withMessage('Title must be 2 to 200 chars'),
  body('category_id').optional().isInt().withMessage('Category ID must be an integer'),
  body('city_id').optional().isInt().withMessage('City ID must be an integer'),
  body('description').optional({ values: 'falsy' }).trim(),
  body('quantity').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('budget').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Budget must be positive')
];

const rfqListQuery = [
  query('category_id').optional().isInt().withMessage('Category ID must be an integer'),
  query('city_id').optional().isInt().withMessage('City ID must be an integer'),
  ...paginationQuery
];

// ==========================================
// Service validations
// ==========================================

const serviceCreateRules = [
  body('name').trim().notEmpty().withMessage('Service name is required').isLength({ min: 2, max: 100 }).withMessage('Name must be 2 to 100 chars'),
  body('icon').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Icon URL too long'),
  body('description').optional({ values: 'falsy' }).trim()
];

const serviceUpdateRules = [
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2 to 100 chars'),
  body('icon').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Icon URL too long'),
  body('description').optional({ values: 'falsy' }).trim()
];

// ==========================================
// News validations
// ==========================================

const newsCreateRules = [
  body('title').trim().notEmpty().withMessage('News title is required').isLength({ min: 2, max: 200 }).withMessage('Title must be 2 to 200 chars'),
  body('thumbnail').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Thumbnail URL too long'),
  body('content').trim().notEmpty().withMessage('News content is required'),
  body('published_at').optional({ values: 'falsy' }).isISO8601().withMessage('Published date must be a valid ISO8601 timestamp')
];

const newsUpdateRules = [
  body('title').optional().trim().isLength({ min: 2, max: 200 }).withMessage('Title must be 2 to 200 chars'),
  body('thumbnail').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Thumbnail URL too long'),
  body('content').optional().trim(),
  body('published_at').optional({ values: 'falsy' }).isISO8601().withMessage('Published date must be a valid ISO8601 timestamp')
];

// ==========================================
// Business type validations
// ==========================================

const businessTypeListQuery = [
  query('role_id').isInt({ min: 1 }).withMessage('role_id is required'),
  query('is_active').optional().isBoolean().withMessage('is_active must be a boolean'),
];

const businessTypeCreateRules = [
  body('name').trim().notEmpty().isLength({ min: 2, max: 100 }).withMessage('Name is required'),
  body('code').optional({ values: 'falsy' }).trim().isLength({ max: 50 }),
  body('role_id').isInt({ min: 1 }).withMessage('role_id is required'),
  body('is_active').optional().isBoolean(),
];

const businessTypeUpdateRules = [
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  body('code').optional({ values: 'falsy' }).trim().isLength({ max: 50 }),
  body('role_id').optional().isInt({ min: 1 }),
  body('is_active').optional().isBoolean(),
];

module.exports = {
  idParam,
  categoryIdParam,
  paginationQuery,
  categoryCreateRules,
  categoryUpdateRules,
  subcategoryCreateRules,
  subcategoryUpdateRules,
  bannerCreateRules,
  bannerUpdateRules,
  brandCreateRules,
  brandUpdateRules,
  supplierNearbyRules,
  productCreateRules,
  productUpdateRules,
  productListQuery,
  offerCreateRules,
  offerUpdateRules,
  rfqCreateRules,
  rfqUpdateRules,
  rfqListQuery,
  serviceCreateRules,
  serviceUpdateRules,
  newsCreateRules,
  newsUpdateRules,
  businessTypeListQuery,
  businessTypeCreateRules,
  businessTypeUpdateRules,
};
