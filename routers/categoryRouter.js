/**
 * Category and subcategory routes.
 *
 * Hierarchy: main category (parent_id = null) → subcategory (parent_id set).
 * Create/update support multipart icon and image uploads.
 */
const express = require('express');
const categoryController = require('../controllers/categoryController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const {
  handleCategoryCreateUpload,
  handleCategoryUpdateUpload,
  handleSubcategoryUpdateUpload,
  requireIconUpload,
} = require('../middleware/upload');
const {
  idParam,
  categoryIdParam,
  categoryCreateRules,
  categoryUpdateRules,
  categoryListQuery,
  subcategoryCreateRules,
  subcategoryUpdateRules,
  subcategoryListQuery,
} = require('../middleware/resourceValidation');

const router = express.Router();

// ==========================================
// Public read routes
// ==========================================

router.get('/', categoryListQuery, validate, categoryController.getCategories);
router.get(
  '/:categoryId/subcategories',
  categoryIdParam,
  subcategoryListQuery,
  validate,
  categoryController.getSubcategories,
);
router.get(
  '/:categoryId/subcategories/:id',
  categoryIdParam,
  idParam,
  validate,
  categoryController.getSubcategory,
);
router.get('/:id', idParam, validate, categoryController.getCategory);

// ==========================================
// Admin write routes — main categories
// ==========================================

router.post(
  '/',
  authenticate,
  authorize('admin'),
  handleCategoryCreateUpload,
  requireIconUpload,
  categoryCreateRules,
  validate,
  categoryController.createCategory,
);

router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  idParam,
  handleCategoryUpdateUpload,
  categoryUpdateRules,
  validate,
  categoryController.updateCategory,
);

router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  idParam,
  validate,
  categoryController.deleteCategory,
);

// ==========================================
// Admin write routes — subcategories
// ==========================================

router.post(
  '/:categoryId/subcategories',
  authenticate,
  authorize('admin'),
  categoryIdParam,
  handleCategoryCreateUpload,
  requireIconUpload,
  subcategoryCreateRules,
  validate,
  categoryController.createSubcategory,
);

router.put(
  '/:categoryId/subcategories/:id',
  authenticate,
  authorize('admin'),
  categoryIdParam,
  idParam,
  handleSubcategoryUpdateUpload,
  subcategoryUpdateRules,
  validate,
  categoryController.updateSubcategory,
);

router.delete(
  '/:categoryId/subcategories/:id',
  authenticate,
  authorize('admin'),
  categoryIdParam,
  idParam,
  validate,
  categoryController.deleteSubcategory,
);

module.exports = router;
