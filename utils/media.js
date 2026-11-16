/**
 * Shared media/file path utilities for local disk storage under uploads/.
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
  const ext = path.extname(originalName || '').toLowerCase();
  const timestamp = Date.now();
  const unique = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `${timestamp}${unique}${ext}`;
};

/** Assign generated filenames to in-memory or disk multer files. */
const assignStoredFileNames = (files = {}) => {
  Object.values(files).forEach((fieldFiles) => {
    if (!Array.isArray(fieldFiles)) return;
    fieldFiles.forEach((file) => {
      if (!file.filename) {
        file.filename = buildStoredFileName(file.fieldname, file.originalname);
      }
    });
  });
};

/** Create directory recursively if it does not exist. */
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

/** Absolute filesystem path under uploads/ directory. */
const getAbsoluteUploadDir = (...segments) =>
  path.join(uploadConfig.rootDir, ...segments.map(String));

/** Relative path stored in DB (e.g. categories/12/1730284732123456.jpg). */
const buildRelativeStoredPath = (...segments) => segments.map(String).join('/');

/** Get multer file from a field (single file). */
const getMulterFile = (files, field) => files?.[field]?.[0] || null;

// ==========================================
// URL resolution & Path Normalization
// ==========================================

const normalizeBaseUrl = (url) => {
  if (!url) return '';
  let clean = String(url).trim().replace(/\/+$/, '');
  if (!clean) return '';
  if (!/^https?:\/\//i.test(clean)) {
    clean = /^(localhost|127\.0\.0\.1)/i.test(clean) ? `http://${clean}` : `https://${clean}`;
  }
  return clean;
};

/**
 * Extract clean relative path from any stored value (URL, relative path, or legacy S3 key).
 * Returns true external third-party URLs as-is.
 * @param {string} storedValue
 * @returns {string|null}
 */
const extractRelativePath = (storedValue) => {
  if (!storedValue) return null;
  let str = String(storedValue).trim();
  if (!str) return null;

  if (/^https?:\/\//i.test(str)) {
    try {
      const parsed = new URL(str);
      const pathname = parsed.pathname;

      // Matches /media/..., /uploads/..., /api/media/..., /api/uploads/...
      const mediaMatch = pathname.match(/^\/(?:media|uploads|api\/media|api\/uploads)\/(.+)$/i);
      if (mediaMatch) {
        str = mediaMatch[1];
      } else {
        const parts = pathname.replace(/^\/+/, '').split('/');
        if (parts[0] === 'tradenexa' || parts[1] === 'tradenexa') {
          const idx = parts.indexOf('tradenexa');
          str = parts.slice(idx + 1).join('/');
        } else if (
          parsed.hostname.includes('storageapi.dev') ||
          parsed.hostname.includes('amazonaws.com') ||
          parsed.hostname.includes('railway.app') ||
          parsed.hostname.includes('tradenexa.co') ||
          parsed.hostname.includes('localhost') ||
          parsed.hostname.includes('127.0.0.1')
        ) {
          // Internal host: strip bucket name if it was first path segment
          str = parts.join('/');
        } else {
          // True external URL (e.g. Google profile picture, external CDN)
          return str;
        }
      }
    } catch {
      /* ignore URL parsing failure */
    }
  }

  // Strip leading slashes/backslashes and normalize separators
  str = str.replace(/^[/\\]+/, '').replace(/\\/g, '/');
  // Strip redundant prefix folders like tradenexa/ or uploads/
  str = str.replace(/^(?:tradenexa\/|uploads\/)+/i, '');

  return str || null;
};

/**
 * Convert a stored relative path or legacy URL to a clean, professional public URL:
 * Format: {BACKEND_URL}/uploads/{relativePath}
 * @param {string} storedValue
 * @returns {string|null}
 */
