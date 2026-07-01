const fs = require('fs');
const path = require('path');
const config = require('../config');
const uploadConfig = require('../config/upload');

const IMAGE_FIELD_LABELS = {
  profile_image: 'Profile image',
  company_logo: 'Company logo',
  company_banner: 'Company banner',
};

/**
 * Build a numeric timestamp-based filename.
 * Example: 1730284732123456.jpg
 */
const buildProfileFileName = (_fieldName, originalName) => {
  const ext = path.extname(originalName).toLowerCase();
  const timestamp = Date.now();
  const unique = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `${timestamp}${unique}${ext}`;
};

const getProfileUploadDir = (userId) =>
  path.join(uploadConfig.rootDir, uploadConfig.profileSubDir, String(userId));

const buildRelativeProfilePath = (userId, fileName) =>
  `${uploadConfig.profileSubDir}/${userId}/${fileName}`;

const getUploadedProfilePath = (files, field, userId) => {
  const file = files?.[field]?.[0];
  if (!file) return null;
  return buildRelativeProfilePath(userId, file.filename);
};

/**
 * Convert stored relative path to a public URL. External URLs are returned as-is.
 */
const resolveMediaUrl = (storedValue) => {
  if (!storedValue) return null;
  if (/^https?:\/\//i.test(storedValue)) return storedValue;

  const baseUrl = (config.app.url || '').replace(/\/$/, '');
  const normalized = storedValue.replace(/^\/+/, '');
  return `${baseUrl}${uploadConfig.publicPath}/${normalized}`;
};

const deleteStoredFile = async (storedValue) => {
  if (!storedValue || /^https?:\/\//i.test(storedValue)) return;

  const filePath = path.join(uploadConfig.rootDir, storedValue);
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
};

/**
 * Assign a new uploaded image: delete the previous file and return the new stored path.
 * Returns null when no new file was uploaded.
 */
const replaceStoredImage = async (files, field, userId, existingStoredPath) => {
  const newPath = getUploadedProfilePath(files, field, userId);
  if (!newPath) return null;

  if (existingStoredPath && existingStoredPath !== newPath) {
    await deleteStoredFile(existingStoredPath);
  }

  return newPath;
};

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

module.exports = {
  IMAGE_FIELD_LABELS,
  buildProfileFileName,
  getProfileUploadDir,
  resolveMediaUrl,
  replaceStoredImage,
  ensureDir,
};
