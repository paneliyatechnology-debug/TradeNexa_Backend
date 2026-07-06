/**
 * Service (marketplace service listing) business logic — create/update with multipart icon upload.
 *
 * Icon files are never read from req.body; stripFields removes upload keys
 * before persisting text fields.
 */
const serviceModel = require('../models/serviceModel');
const { uploadPaths } = require('../constants/uploadPaths');
const { SERVICE_UPLOAD_FIELDS } = require('../constants/uploadFields');
const { processUploadedFiles } = require('../services/uploadService');
const { stripFields } = require('../utils/formBody');

const SERVICE_FILE_FIELDS = SERVICE_UPLOAD_FIELDS.map((field) => field.name);

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

/** Normalize service body from multipart form-data. */
const parseServiceBody = (body = {}) => {
  const clean = stripFields(body, SERVICE_FILE_FIELDS);
  return {
    ...clean,
    is_active: parseBoolean(clean.is_active),
  };
};

/** Format a DB row for API response (resolves icon URL). */
const formatService = (row) => serviceModel.formatRow(row);

// ==========================================
// Icon upload helpers
// ==========================================

/**
 * Finalize inbox uploads after create (moves files to services/{id}/).
 * @returns {Object|null} Updated row or null when no files were uploaded
 */
const applyCreateIcon = async (serviceId, files = {}) => {
  const updates = await processUploadedFiles({
    files,
    fields: SERVICE_FILE_FIELDS,
    pathSegments: uploadPaths.service(serviceId),
    mode: 'inbox',
  });
  if (!Object.keys(updates).length) return null;
  return serviceModel.applyServiceMediaUpdates(serviceId, updates, null);
};

/** Process direct uploads on update (files saved to services/{id}/). */
const applyUpdateIcon = async (serviceId, files = {}, existing = {}) =>
  processUploadedFiles({
    files,
    fields: SERVICE_FILE_FIELDS,
    pathSegments: uploadPaths.service(serviceId),
    existing,
    mode: 'direct',
  });

// ==========================================
// Service operations
// ==========================================

/**
 * Create a service listing with optional icon upload.
 */
const createService = async (data, files = {}, userId = null) => {
  const payload = parseServiceBody(data);
  const service = await serviceModel.createService(payload, userId);
  const withIcon = await applyCreateIcon(service.id, files);
  const row = withIcon || (await serviceModel.findServiceById(service.id));
  return formatService(row);
};

/**
 * Update a service listing. Text fields and icon upload are optional.
 */
const updateService = async (id, data, files = {}, userId = null) => {
  const payload = parseServiceBody(data);
  const existing = await serviceModel.findServiceById(id, { raw: true });
  const iconUpdates = await applyUpdateIcon(id, files, existing || {});
  const row = await serviceModel.updateService(id, { ...payload, ...iconUpdates }, userId);
  return formatService(row);
};

module.exports = {
  createService,
  updateService,
};