const resolveMediaUrl = (storedValue) => {
  if (!storedValue) return null;

  const relativePath = extractRelativePath(storedValue);
  if (!relativePath) return null;

  // External CDN / third-party URLs returned untouched
  if (/^https?:\/\//i.test(relativePath)) {
    return relativePath;
  }

  const backendUrl = normalizeBaseUrl(config.app?.backendUrl || config.app?.baseUrl || config.app?.url);
  return `${backendUrl}/uploads/${relativePath}`;
};

// ==========================================
// Storage operations (Local Disk)
// ==========================================

/**
 * Persist uploaded file (buffer or disk file) into local uploads/{relativePath}.
 * Moves files out of temporary inbox directories into their final destination.
 * @param {string} relativePath
 * @param {Object} file - Multer file object
 * @returns {Promise<string>} relativePath
 */
const persistFile = async (relativePath, file) => {
  const destPath = path.resolve(uploadConfig.rootDir, relativePath);
  ensureDir(path.dirname(destPath));

  if (file.buffer) {
    await fs.promises.writeFile(destPath, file.buffer);
  } else if (file.path) {
    const sourcePath = path.resolve(file.path);
    if (sourcePath !== destPath) {
      try {
        await fs.promises.rename(sourcePath, destPath);
      } catch (err) {
        if (err.code === 'EXDEV') {
          await fs.promises.copyFile(sourcePath, destPath);
          await fs.promises.unlink(sourcePath);
        } else {
          throw err;
        }
      }
      file.path = destPath;
    }
  } else {
    throw new Error('No file data available to persist');
  }

  return relativePath;
};

/**
 * Delete a previously stored file from local disk.
 * @param {string} storedValue - DB path or URL
 */
const deleteStoredFile = async (storedValue) => {
  if (!storedValue) return;

  const relativePath = extractRelativePath(storedValue);
  if (!relativePath || /^https?:\/\//i.test(relativePath)) return;

  const filePath = path.resolve(uploadConfig.rootDir, relativePath);
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      console.log(`🗑️ [MEDIA DELETE SUCCESS] Deleted local file: ${relativePath}`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`⚠️ [MEDIA DELETE ERROR] Could not delete ${relativePath}:`, err.message);
    }
  }
};

/**
 * Upload a single field file to the destination path (create or update).
 * @param {Object} files - Multer req.files
 * @param {string} field - Field name
 * @param {string[]} pathSegments - Target folder segments under uploads/
 * @param {string|null} [existingStoredPath=null] - Previous file path to clean up
 * @returns {Promise<string|null>} Relative path saved in DB
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
  const liveUrl = resolveMediaUrl(relativePath);
  console.log(`📸 [MEDIA UPLOAD SUCCESS] Field: "${field}" | Live URL: ${liveUrl}`);
  return relativePath;
};

/**
 * Upload multiple files for one field.
 * @param {Object} files - Multer req.files
 * @param {string} field - Field name
 * @param {string[]} pathSegments - Target folder segments under uploads/
 * @returns {Promise<string[]>} Array of relative paths
 */
const storeMultipleUploadedFiles = async (files, field, pathSegments) => {
  const fileList = files?.[field] || [];
  if (!fileList.length) return [];

  const paths = [];
  for (const file of fileList) {
    const fileName = file.filename || buildStoredFileName(field, file.originalname);
    const relativePath = buildRelativeStoredPath(...pathSegments, fileName);
    await persistFile(relativePath, file);
    const liveUrl = resolveMediaUrl(relativePath);
    console.log(`📸 [MEDIA UPLOAD SUCCESS] Field: "${field}" | Live URL: ${liveUrl}`);
    paths.push(relativePath);
  }
  return paths;
};

/** @deprecated Use storeUploadedFile — kept for backward compatibility. */
const replaceUploadedFile = async (files, field, pathSegments, existingStoredPath) =>
  storeUploadedFile(files, field, pathSegments, existingStoredPath);

/** @deprecated Use storeUploadedFile — inbox flow moves directly to final path. */
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
  extractRelativePath,
  normalizeStoredPath: extractRelativePath,
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
