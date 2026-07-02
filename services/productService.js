const productModel = require('../models/productModel');
const { uploadPaths } = require('../constants/uploadPaths');
const { PRODUCT_UPLOAD_FIELDS } = require('../constants/uploadFields');
const { processUploadedFiles } = require('../services/uploadService');

const PRODUCT_IMAGE_FIELDS = PRODUCT_UPLOAD_FIELDS.map((field) => field.name);

// ==========================================
// Request parsing helpers
// ==========================================

/**
 * Parse multipart boolean fields (sent as string "true"/"false").
 * @param {*} value
 * @returns {boolean|undefined}
 */
const parseBoolean = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
};

/** Parse numeric multipart fields sent as strings. */
const parseNumber = (value, parser = Number) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = parser(value);
  return Number.isNaN(parsed) ? value : parsed;
};

/** Normalize product body from multipart form-data. */
const parseProductBody = (body = {}) => ({
  ...body,
  price: parseNumber(body.price, parseFloat),
  moq: parseNumber(body.moq, (v) => parseInt(v, 10)),
  rating: parseNumber(body.rating, parseFloat),
  supplier_id: parseNumber(body.supplier_id, (v) => parseInt(v, 10)),
  subcategory_id: parseNumber(body.subcategory_id, (v) => parseInt(v, 10)),
  brand_id:
    body.brand_id === '' || body.brand_id === null
      ? null
      : parseNumber(body.brand_id, (v) => parseInt(v, 10)),
  is_trending: parseBoolean(body.is_trending),
  is_active: parseBoolean(body.is_active),
});

// ==========================================
// Thumbnail upload helpers
// ==========================================

/**
 * Finalize inbox uploads after create (moves files to products/{id}/).
 * @returns {Object|null} Updated row or null when no files were uploaded
 */
const applyCreateThumbnail = async (productId, files = {}) => {
  const updates = await processUploadedFiles({
    files,
    fields: PRODUCT_IMAGE_FIELDS,
    pathSegments: uploadPaths.product(productId),
    mode: 'inbox',
  });

  if (!Object.keys(updates).length) return null;
  return productModel.applyProductMediaUpdates(productId, updates, null);
};

/** Process direct uploads on update (files saved to products/{id}/). */
const applyUpdateThumbnail = async (productId, files = {}, existing = {}) =>
  processUploadedFiles({
    files,
    fields: PRODUCT_IMAGE_FIELDS,
    pathSegments: uploadPaths.product(productId),
    existing,
    mode: 'direct',
  });

// ==========================================
// Product operations
// ==========================================

/**
 * Create a product with optional thumbnail upload.
 */
const createProduct = async (data, files = {}, userId = null) => {
  const payload = parseProductBody(data);
  const product = await productModel.createProduct(payload, userId);
  await applyCreateThumbnail(product.id, files);
  return productModel.findProductById(product.id);
};

/**
 * Update a product. Text fields and thumbnail upload are all optional.
 */
const updateProduct = async (id, data, files = {}, userId = null) => {
  const payload = parseProductBody(data);
  const existing = await productModel.findProductById(id, { raw: true });
  const thumbnailUpdates = await applyUpdateThumbnail(id, files, existing || {});
  await productModel.updateProduct(id, { ...payload, ...thumbnailUpdates }, userId);
  return productModel.findProductById(id);
};

module.exports = {
  createProduct,
  updateProduct,
};
