/**
 * Banner business logic — create/update with multipart image upload.
 *
 * Image files are never read from req.body; stripFields removes upload keys
 * before persisting text fields.
 */
const bannerModel = require('../models/bannerModel');
const { uploadPaths } = require('../constants/uploadPaths');
const { BANNER_UPLOAD_FIELDS } = require('../constants/uploadFields');
const { processUploadedFiles } = require('../services/uploadService');
const { AppError } = require('../utils/response');
const { stripFields } = require('../utils/formBody');

const BANNER_IMAGE_FIELDS = BANNER_UPLOAD_FIELDS.map((field) => field.name);
const BANNER_UPLOAD_KEYS = BANNER_IMAGE_FIELDS;

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

/** Normalize banner body from multipart form-data. */
const parseBannerBody = (body = {}) => {
  const clean = stripFields(body, BANNER_UPLOAD_KEYS);
  return {
    ...clean,
    redirect_id: parseNumber(clean.redirect_id, (v) => parseInt(v, 10)),
    priority: parseNumber(clean.priority, (v) => parseInt(v, 10)),
    is_active: parseBoolean(clean.is_active),
  };
};

/** Format a DB row for API response (resolves image URL). */
const formatBanner = (row) => bannerModel.formatRow(row);

// ==========================================
// Image upload helpers
// ==========================================

/**
 * Finalize inbox uploads after create (moves files to banners/{id}/).
 * @returns {Object|null} Updated row or null when no files were uploaded
 */
const applyCreateImage = async (bannerId, files = {}) => {
  const updates = await processUploadedFiles({
    files,
    fields: BANNER_IMAGE_FIELDS,
    pathSegments: uploadPaths.banner(bannerId),
    mode: 'inbox',
  });

  if (!Object.keys(updates).length) return null;
  return bannerModel.applyBannerMediaUpdates(bannerId, updates, null);
};

/** Process direct uploads on update (files saved to banners/{id}/). */
const applyUpdateImage = async (bannerId, files = {}, existing = {}) =>
  processUploadedFiles({
    files,
    fields: BANNER_IMAGE_FIELDS,
    pathSegments: uploadPaths.banner(bannerId),
    existing,
    mode: 'direct',
  });

// ==========================================
// Banner operations
// ==========================================

/**
 * Create a banner. Image file is required (validated in middleware + here).
 */
const createBanner = async (data, files = {}, userId = null) => {
  const payload = parseBannerBody(data);
  const banner = await bannerModel.createBanner(payload, userId);
  const withImage = await applyCreateImage(banner.id, files);

  if (!withImage?.image) {
    throw new AppError('Banner image is required', 400);
  }

  return formatBanner(withImage);
};

/**
 * Update a banner. Text fields and image upload are optional unless explicitly sent empty.
 */
const updateBanner = async (id, data, files = {}, userId = null) => {
  const payload = parseBannerBody(data);
  const existing = await bannerModel.findBannerById(id, { raw: true });
  const imageUpdates = await applyUpdateImage(id, files, existing || {});
  const row = await bannerModel.updateBanner(id, { ...payload, ...imageUpdates }, userId);
  return formatBanner(row);
};

module.exports = {
  createBanner,
  updateBanner,
};
