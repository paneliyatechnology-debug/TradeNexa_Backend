/**
 * Offer business logic — create/update with multipart banner upload.
 *
 * Banner files are never read from req.body; stripFields removes upload keys
 * before persisting text fields.
 */
const offerModel = require('../models/offerModel');
const { uploadPaths } = require('../constants/uploadPaths');
const { OFFER_UPLOAD_FIELDS } = require('../constants/uploadFields');
const { processUploadedFiles } = require('../services/uploadService');
const { AppError } = require('../utils/response');
const { stripFields } = require('../utils/formBody');

const OFFER_FILE_FIELDS = OFFER_UPLOAD_FIELDS.map((field) => field.name);

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

/** Normalize offer body from multipart form-data. */
const parseOfferBody = (body = {}) => {
  const clean = stripFields(body, OFFER_FILE_FIELDS);
  return {
    ...clean,
    is_active: parseBoolean(clean.is_active),
  };
};

/** Format a DB row for API response (resolves banner URL). */
const formatOffer = (row) => offerModel.formatRow(row);

// ==========================================
// Banner upload helpers
// ==========================================

/**
 * Finalize inbox uploads after create (moves files to offers/{id}/).
 * @returns {Object|null} Updated row or null when no files were uploaded
 */
const applyCreateBanner = async (offerId, files = {}) => {
  const updates = await processUploadedFiles({
    files,
    fields: OFFER_FILE_FIELDS,
    pathSegments: uploadPaths.offer(offerId),
    mode: 'inbox',
  });
  if (!Object.keys(updates).length) return null;
  return offerModel.applyOfferMediaUpdates(offerId, updates, null);
};

/** Process direct uploads on update (files saved to offers/{id}/). */
const applyUpdateBanner = async (offerId, files = {}, existing = {}) =>
  processUploadedFiles({
    files,
    fields: OFFER_FILE_FIELDS,
    pathSegments: uploadPaths.offer(offerId),
    existing,
    mode: 'direct',
  });

// ==========================================
// Offer operations
// ==========================================

/**
 * Create an offer. Banner file is required (validated in middleware + here).
 */
const createOffer = async (data, files = {}, userId = null) => {
  const payload = parseOfferBody(data);
  const offer = await offerModel.createOffer(payload, userId);
  const withBanner = await applyCreateBanner(offer.id, files);
  if (!withBanner?.banner) {
    throw new AppError('Banner is required.', 400);
  }
  return formatOffer(withBanner);
};

/**
 * Update an offer. Text fields and banner upload are optional unless explicitly sent empty.
 */
const updateOffer = async (id, data, files = {}, userId = null) => {
  const payload = parseOfferBody(data);
  const existing = await offerModel.findOfferById(id, { raw: true });
  const bannerUpdates = await applyUpdateBanner(id, files, existing || {});
  const row = await offerModel.updateOffer(id, { ...payload, ...bannerUpdates }, userId);
  return formatOffer(row);
};

module.exports = {
  createOffer,
  updateOffer,
};
