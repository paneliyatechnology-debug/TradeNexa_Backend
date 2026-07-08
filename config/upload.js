/**
 * File upload configuration.
 *
 * Size limits and allowed MIME types/extensions.
 * Files are stored in Railway S3 when bucket env vars are configured.
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
  allowedDocumentMimeTypes: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  allowedDocumentExtensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx'],
  maxDocumentFileSize: parseInt(process.env.UPLOAD_MAX_DOCUMENT_FILE_SIZE, 10) || 10 * 1024 * 1024,
  maxVideoFileSize: parseInt(process.env.UPLOAD_MAX_VIDEO_FILE_SIZE, 10) || 50 * 1024 * 1024,
};
