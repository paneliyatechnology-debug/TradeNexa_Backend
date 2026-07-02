const multer = require('multer');
const path = require('path');
const { AppError } = require('../utils/response');
const uploadConfig = require('../config/upload');
const {
  buildStoredFileName,
  ensureDir,
  replaceUploadedFile,
  finalizeInboxUpload,
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
      return new AppError('Image size must not exceed 5MB', 400);
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return new AppError(`Unexpected file field: ${err.field}`, 400);
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

// ==========================================
// Public API
// ==========================================

/**
 * Create reusable multer middleware for one or more file fields.
 *
 * @param {{ fields: Array, getDestination: Function, maxFileSize?: number }} options
 * @returns {Function} Express middleware
 */
const createUploadMiddleware = ({ fields, getDestination, maxFileSize = uploadConfig.maxFileSize }) => {
  const storage = multer.diskStorage({
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

  const upload = multer({
    storage,
    limits: { fileSize: maxFileSize },
    fileFilter: createFileFilter(),
  });

  return (req, res, next) => {
    upload.fields(fields)(req, res, (err) => {
      if (!err) return next();
      return next(formatMulterError(err));
    });
  };
};

/**
 * Process uploaded files and return stored path updates.
 *
 * Modes:
 * - direct: file already saved in final folder (update flow)
 * - inbox: move file from inbox to final folder (create flow)
 *
 * @param {{ files: Object, fields: string[], pathSegments: string[], existing?: Object, mode?: 'direct'|'inbox' }} options
 * @returns {Promise<Object>} Map of field name → relative stored path
 */
const processUploadedFiles = async ({
  files = {},
  fields = [],
  pathSegments = [],
  existing = {},
  mode = 'direct',
}) => {
  const updates = {};

  for (const field of fields) {
    let storedPath = null;

    if (mode === 'inbox') {
      storedPath = await finalizeInboxUpload(files, field, pathSegments);
    } else {
      storedPath = await replaceUploadedFile(files, field, pathSegments, existing[field]);
    }

    if (storedPath) {
      updates[field] = storedPath;
    }
  }

  return updates;
};

module.exports = {
  createUploadMiddleware,
  processUploadedFiles,
};
