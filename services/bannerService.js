const bannerModel = require('../models/bannerModel');
const { uploadPaths } = require('../constants/uploadPaths');
const { BANNER_UPLOAD_FIELDS } = require('../constants/uploadFields');
const { processUploadedFiles } = require('../services/uploadService');
const { AppError } = require('../utils/response');

const BANNER_IMAGE_FIELDS = BANNER_UPLOAD_FIELDS.map((field) => field.name);

const parseBoolean = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
};

const parseNumber = (value, parser = Number) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = parser(value);
  return Number.isNaN(parsed) ? value : parsed;
};

/** Normalize banner body from multipart form-data. */
const parseBannerBody = (body = {}) => ({
  ...body,
  redirect_id: parseNumber(body.redirect_id, (v) => parseInt(v, 10)),
  priority: parseNumber(body.priority, (v) => parseInt(v, 10)),
  is_active: parseBoolean(body.is_active),
});

const formatBanner = (row) => bannerModel.formatRow(row);

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

const applyUpdateImage = async (bannerId, files = {}, existing = {}) =>
  processUploadedFiles({
    files,
    fields: BANNER_IMAGE_FIELDS,
    pathSegments: uploadPaths.banner(bannerId),
    existing,
    mode: 'direct',
  });

/** Create a banner with required image upload. */
const createBanner = async (data, files = {}, userId = null) => {
  const payload = parseBannerBody(data);
  const banner = await bannerModel.createBanner(payload, userId);
  const withImage = await applyCreateImage(banner.id, files);

  if (!withImage?.image) {
    throw new AppError('Banner image is required', 400);
  }

  return formatBanner(withImage);
};

/** Update a banner. Text fields and image upload are optional. */
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
