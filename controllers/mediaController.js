/**
 * Stream files from local disk or S3 through the backend.
 */
const path = require('path');
const fs = require('fs');
const s3Service = require('../services/s3Service');
const uploadConfig = require('../config/upload');
const { AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

/**
 * GET /media/* and GET /uploads/*
 * Stream a file from local disk or private S3 bucket.
 */
const serveMedia = async (req, res, next) => {
  try {
    const rawPath = req.path.replace(/^\/+/, '');

    if (!rawPath || rawPath.includes('..')) {
      return res.status(400).json({ success: false, message: 'Invalid media path' });
    }

    // 1. Check local disk first (using absolute path for res.sendFile)
    const localCandidates = [
      path.resolve(uploadConfig.rootDir, rawPath),
      path.resolve(uploadConfig.rootDir, rawPath.replace(/^uploads[\\/]/, '')),
    ];

    for (const localPath of localCandidates) {
      try {
        if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
          return res.sendFile(localPath);
        }
      } catch {
        /* continue */
      }
    }

    // 2. Try S3 storage if configured
    if (s3Service.isEnabled()) {
      let object = null;
      try {
        object = await s3Service.getObject(rawPath);
      } catch (err) {
        if (rawPath.startsWith('uploads/')) {
          try {
            object = await s3Service.getObject(rawPath.replace(/^uploads\//, ''));
          } catch (e) {
            /* ignore */
          }
        } else {
          try {
            object = await s3Service.getObject(`uploads/${rawPath}`);
          } catch (e) {
            /* ignore */
          }
        }
      }

      if (object) {
        if (object.ContentType) {
          res.set('Content-Type', object.ContentType);
        }
        if (object.ContentLength) {
          res.set('Content-Length', String(object.ContentLength));
        }
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        return object.Body.pipe(res);
      }
    }

    return res.status(404).json({ success: false, message: 'File not found' });
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    next(err);
  }
};

module.exports = { serveMedia };
