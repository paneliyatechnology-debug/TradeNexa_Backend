/**
 * Shared media/file path utilities.
 * Used by upload service, profile, categories, and API response formatting.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const uploadConfig = require('../config/upload');

// ==========================================
// Constants
// ==========================================

/** Human-readable labels for image field validation messages. */
const IMAGE_FIELD_LABELS = {
  profile_image: 'Profile image',
  company_logo: 'Company logo',
  company_banner: 'Company banner',
  icon: 'Icon',
  image: 'Image',
  logo: 'Logo',
  thumbnail: 'Thumbnail',
  image: 'Image',
  video: 'Video',
};

// ==========================================
// Path helpers
// ==========================================

/**
 * Build a unique timestamp-based filename for uploads.
 * Example: 1730284732123456.jpg
 */
const buildStoredFileName = (_fieldName, originalName) => {
  const ext = path.extname(originalName).toLowerCase();
  const timestamp = Date.now();
  const unique = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `${timestamp}${unique}${ext}`;
};

/** Create directory recursively if it does not exist. */
const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

/** Absolute filesystem path under uploads/. */
const getAbsoluteUploadDir = (...segments) =>
  path.join(uploadConfig.rootDir, ...segments.map(String));

/** Relative path stored in DB (e.g. profiles/12/1730284732123456.jpg). */
const buildRelativeStoredPath = (...segments) => segments.map(String).join('/');

/**
 * Build relative path from a multer file already saved in the target folder.
 * @returns {string|null}
 */
const getUploadedRelativePath = (files, field, ...pathSegments) => {
  const file = files?.[field]?.[0];
  if (!file) return null;
  return buildRelativeStoredPath(...pathSegments, file.filename);
};

// ==========================================
// URL resolution
// ==========================================

/**
 * Convert a stored relative path to a public URL.
 * External URLs (legacy data) are returned unchanged.
 */
const resolveMediaUrl = (storedValue) => {
  if (!storedValue) return null;
  if (/^https?:\/\//i.test(storedValue)) return storedValue;

  const baseUrl = (config.app.url || '').replace(/\/$/, '');
  const normalized = storedValue.replace(/^\/+/, '');
  return `${baseUrl}${uploadConfig.publicPath}/${normalized}`;
};

// ==========================================
// File operations
// ==========================================

/** Delete a previously stored file from disk (skips external URLs). */
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
 * Handle a direct upload on update: delete old file and return new relative path.
 * @returns {Promise<string|null>}
 */
const replaceUploadedFile = async (files, field, pathSegments, existingStoredPath) => {
  const relativePath = getUploadedRelativePath(files, field, ...pathSegments);
  if (!relativePath) return null;

  if (existingStoredPath && existingStoredPath !== relativePath) {
    await deleteStoredFile(existingStoredPath);
  }

  return relativePath;
};

/**
 * Move a file from the inbox folder to the final record folder (create flow).
 * @returns {Promise<string|null>}
 */
const finalizeInboxUpload = async (files, field, destSegments) => {
  const file = files?.[field]?.[0];
  if (!file) return null;

  const destDir = getAbsoluteUploadDir(...destSegments);
  ensureDir(destDir);

  const fileName = file.filename || path.basename(file.path);
  const destPath = path.join(destDir, fileName);

  if (file.path !== destPath) {
    await fs.promises.rename(file.path, destPath);
  }

  return buildRelativeStoredPath(...destSegments, fileName);
};

/** Move multiple inbox files to the final record folder (create flow). */
const finalizeInboxUploads = async (files, field, destSegments) => {
  const fileList = files?.[field] || [];
  if (!fileList.length) return [];

  const destDir = getAbsoluteUploadDir(...destSegments);
  ensureDir(destDir);
  const paths = [];

  for (const file of fileList) {
    const fileName = file.filename || path.basename(file.path);
    const destPath = path.join(destDir, fileName);

    if (file.path !== destPath) {
      await fs.promises.rename(file.path, destPath);
    }

    paths.push(buildRelativeStoredPath(...destSegments, fileName));
  }

  return paths;
};

/** Build relative paths for multiple files already saved in the target folder. */
const getMultipleUploadedRelativePaths = (files, field, ...pathSegments) => {
  const fileList = files?.[field] || [];
  return fileList.map((file) =>
    buildRelativeStoredPath(...pathSegments, file.filename || path.basename(file.path)),
  );
};

module.exports = {
  IMAGE_FIELD_LABELS,
  buildStoredFileName,
  ensureDir,
  getAbsoluteUploadDir,
  buildRelativeStoredPath,
  getUploadedRelativePath,
  resolveMediaUrl,
  deleteStoredFile,
  replaceUploadedFile,
  finalizeInboxUpload,
  finalizeInboxUploads,
  getMultipleUploadedRelativePaths,
};
