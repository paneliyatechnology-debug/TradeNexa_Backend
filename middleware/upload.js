/**
 * Pre-configured upload middleware for all modules that accept file uploads.
 *
 * Pattern: create routes use an inbox folder, then services move files to {resource}/{id}/.
 * Validation guards (require*OnCreate, rejectEmptyFileFields) run after multer.
 */
const { AppError } = require('../utils/response');
const { createUploadMiddleware, createProductFileFilter, createChatFileFilter } = require('../services/uploadService');
const { getAbsoluteUploadDir } = require('../utils/media');
const uploadConfig = require('../config/upload');
const { uploadPaths } = require('../constants/uploadPaths');
const {
  PROFILE_UPLOAD_FIELDS,
  CATEGORY_UPLOAD_FIELDS,
  BRAND_UPLOAD_FIELDS,
  BANNER_UPLOAD_FIELDS,
  OFFER_UPLOAD_FIELDS,
  NEWS_UPLOAD_FIELDS,
  SERVICE_UPLOAD_FIELDS,
  PRODUCT_UPLOAD_FIELDS,
  MAX_PRODUCT_GALLERY_MEDIA,
  CHAT_UPLOAD_FIELDS,
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
// Offer uploads
// ==========================================

/**
 * POST /offers.
 * Files land in inbox first, then move to offers/{id}/ after record creation.
 */
const handleOfferCreateUpload = createUploadMiddleware({
  fields: OFFER_UPLOAD_FIELDS,
  getDestination: (req) => getAbsoluteUploadDir(...uploadPaths.offerInbox(req.user.id)),
});

/** PUT /offers/:id */
const handleOfferUpdateUpload = createUploadMiddleware({
  fields: OFFER_UPLOAD_FIELDS,
  getDestination: (req) => {
    const offerId = req.params.id;
    if (!offerId) throw new AppError('Offer ID is required for banner upload', 400);
    return getAbsoluteUploadDir(...uploadPaths.offer(offerId));
  },
});

// ==========================================
// News uploads
// ==========================================

/**
 * POST /news.
 * Files land in inbox first, then move to news/{id}/ after record creation.
 */
const handleNewsCreateUpload = createUploadMiddleware({
  fields: NEWS_UPLOAD_FIELDS,
  getDestination: (req) => getAbsoluteUploadDir(...uploadPaths.newsInbox(req.user.id)),
});

/** PUT /news/:id */
const handleNewsUpdateUpload = createUploadMiddleware({
  fields: NEWS_UPLOAD_FIELDS,
  getDestination: (req) => {
    const newsId = req.params.id;
    if (!newsId) throw new AppError('News ID is required for thumbnail upload', 400);
    return getAbsoluteUploadDir(...uploadPaths.news(newsId));
  },
});

// ==========================================
// Service uploads
// ==========================================

/**
 * POST /services.
 * Files land in inbox first, then move to services/{id}/ after record creation.
 */
const handleServiceCreateUpload = createUploadMiddleware({
  fields: SERVICE_UPLOAD_FIELDS,
  getDestination: (req) => getAbsoluteUploadDir(...uploadPaths.serviceInbox(req.user.id)),
});

/** PUT /services/:id */
const handleServiceUpdateUpload = createUploadMiddleware({
  fields: SERVICE_UPLOAD_FIELDS,
  getDestination: (req) => {
    const serviceId = req.params.id;
    if (!serviceId) throw new AppError('Service ID is required for icon upload', 400);
    return getAbsoluteUploadDir(...uploadPaths.service(serviceId));
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

// ==========================================
// Upload validation guards
// ==========================================

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

/** Require banner file on offer create. Must run after multer upload middleware. */
const requireOfferBannerOnCreate = (req, _res, next) => {
  if (!req.files?.banner?.[0]) {
    return next(new AppError('Banner is required.', 400));
  }
  next();
};

/** Require logo file on brand create. Must run after multer upload middleware. */
const requireLogoOnCreate = (req, _res, next) => {
  if (!req.files?.logo?.[0]) {
    return next(new AppError('Logo is required.', 400));
  }
  next();
};

/**
 * When a file field key is present in the body but no file was uploaded, reject.
 * Used on update routes for fields that are required on create.
 */
const rejectEmptyFileFields = (fields = []) => (req, _res, next) => {
  for (const { name, label } of fields) {
    if (!Object.prototype.hasOwnProperty.call(req.body, name)) continue;
    const uploaded = req.files?.[name];
    const hasFile = Array.isArray(uploaded) ? uploaded.length > 0 : !!uploaded;
    if (!hasFile) {
      return next(new AppError(`${label} is required.`, 400));
    }
  }
  next();
};

/** Count gallery image + video files in the current multipart request. */
const countUploadedGalleryMedia = (files = {}) =>
  (files.image?.length || 0) + (files.video?.length || 0);

/** Require thumbnail file on product create. Must run after multer upload middleware. */
const requireProductThumbnailOnCreate = (req, _res, next) => {
  if (!req.files?.thumbnail?.[0]) {
    return next(new AppError('Main image is required', 400));
  }
  next();
};

/** Require at least one gallery image on product create. Must run after multer upload middleware. */
const requireProductGalleryImagesOnCreate = (req, _res, next) => {
  const galleryCount = req.files?.image?.length || 0;
  if (galleryCount < 1) {
    return next(new AppError('At least one product image is required', 400));
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

// ==========================================
// Chat uploads
// ==========================================

/** POST /chats/conversations/:id/messages/media — IMAGE or DOCUMENT file upload. */
const handleChatMediaUpload = createUploadMiddleware({
  fields: CHAT_UPLOAD_FIELDS,
  getDestination: (req) => getAbsoluteUploadDir(...uploadPaths.chat(req.params.id)),
  maxFileSize: uploadConfig.maxDocumentFileSize,
  fileFilter: createChatFileFilter(),
});

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
  handleOfferCreateUpload,
  handleOfferUpdateUpload,
  handleNewsCreateUpload,
  handleNewsUpdateUpload,
  handleServiceCreateUpload,
  handleServiceUpdateUpload,
  handleProductCreateUpload,
  handleProductUpdateUpload,
  requireIconUpload,
  requireBannerImageOnCreate,
  requireOfferBannerOnCreate,
  requireLogoOnCreate,
  rejectEmptyFileFields,
  requireProductThumbnailOnCreate,
  requireProductGalleryImagesOnCreate,
  validateProductGalleryMediaCount,
  handleChatMediaUpload,
};
