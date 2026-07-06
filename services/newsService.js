/**
 * News business logic — create/update with multipart thumbnail upload.
 *
 * Thumbnail files are never read from req.body; stripFields removes upload keys
 * before persisting text fields.
 */
const newsModel = require('../models/newsModel');
const { uploadPaths } = require('../constants/uploadPaths');
const { NEWS_UPLOAD_FIELDS } = require('../constants/uploadFields');
const { processUploadedFiles } = require('../services/uploadService');
const { stripFields } = require('../utils/formBody');

const NEWS_FILE_FIELDS = NEWS_UPLOAD_FIELDS.map((field) => field.name);

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

/** Normalize news body from multipart form-data. */
const parseNewsBody = (body = {}) => {
  const clean = stripFields(body, NEWS_FILE_FIELDS);
  return {
    ...clean,
    is_active: parseBoolean(clean.is_active),
  };
};

/** Format a DB row for API response (resolves thumbnail URL). */
const formatNews = (row) => newsModel.formatRow(row);

// ==========================================
// Thumbnail upload helpers
// ==========================================

/**
 * Finalize inbox uploads after create (moves files to news/{id}/).
 * @returns {Object|null} Updated row or null when no files were uploaded
 */
const applyCreateThumbnail = async (newsId, files = {}) => {
  const updates = await processUploadedFiles({
    files,
    fields: NEWS_FILE_FIELDS,
    pathSegments: uploadPaths.news(newsId),
    mode: 'inbox',
  });
  if (!Object.keys(updates).length) return null;
  return newsModel.applyNewsMediaUpdates(newsId, updates, null);
};

/** Process direct uploads on update (files saved to news/{id}/). */
const applyUpdateThumbnail = async (newsId, files = {}, existing = {}) =>
  processUploadedFiles({
    files,
    fields: NEWS_FILE_FIELDS,
    pathSegments: uploadPaths.news(newsId),
    existing,
    mode: 'direct',
  });

// ==========================================
// News operations
// ==========================================

/**
 * Create a news article with optional thumbnail upload.
 */
const createNews = async (data, files = {}, userId = null) => {
  const payload = parseNewsBody(data);
  const article = await newsModel.createNews(payload, userId);
  const withThumbnail = await applyCreateThumbnail(article.id, files);
  const row = withThumbnail || (await newsModel.findNewsById(article.id));
  return formatNews(row);
};

/**
 * Update a news article. Text fields and thumbnail upload are optional.
 */
const updateNews = async (id, data, files = {}, userId = null) => {
  const payload = parseNewsBody(data);
  const existing = await newsModel.findNewsById(id, { raw: true });
  const thumbnailUpdates = await applyUpdateThumbnail(id, files, existing || {});
  const row = await newsModel.updateNews(id, { ...payload, ...thumbnailUpdates }, userId);
  return formatNews(row);
};

module.exports = {
  createNews,
  updateNews,
};
