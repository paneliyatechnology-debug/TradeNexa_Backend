/**
 * Product business logic — create/update with multipart thumbnail and gallery uploads.
 *
 * Media files are never read from req.body; stripFields removes upload keys
 * before persisting text fields.
 */
const productModel = require('../models/productModel');
const { uploadPaths } = require('../constants/uploadPaths');
const { processUploadedFiles, processMultipleUploadedFiles } = require('../services/uploadService');
const { stripFields } = require('../utils/formBody');

const THUMBNAIL_FIELD = 'thumbnail';
const IMAGE_FIELD = 'image';
const VIDEO_FIELD = 'video';
const PRODUCT_UPLOAD_KEYS = [THUMBNAIL_FIELD, IMAGE_FIELD, VIDEO_FIELD];

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

/** Store specifications as a JSON string for MySQL JSON columns (knex/mysql2). */
const parseSpecificationsForStorage = (value) => {
  if (value === undefined || value === null || value === '') return undefined;

  let parsed = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('specifications must be valid JSON');
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('specifications must be a JSON object or array');
  }

  return JSON.stringify(parsed);
};

/** Store search tags as JSON string in DB. */
const parseSearchTagsForStorage = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('[')) return trimmed;
    return JSON.stringify(
      trimmed
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    );
  }
  return undefined;
};

/** Normalize product body from multipart form-data. */
const parseProductBody = (body = {}) => {
  const clean = stripFields(body, PRODUCT_UPLOAD_KEYS);
  return {
    ...clean,
    price: parseNumber(clean.price, parseFloat),
    moq: parseNumber(clean.moq, (v) => parseInt(v, 10)),
    rating: parseNumber(clean.rating, parseFloat),
    seller_id: parseNumber(clean.seller_id, (v) => parseInt(v, 10)),
    category_id: parseNumber(clean.category_id, (v) => parseInt(v, 10)),
    subcategory_id: parseNumber(clean.subcategory_id, (v) => parseInt(v, 10)),
    brand_id: parseNumber(clean.brand_id, (v) => parseInt(v, 10)),
    stock_quantity: parseNumber(clean.stock_quantity, (v) => parseInt(v, 10)),
    gst_percentage: parseNumber(clean.gst_percentage, parseFloat),
    is_trending: parseBoolean(clean.is_trending),
    is_active: parseBoolean(clean.is_active),
    show_price: parseBoolean(clean.show_price),
    accept_inquiry: parseBoolean(clean.accept_inquiry),
    search_tags: parseSearchTagsForStorage(clean.search_tags),
    specifications: parseSpecificationsForStorage(clean.specifications),
  };
};

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
 * New products start as `in_review` and are not buyer-visible until approved.
 * Writes the first `submitted` review-history row via productReviewService.
 *
 * @param {Object} data - Multipart / JSON body
 * @param {Object} [files] - Multer files
 * @param {number|null} [userId] - Acting user (seller)
 * @param {string} [actorRole='seller']
 * @returns {Promise<Object>}
 */
const createProduct = async (data, files = {}, userId = null, actorRole = 'seller') => {
  if (!userId) {
    const { AppError } = require('../utils/response');
    const { HTTP_STATUS } = require('../constants');
    throw new AppError('Authenticated seller is required', HTTP_STATUS.UNAUTHORIZED);
  }

  const payload = parseProductBody(data);
  delete payload.approval_status;
  // Ownership always from JWT — ignore body.seller_id
  payload.seller_id = userId;

  const product = await productModel.createProduct(payload, userId);
  await applyCreateThumbnail(product.id, files);
  await applyImageUploads(product.id, files, 'inbox');
  await applyVideoUploads(product.id, files, 'inbox');

  const productReviewService = require('./productReviewService');
  await productReviewService.recordInitialSubmission(product, userId, actorRole);
  return productModel.findProductById(product.id);
};

/**
 * Update a product. Text fields and media uploads are all optional.
 * - Rejected products cannot be updated.
 * - revision_required → successful update auto-resubmits to in_review (replaces POST /submit).
 * - Material edits (or media changes) on approved products auto-send back to in_review.
 *
 * @param {number} id
 * @param {Object} data
 * @param {Object} [files]
 * @param {number|null} [userId]
 * @param {string} [actorRole='seller']
 * @returns {Promise<Object>}
 */
const updateProduct = async (id, data, files = {}, userId = null, actorRole = 'seller') => {
  const productReviewService = require('./productReviewService');
  const payload = parseProductBody(data);
  delete payload.approval_status;
  // seller_id is not updatable via body — ownership stays with original seller
  delete payload.seller_id;

  const existing = await productModel.findProductById(id, { raw: true });
  if (!existing) {
    const { AppError } = require('../utils/response');
    const { HTTP_STATUS } = require('../constants');
    throw new AppError('Product not found', HTTP_STATUS.NOT_FOUND);
  }

  if (existing.approval_status === 'rejected') {
    const { AppError } = require('../utils/response');
    const { HTTP_STATUS } = require('../constants');
    throw new AppError('Rejected products cannot be updated', HTTP_STATUS.CONFLICT);
  }

  const thumbnailUpdates = await applyUpdateThumbnail(id, files, existing || {});
  const hasThumb = Object.keys(thumbnailUpdates || {}).length > 0;
  const merged = { ...payload, ...thumbnailUpdates };
  await productModel.updateProduct(id, merged, userId);
  const images = await applyImageUploads(id, files, 'direct');
  const videos = await applyVideoUploads(id, files, 'direct');

  if (hasThumb || images.length || videos.length) {
    merged.__has_media_change = true;
  }

  await productReviewService.handleSellerUpdateApproval(existing, merged, userId, actorRole);
  return productModel.findProductById(id);
};

/**
 * Delete gallery images and/or videos from a product (DB + S3/local storage).
 */
const deleteProductMedia = async (productId, { imageIds = [], videoIds = [] } = {}) => {
  const deletedImages = [];
  const deletedVideos = [];
  const notFoundImageIds = [];
  const notFoundVideoIds = [];

  for (const imageId of imageIds) {
    const deleted = await productModel.deleteProductImage(productId, imageId);
    if (deleted) deletedImages.push(imageId);
    else notFoundImageIds.push(imageId);
  }

  for (const videoId of videoIds) {
    const deleted = await productModel.deleteProductVideo(productId, videoId);
    if (deleted) deletedVideos.push(videoId);
    else notFoundVideoIds.push(videoId);
  }

  if (!deletedImages.length && !deletedVideos.length) {
    return null;
  }

  return {
    deleted_image_ids: deletedImages,
    deleted_video_ids: deletedVideos,
    not_found_image_ids: notFoundImageIds,
    not_found_video_ids: notFoundVideoIds,
    product: await productModel.findProductDetailById(productId),
  };
};

module.exports = {
  createProduct,
  updateProduct,
  deleteProductMedia,
};
