const productModel = require('../models/productModel');
const { uploadPaths } = require('../constants/uploadPaths');
const { processUploadedFiles, processMultipleUploadedFiles } = require('../services/uploadService');

const THUMBNAIL_FIELD = 'thumbnail';
const IMAGE_FIELD = 'image';
const VIDEO_FIELD = 'video';

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
// Upload helpers
// ==========================================

/**
 * Finalize inbox uploads after create (moves files to products/{id}/).
 * @returns {Object|null} Updated row or null when no files were uploaded
 */
const applyCreateThumbnail = async (productId, files = {}) => {
  const updates = await processUploadedFiles({
    files,
    fields: [THUMBNAIL_FIELD],
    pathSegments: uploadPaths.product(productId),
    mode: 'inbox',
  });

  if (!Object.keys(updates).length) return null;
  return productModel.applyProductMediaUpdates(productId, updates, null);
};

/** Process direct thumbnail upload on update. */
const applyUpdateThumbnail = async (productId, files = {}, existing = {}) =>
  processUploadedFiles({
    files,
    fields: [THUMBNAIL_FIELD],
    pathSegments: uploadPaths.product(productId),
    existing,
    mode: 'direct',
  });

/** Save optional gallery images for a product (create or update). */
const applyImageUploads = async (productId, files = {}, mode = 'direct') => {
  const paths = await processMultipleUploadedFiles({
    files,
    field: IMAGE_FIELD,
    pathSegments: uploadPaths.product(productId),
    mode,
  });

  if (!paths.length) return [];
  return productModel.insertProductImages(productId, paths);
};

/** Save optional videos for a product (create or update). */
const applyVideoUploads = async (productId, files = {}, mode = 'direct') => {
  const paths = await processMultipleUploadedFiles({
    files,
    field: VIDEO_FIELD,
    pathSegments: uploadPaths.product(productId),
    mode,
  });

  if (!paths.length) return [];
  return productModel.insertProductVideos(productId, paths);
};

// ==========================================
// Product operations
// ==========================================

/**
 * Create a product with optional thumbnail, gallery images, and videos.
 */
const createProduct = async (data, files = {}, userId = null) => {
  const payload = parseProductBody(data);
  const product = await productModel.createProduct(payload, userId);
  await applyCreateThumbnail(product.id, files);
  await applyImageUploads(product.id, files, 'inbox');
  await applyVideoUploads(product.id, files, 'inbox');
  return productModel.findProductById(product.id);
};

/**
 * Update a product. Text fields and media uploads are all optional.
 */
const updateProduct = async (id, data, files = {}, userId = null) => {
  const payload = parseProductBody(data);
  const existing = await productModel.findProductById(id, { raw: true });
  const thumbnailUpdates = await applyUpdateThumbnail(id, files, existing || {});
  await productModel.updateProduct(id, { ...payload, ...thumbnailUpdates }, userId);
  await applyImageUploads(id, files, 'direct');
  await applyVideoUploads(id, files, 'direct');
  return productModel.findProductById(id);
};

module.exports = {
  createProduct,
  updateProduct,
};
