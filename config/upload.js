const path = require('path');

module.exports = {
  rootDir: path.join(process.cwd(), 'uploads'),
  profileSubDir: 'profiles',
  publicPath: '/uploads',
  maxFileSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE, 10) || 5 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
};
