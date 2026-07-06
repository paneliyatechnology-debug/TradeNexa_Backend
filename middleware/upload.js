/**
 * Pre-configured upload middleware for profile, category, brand, and product modules.
 * Uses the shared upload service — add new module handlers here.
 */
const { AppError } = require('../utils/response');
const { createUploadMiddleware, createProductFileFilter } = require('../services/uploadService');
const { getAbsoluteUploadDir } = require('../utils/media');
const uploadConfig = require('../config/upload');
const { uploadPaths } = require('../constants/uploadPaths');
const {
  PROFILE_UPLOAD_FIELDS,
  CATEGORY_UPLOAD_FIELDS,
  BRAND_UPLOAD_FIELDS,
  BANNER_UPLOAD_FIELDS,
  PRODUCT_UPLOAD_FIELDS,
  MAX_PRODUCT_GALLERY_MEDIA,
} = require('../constants/uploadFields');

// ==========================================
// Profile uploads
// ==========================================

/** PUT /auth/profile — profile_image, company_logo, company_banner */
const handleProfileUpload = createUploadMiddleware({
  fields: PROFILE_UPLOAD_FIELDS,
  getDestination: (req) => getAbsoluteUploadDir(...uploadPaths.userProfile(req.user.id)),
});

// ==========================================
// Category & subcategory uploads
// ==========================================

/**
 * POST /categories and POST /categories/:id/subcategories.
 * Files land in inbox first, then move to categories/{id}/ after record creation.
 */
const handleCategoryCreateUpload = createUploadMiddleware({
  fields: CATEGORY_UPLOAD_FIELDS,
  getDestination: (req) => getAbsoluteUploadDir(...uploadPaths.categoryInbox(req.user.id)),
});

/** PUT /categories/:id */
const handleCategoryUpdateUpload = createUploadMiddleware({
  fields: CATEGORY_UPLOAD_FIELDS,
  getDestination: (req) => {
    const categoryId = req.params.id;
    if (!categoryId) {
      throw new AppError('Category ID is required for image upload', 400);
    }
    return getAbsoluteUploadDir(...uploadPaths.category(categoryId));
  },
});

/** PUT /categories/:categoryId/subcategories/:id */
const handleSubcategoryUpdateUpload = createUploadMiddleware({
  fields: CATEGORY_UPLOAD_FIELDS,
  getDestination: (req) => {
    const subcategoryId = req.params.id;
    if (!subcategoryId) {
      throw new AppError('Subcategory ID is required for image upload', 400);
    }
    return getAbsoluteUploadDir(...uploadPaths.category(subcategoryId));
  },
});

// ==========================================
// Brand uploads
// ==========================================

/**
 * POST /brands.
 * Files land in inbox first, then move to brands/{id}/ after record creation.
 */
const handleBrandCreateUpload = createUploadMiddleware({
  fields: BRAND_UPLOAD_FIELDS,
  getDestination: (req) => getAbsoluteUploadDir(...uploadPaths.brandInbox(req.user.id)),
});

/** PUT /brands/:id */
const handleBrandUpdateUpload = createUploadMiddleware({
  fields: BRAND_UPLOAD_FIELDS,
  getDestination: (req) => {
    const brandId = req.params.id;
    if (!brandId) {
      throw new AppError('Brand ID is required for logo upload', 400);
    }
    return getAbsoluteUploadDir(...uploadPaths.brand(brandId));
  },
});

// ==========================================
// Banner uploads
// ==========================================

/**
 * POST /banners.
 * Files land in inbox first, then move to banners/{id}/ after record creation.
 */
const handleBannerCreateUpload = createUploadMiddleware({
  fields: BANNER_UPLOAD_FIELDS,
  getDestination: (req) => getAbsoluteUploadDir(...uploadPaths.bannerInbox(req.user.id)),
});

/** PUT /banners/:id */
const handleBannerUpdateUpload = createUploadMiddleware({
  fields: BANNER_UPLOAD_FIELDS,
  getDestination: (req) => {
    const bannerId = req.params.id;
    if (!bannerId) {
      throw new AppError('Banner ID is required for image upload', 400);
    }
    return getAbsoluteUploadDir(...uploadPaths.banner(bannerId));
  },
});

// ==========================================
// Product uploads
// ==========================================

/**
 * POST /products.
 * Files land in inbox first, then move to products/{id}/ after record creation.
 */
const handleProductCreateUpload = createUploadMiddleware({
  fields: PRODUCT_UPLOAD_FIELDS,
  getDestination: (req) => getAbsoluteUploadDir(...uploadPaths.productInbox(req.user.id)),
  fileFilter: createProductFileFilter(),
  maxFileSize: uploadConfig.maxVideoFileSize,
});

/** PUT /products/:id */
const handleProductUpdateUpload = createUploadMiddleware({
  fields: PRODUCT_UPLOAD_FIELDS,
  getDestination: (req) => {
    const productId = req.params.id;
    if (!productId) {
      throw new AppError('Product ID is required for thumbnail upload', 400);
    }
    return getAbsoluteUploadDir(...uploadPaths.product(productId));
  },
  fileFilter: createProductFileFilter(),
  maxFileSize: uploadConfig.maxVideoFileSize,
});

/**
 * Require icon file on category/subcategory create.
 * Must run after multer upload middleware.
 */
const requireIconUpload = (req, _res, next) => {
  if (!req.files?.icon?.[0]) {
    return next(new AppError('Icon is required', 400));
  }
  next();
};

/** Require image file on banner create. Must run after multer upload middleware. */
const requireBannerImageOnCreate = (req, _res, next) => {
  if (!req.files?.image?.[0]) {
    return next(new AppError('Banner image is required', 400));
  }
  next();
};

const countUploadedGalleryMedia = (files = {}) =>
  (files.image?.length || 0) + (files.video?.length || 0);

/** Require thumbnail file on product create. Must run after multer upload middleware. */
const requireProductThumbnailOnCreate = (req, _res, next) => {
  if (!req.files?.thumbnail?.[0]) {
    return next(new AppError('Thumbnail is required', 400));
  }
  next();
};

/**
 * Enforce combined gallery image + video limit. Must run after multer upload middleware.
 * @param {'create'|'update'} mode
 */
const validateProductGalleryMediaCount = (mode = 'create') => async (req, _res, next) => {
  try {
    const newCount = countUploadedGalleryMedia(req.files);

    if (mode === 'create') {
      if (newCount > MAX_PRODUCT_GALLERY_MEDIA) {
        return next(
          new AppError(
            `Total product images and videos cannot exceed ${MAX_PRODUCT_GALLERY_MEDIA} files`,
            400,
          ),
        );
      }
      return next();
    }

    const productModel = require('../models/productModel');
    const existing = await productModel.countProductMedia(req.params.id);
    const total = existing.images + existing.videos + newCount;

    if (total > MAX_PRODUCT_GALLERY_MEDIA) {
      return next(
        new AppError(
          `Total product images and videos cannot exceed ${MAX_PRODUCT_GALLERY_MEDIA} files`,
          400,
        ),
      );
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createUploadMiddleware,
  handleProfileUpload,
  handleCategoryCreateUpload,
  handleCategoryUpdateUpload,
  handleSubcategoryUpdateUpload,
  handleBrandCreateUpload,
  handleBrandUpdateUpload,
  handleBannerCreateUpload,
  handleBannerUpdateUpload,
  handleProductCreateUpload,
  handleProductUpdateUpload,
  requireIconUpload,
  requireBannerImageOnCreate,
  requireProductThumbnailOnCreate,
  validateProductGalleryMediaCount,
};
