const multer = require('multer');
const path = require('path');
const { AppError } = require('../utils/response');
const uploadConfig = require('../config/upload');
const s3Service = require('./s3Service');
const {
  buildStoredFileName,
  assignStoredFileNames,
  ensureDir,
  storeUploadedFile,
  storeMultipleUploadedFiles,
} = require('../utils/media');

// ==========================================
// Multer helpers
// ==========================================

/**
 * Map multer errors to consistent AppError responses.
 * @param {Error} err
 * @returns {AppError|Error}
 */
const formatMulterError = (err) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new AppError('File size exceeds the allowed limit', 400);
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return new AppError(`Unexpected file field: ${err.field}`, 400);
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return new AppError(
        `Too many files uploaded for field "${err.field}". Check per-field and combined image + video limits.`,
        400,
      );
    }
    return new AppError(err.message, 400);
  }
  return err;
};

/**
 * Validate uploaded file MIME type and extension against project config.
 */
const createFileFilter = () => (_req, file, cb) => {
  if (!uploadConfig.allowedMimeTypes.includes(file.mimetype)) {
    return cb(new AppError('Only JPEG, PNG, WEBP, and GIF images are allowed', 400), false);
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (!uploadConfig.allowedExtensions.includes(ext)) {
    return cb(new AppError('Invalid image file extension', 400), false);
  }

  cb(null, true);
};

/** Product uploads: images for thumbnail/image, videos for video field. */
const createProductFileFilter = () => (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (file.fieldname === 'video') {
    if (!uploadConfig.allowedVideoMimeTypes.includes(file.mimetype)) {
      return cb(new AppError('Only MP4, WEBM, and MOV videos are allowed', 400), false);
    }
    if (!uploadConfig.allowedVideoExtensions.includes(ext)) {
      return cb(new AppError('Invalid video file extension', 400), false);
    }
    return cb(null, true);
  }

  if (!uploadConfig.allowedMimeTypes.includes(file.mimetype)) {
    return cb(new AppError('Only JPEG, PNG, WEBP, and GIF images are allowed', 400), false);
  }
  if (!uploadConfig.allowedExtensions.includes(ext)) {
    return cb(new AppError('Invalid image file extension', 400), false);
  }

  cb(null, true);
};

const buildMulterStorage = (getDestination) => {
  if (s3Service.isEnabled()) {
    return multer.memoryStorage();
  }

  return multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        const dir = getDestination(req);
        ensureDir(dir);
        cb(null, dir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (_req, file, cb) => {
      cb(null, buildStoredFileName(file.fieldname, file.originalname));
    },
  });
};

// ==========================================
// Public API
// ==========================================

/**
 * Create reusable multer middleware for one or more file fields.
 * Files are stored in S3 when configured; otherwise saved to local uploads/.
 *
 * @param {{ fields: Array, getDestination: Function, maxFileSize?: number, fileFilter?: Function }} options
 * @returns {Function} Express middleware
 */
const createUploadMiddleware = ({
  fields,
  getDestination,
  maxFileSize = uploadConfig.maxFileSize,
  fileFilter = createFileFilter(),
}) => {
  const upload = multer({
    storage: buildMulterStorage(getDestination),
    limits: { fileSize: maxFileSize },
    fileFilter,
  });

  return (req, res, next) => {
    upload.fields(fields)(req, res, (err) => {
      if (err) return next(formatMulterError(err));
      if (s3Service.isEnabled()) {
        assignStoredFileNames(req.files);
      }
      return next();
    });
  };
};

/**
 * Process uploaded files and return stored path updates.
 * Uploads to S3 (or local disk) at pathSegments.
 *
 * @param {{ files: Object, fields: string[], pathSegments: string[], existing?: Object, mode?: 'direct'|'inbox' }} options
 * @returns {Promise<Object>} Map of field name → relative stored path
 */
const processUploadedFiles = async ({
  files = {},
  fields = [],
  pathSegments = [],
  existing = {},
  mode: _mode = 'direct',
}) => {
  const updates = {};

  for (const field of fields) {
    const storedPath = await storeUploadedFile(
      files,
      field,
      pathSegments,
      existing[field] || null,
    );
    if (storedPath) {
      updates[field] = storedPath;
    }
  }

  return updates;
};

/**
 * Collect relative paths for multiple uploaded files in one field.
 * @returns {Promise<string[]>}
 */
const processMultipleUploadedFiles = async ({
  files = {},
  field,
  pathSegments = [],
  mode: _mode = 'direct',
}) => storeMultipleUploadedFiles(files, field, pathSegments);

module.exports = {
  createUploadMiddleware,
  processUploadedFiles,
  processMultipleUploadedFiles,
  createProductFileFilter,
};
