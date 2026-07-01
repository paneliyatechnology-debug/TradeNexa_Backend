const express = require('express');
const categoryController = require('../controllers/categoryController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const {
  idParam,
  categoryIdParam,
  categoryCreateRules,
  categoryUpdateRules,
  subcategoryCreateRules,
  subcategoryUpdateRules,
  paginationQuery,
} = require('../middleware/resourceValidation');

const router = express.Router();

router.get('/', paginationQuery, validate, categoryController.getCategories);
router.get('/:categoryId/subcategories', categoryIdParam, paginationQuery, validate, categoryController.getSubcategories);
router.get('/:categoryId/subcategories/:id', categoryIdParam, idParam, validate, categoryController.getSubcategory);
router.get('/:id', idParam, validate, categoryController.getCategory);

router.post('/', authenticate, authorize('admin'), categoryCreateRules, validate, categoryController.createCategory);
router.post(
  '/:categoryId/subcategories',
  authenticate,
  authorize('admin'),
  categoryIdParam,
  subcategoryCreateRules,
  validate,
  categoryController.createSubcategory,
);

router.put('/:id', authenticate, authorize('admin'), idParam, categoryUpdateRules, validate, categoryController.updateCategory);
router.put(
  '/:categoryId/subcategories/:id',
  authenticate,
  authorize('admin'),
  categoryIdParam,
  idParam,
  subcategoryUpdateRules,
  validate,
  categoryController.updateSubcategory,
);

router.delete('/:id', authenticate, authorize('admin'), idParam, validate, categoryController.deleteCategory);
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
