const multer = require('multer');
const path = require('path');
const { AppError } = require('../utils/response');
const uploadConfig = require('../config/upload');
const { buildProfileFileName, getProfileUploadDir, ensureDir } = require('../utils/media');

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = getProfileUploadDir(req.user.id);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, buildProfileFileName(file.fieldname, file.originalname));
  },
});

const fileFilter = (_req, file, cb) => {
  if (!uploadConfig.allowedMimeTypes.includes(file.mimetype)) {
    return cb(new AppError('Only JPEG, PNG, WEBP, and GIF images are allowed', 400), false);
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (!uploadConfig.allowedExtensions.includes(ext)) {
    return cb(new AppError('Invalid image file extension', 400), false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: uploadConfig.maxFileSize },
  fileFilter,
});

const profileImageUpload = upload.fields([
  { name: 'profile_image', maxCount: 1 },
  { name: 'company_logo', maxCount: 1 },
  { name: 'company_banner', maxCount: 1 },
]);

const handleProfileUpload = (req, res, next) => {
  profileImageUpload(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Image size must not exceed 5MB', 400));
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new AppError(`Unexpected file field: ${err.field}`, 400));
      }
      return next(new AppError(err.message, 400));
    }

    return next(err);
  });
};

module.exports = { handleProfileUpload };
