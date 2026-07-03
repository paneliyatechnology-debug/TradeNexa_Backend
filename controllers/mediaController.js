/**
 * Stream private S3 objects through the backend (Railway buckets are not public by default).
 */
const s3Service = require('../services/s3Service');
const { AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

/**
 * GET /media/*
 * Stream a file from S3 using server credentials.
 */
const serveMedia = async (req, res, next) => {
  try {
    const relativePath = req.path.replace(/^\/+/, '');

    if (!relativePath || relativePath.includes('..')) {
      return next(new AppError('Invalid media path', HTTP_STATUS.BAD_REQUEST));
    }

    const object = await s3Service.getObject(relativePath);

    if (object.ContentType) {
      res.set('Content-Type', object.ContentType);
    }
    if (object.ContentLength) {
      res.set('Content-Length', String(object.ContentLength));
    }
    res.set('Cache-Control', 'public, max-age=31536000, immutable');

    object.Body.pipe(res);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return next(new AppError('File not found', HTTP_STATUS.NOT_FOUND));
    }
    next(err);
  }
};

module.exports = { serveMedia };
