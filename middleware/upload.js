/**
 * Pre-configured upload middleware for profile and category modules.
 * Uses the shared upload service — add new module handlers here.
 */
const { AppError } = require('../utils/response');
const { createUploadMiddleware } = require('../services/uploadService');
const { getAbsoluteUploadDir } = require('../utils/media');
const { uploadPaths } = require('../constants/uploadPaths');
const { PROFILE_UPLOAD_FIELDS, CATEGORY_UPLOAD_FIELDS } = require('../constants/uploadFields');

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

module.exports = {
  createUploadMiddleware,
  handleProfileUpload,
  handleCategoryCreateUpload,
  handleCategoryUpdateUpload,
  handleSubcategoryUpdateUpload,
};
