/**
 * Brand business logic — create/update with multipart logo upload.
 *
 * Logo files are never read from req.body; stripFields removes upload keys
 * before persisting text fields.
 */
const brandModel = require('../models/brandModel');
const { uploadPaths } = require('../constants/uploadPaths');
const { BRAND_UPLOAD_FIELDS } = require('../constants/uploadFields');
const { processUploadedFiles } = require('../services/uploadService');
const { AppError } = require('../utils/response');
const { stripFields } = require('../utils/formBody');

const BRAND_IMAGE_FIELDS = BRAND_UPLOAD_FIELDS.map((field) => field.name);
const BRAND_UPLOAD_KEYS = BRAND_IMAGE_FIELDS;

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

/** Normalize brand body from multipart form-data. */
const parseBrandBody = (body = {}) => {
  const clean = stripFields(body, BRAND_UPLOAD_KEYS);
  return {
    ...clean,
    is_popular: parseBoolean(clean.is_popular),
    is_featured: parseBoolean(clean.is_featured),
    is_active: parseBoolean(clean.is_active),
  };
};

/** Format a DB row for API response (resolves logo URL). */
const formatBrand = (row) => brandModel.formatRow(row);

// ==========================================
// Logo upload helpers
// ==========================================

/**
 * Finalize inbox uploads after create (moves files to brands/{id}/).
 * @returns {Object|null} Updated row or null when no files were uploaded
 */
const applyCreateLogo = async (brandId, files = {}) => {
  const updates = await processUploadedFiles({
    files,
    fields: BRAND_IMAGE_FIELDS,
    pathSegments: uploadPaths.brand(brandId),
    mode: 'inbox',
  });

  if (!Object.keys(updates).length) return null;
  return brandModel.applyBrandMediaUpdates(brandId, updates, null);
};

/** Process direct uploads on update (files saved to brands/{id}/). */
const applyUpdateLogo = async (brandId, files = {}, existing = {}) =>
  processUploadedFiles({
    files,
    fields: BRAND_IMAGE_FIELDS,
    pathSegments: uploadPaths.brand(brandId),
    existing,
    mode: 'direct',
  });

// ==========================================
// Brand operations
// ==========================================

/**
 * Create a brand. Logo file is required (validated in middleware + here).
 */
const createBrand = async (data, files = {}, userId = null) => {
  const payload = parseBrandBody(data);
  const brand = await brandModel.createBrand(payload, userId);
  const withLogo = await applyCreateLogo(brand.id, files);

  if (!withLogo?.logo) {
    throw new AppError('Logo is required.', 400);
  }

  return formatBrand(withLogo);
};

/**
 * Update a brand. Text fields and logo upload are optional unless explicitly sent empty.
 */
const updateBrand = async (id, data, files = {}, userId = null) => {
  const payload = parseBrandBody(data);
  const existing = await brandModel.findBrandById(id, { raw: true });
  const logoUpdates = await applyUpdateLogo(id, files, existing || {});
  const row = await brandModel.updateBrand(id, { ...payload, ...logoUpdates }, userId);
  return formatBrand(row);
};

module.exports = {
  createBrand,
  updateBrand,
};
