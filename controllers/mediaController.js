/**
 * Stream files from local uploads directory through the backend.
 */
const path = require('path');
const fs = require('fs');
const uploadConfig = require('../config/upload');

/**
 * GET /media/* and GET /uploads/* fallback
 * Stream a file from local uploads directory.
 */
const serveMedia = async (req, res, next) => {
  try {
    const rawPath = req.path.replace(/^\/+/, '');

    if (!rawPath || rawPath.includes('..')) {
      return res.status(400).json({ success: false, message: 'Invalid media path' });
    }

    // Resolve candidates: direct path or stripped uploads/ / media/ prefix
    const root = path.resolve(uploadConfig.rootDir);
    const candidates = [
      path.resolve(root, rawPath),
      path.resolve(root, rawPath.replace(/^(?:uploads|media)[\\/]/i, '')),
    ];

    for (const localPath of candidates) {
      // Prevent directory traversal attacks
      if (!localPath.startsWith(root)) {
        continue;
      }

      try {
        if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
          return res.sendFile(localPath, {
            maxAge: '1d',
            dotfiles: 'deny',
          });
        }
      } catch {
        /* continue checking next candidate */
      }
    }

    return res.status(404).json({ success: false, message: 'File not found' });
  } catch (err) {
    next(err);
  }
};

module.exports = { serveMedia };
