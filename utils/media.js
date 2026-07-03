/**
 * Shared media/file path utilities.
 * Local disk fallback when S3 is not configured; S3 when Railway bucket env vars are set.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const uploadConfig = require('../config/upload');
const s3Service = require('../services/s3Service');

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
  video: 'Video',
};

// ==========================================
// Path helpers
// ==========================================

/**
 * Build a unique timestamp-based filename for uploads.
 * Example: 1730284732123456.jpg
 */
const buildStoredFileName = (fieldName, originalName) => {
  const ext = path.extname(originalName).toLowerCase();
  const timestamp = Date.now();
  const unique = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `${timestamp}${unique}${ext}`;
};

/** Assign generated filenames to in-memory multer files. */
const assignStoredFileNames = (files = {}) => {
  Object.values(files).forEach((fieldFiles) => {
    fieldFiles.forEach((file) => {
      if (!file.filename) {
        file.filename = buildStoredFileName(file.fieldname, file.originalname);
      }
    });
  });
};

/** Create directory recursively if it does not exist. */
const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

/** Absolute filesystem path under uploads/ (local dev fallback). */
const getAbsoluteUploadDir = (...segments) =>
  path.join(uploadConfig.rootDir, ...segments.map(String));

/** Relative path stored in DB (e.g. categories/12/1730284732123456.jpg). */
const buildRelativeStoredPath = (...segments) => segments.map(String).join('/');

/** Get multer file from a field (single file). */
const getMulterFile = (files, field) => files?.[field]?.[0] || null;

// ==========================================
// URL resolution
// ==========================================

/**
 * Convert a stored relative path to a public URL.
 * Uses S3 public URL when configured; otherwise local /uploads path.
 */
const resolveMediaUrl = (storedValue) => {
  if (!storedValue) return null;
  if (/^https?:\/\//i.test(storedValue)) return storedValue;

  if (s3Service.isEnabled()) {
    return s3Service.getPublicUrl(storedValue);
  }

  const baseUrl = (config.app.url || '').replace(/\/$/, '');
  const normalized = storedValue.replace(/^\/+/, '');
  return `${baseUrl}${uploadConfig.publicPath}/${normalized}`;
};

// ==========================================
// Storage operations
// ==========================================

/** Persist file buffer or disk file to storage (S3 or local). */
const persistFile = async (relativePath, file) => {
  if (s3Service.isEnabled()) {
    if (!file?.buffer) {
      throw new Error('File buffer is required for S3 upload');
    }
    return s3Service.uploadBuffer(relativePath, file.buffer, file.mimetype);
  }

  const destPath = path.join(uploadConfig.rootDir, relativePath);
  ensureDir(path.dirname(destPath));

  if (file.buffer) {
    await fs.promises.writeFile(destPath, file.buffer);
  } else if (file.path) {
    if (file.path !== destPath) {
      await fs.promises.rename(file.path, destPath);
    }
  } else {
    throw new Error('No file data available to persist');
  }

  return relativePath;
};

/** Delete a previously stored file (S3 or local disk). */
const deleteStoredFile = async (storedValue) => {
  if (!storedValue || /^https?:\/\//i.test(storedValue)) {
    if (storedValue && s3Service.isEnabled()) {
      await s3Service.deleteObject(storedValue);
    }
    return;
  }

  if (s3Service.isEnabled()) {
    await s3Service.deleteObject(storedValue);
    return;
  }

  const filePath = path.join(uploadConfig.rootDir, storedValue);
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
};

/**
 * Upload a single field file to the destination path (create or update).
 * @returns {Promise<string|null>}
 */
const storeUploadedFile = async (files, field, pathSegments, existingStoredPath = null) => {
  const file = getMulterFile(files, field);
  if (!file) return null;

  const fileName = file.filename || buildStoredFileName(field, file.originalname);
  const relativePath = buildRelativeStoredPath(...pathSegments, fileName);

  if (existingStoredPath && existingStoredPath !== relativePath) {
    await deleteStoredFile(existingStoredPath);
  }

  await persistFile(relativePath, file);
  return relativePath;
};

/** Upload multiple files for one field. */
const storeMultipleUploadedFiles = async (files, field, pathSegments) => {
  const fileList = files?.[field] || [];
  if (!fileList.length) return [];

  const paths = [];
  for (const file of fileList) {
    const fileName = file.filename || buildStoredFileName(field, file.originalname);
    const relativePath = buildRelativeStoredPath(...pathSegments, fileName);
    await persistFile(relativePath, file);
    paths.push(relativePath);
  }
  return paths;
};

/** @deprecated Use storeUploadedFile — kept for uploadService compatibility. */
const replaceUploadedFile = async (files, field, pathSegments, existingStoredPath) =>
  storeUploadedFile(files, field, pathSegments, existingStoredPath);

/** @deprecated Use storeUploadedFile — inbox flow uploads directly to final path. */
const finalizeInboxUpload = async (files, field, destSegments) =>
  storeUploadedFile(files, field, destSegments);

/** @deprecated Use storeMultipleUploadedFiles. */
const finalizeInboxUploads = async (files, field, destSegments) =>
  storeMultipleUploadedFiles(files, field, destSegments);

/** @deprecated Use storeMultipleUploadedFiles. */
const getMultipleUploadedRelativePaths = async (files, field, ...pathSegments) =>
  storeMultipleUploadedFiles(files, field, pathSegments);

/** @deprecated Local disk helper. */
const getUploadedRelativePath = (files, field, ...pathSegments) => {
  const file = getMulterFile(files, field);
  if (!file) return null;
  return buildRelativeStoredPath(...pathSegments, file.filename || path.basename(file.path));
};

module.exports = {
  IMAGE_FIELD_LABELS,
  buildStoredFileName,
  assignStoredFileNames,
  ensureDir,
  getAbsoluteUploadDir,
  buildRelativeStoredPath,
  getUploadedRelativePath,
  resolveMediaUrl,
  deleteStoredFile,
  persistFile,
  storeUploadedFile,
  storeMultipleUploadedFiles,
  replaceUploadedFile,
  finalizeInboxUpload,
  finalizeInboxUploads,
  getMultipleUploadedRelativePaths,
};
