const categoryModel = require('../models/categoryModel');
const { uploadPaths } = require('../constants/uploadPaths');
const { CATEGORY_UPLOAD_FIELDS } = require('../constants/uploadFields');
const { processUploadedFiles } = require('../services/uploadService');

const CATEGORY_IMAGE_FIELDS = CATEGORY_UPLOAD_FIELDS.map((field) => field.name);

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

/** Normalize category/subcategory body from multipart form-data. */
const parseCategoryBody = (body = {}) => ({
  ...body,
  is_active: parseBoolean(body.is_active),
});

/** Format a main category DB row for API response (resolves icon/image URLs). */
const formatCategory = (row) => categoryModel.formatRow(row);

/** Format a subcategory DB row for API response (category_id instead of parent_id). */
const formatSubcategory = (row) => categoryModel.formatSubcategoryRow(row);

// ==========================================
// Image upload helpers
// ==========================================

/**
 * Finalize inbox uploads after create (moves files to categories/{id}/).
 * @returns {Object|null} Updated row or null when no files were uploaded
 */
const applyCreateImages = async (categoryId, files = {}) => {
  const updates = await processUploadedFiles({
    files,
    fields: CATEGORY_IMAGE_FIELDS,
    pathSegments: uploadPaths.category(categoryId),
    mode: 'inbox',
  });

  if (!Object.keys(updates).length) return null;
  return categoryModel.applyCategoryMediaUpdates(categoryId, updates, null);
};

/** Process direct uploads on update (files saved to categories/{id}/). */
const applyUpdateImages = async (categoryId, files = {}, existing = {}) =>
  processUploadedFiles({
    files,
    fields: CATEGORY_IMAGE_FIELDS,
    pathSegments: uploadPaths.category(categoryId),
    existing,
  });

// ==========================================
// Main category operations
// ==========================================

/**
 * Create a main category (parent_id = null) with optional icon/image uploads.
 */
const createCategory = async (data, files = {}, userId = null) => {
  const payload = parseCategoryBody(data);
  const category = await categoryModel.createCategory(payload, userId);
  const withImages = await applyCreateImages(category.id, files);
  const row = withImages || (await categoryModel.findCategoryById(category.id));
  return formatCategory(row);
};

/**
 * Update a main category. Text fields and image uploads are all optional.
 */
const updateCategory = async (id, data, files = {}, userId = null) => {
  const payload = parseCategoryBody(data);
  const existing = await categoryModel.findCategoryById(id);
  const imageUpdates = await applyUpdateImages(id, files, existing || {});
  const row = await categoryModel.updateCategory(id, { ...payload, ...imageUpdates }, userId);
  return formatCategory(row);
};

// ==========================================
// Subcategory operations
// ==========================================

/**
 * Create a subcategory under a main category with optional icon/image uploads.
 */
const createSubcategory = async (parentId, data, files = {}, userId = null) => {
  const payload = parseCategoryBody(data);
  const subcategory = await categoryModel.createSubcategory(parentId, payload, userId);
  const withImages = await applyCreateImages(subcategory.id, files);
  const row = withImages || (await categoryModel.findSubcategoryById(subcategory.id, parentId));
  return formatSubcategory(row);
};

/**
 * Update a subcategory. Same upload behaviour as main category update.
 */
const updateSubcategory = async (parentId, id, data, files = {}, userId = null) => {
  const payload = parseCategoryBody(data);
  const existing = await categoryModel.findSubcategoryById(id, parentId);
  const imageUpdates = await applyUpdateImages(id, files, existing || {});
  const row = await categoryModel.updateSubcategory(
    parentId,
    id,
    { ...payload, ...imageUpdates },
    userId,
  );
  return formatSubcategory(row);
};

module.exports = {
  createCategory,
  updateCategory,
  createSubcategory,
  updateSubcategory,
};
