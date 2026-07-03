/**
 * File upload configuration.
 *
 * Storage paths, size limits, and allowed image MIME types/extensions.
 */
const path = require('path');

// ==========================================
// Upload settings
// ==========================================

module.exports = {
  rootDir: path.join(process.cwd(), 'uploads'),
  inboxSubDir: '_inbox',
  publicPath: '/uploads',
  maxFileSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE, 10) || 5 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  allowedVideoMimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
  allowedVideoExtensions: ['.mp4', '.webm', '.mov'],
  maxVideoFileSize: parseInt(process.env.UPLOAD_MAX_VIDEO_FILE_SIZE, 10) || 50 * 1024 * 1024,
};
