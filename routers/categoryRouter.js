const express = require('express');
const categoryController = require('../controllers/categoryController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const { idParam, categoryCreateRules, categoryUpdateRules, paginationQuery } = require('../middleware/resourceValidation');

const router = express.Router();

router.get('/', paginationQuery, validate, categoryController.getCategories);
router.get('/:id', idParam, validate, categoryController.getCategory);

// Admin-only write/delete endpoints
router.post('/', authenticate, authorize('admin'), categoryCreateRules, validate, categoryController.createCategory);
router.put('/:id', authenticate, authorize('admin'), idParam, categoryUpdateRules, validate, categoryController.updateCategory);
router.delete('/:id', authenticate, authorize('admin'), idParam, validate, categoryController.deleteCategory);

module.exports = router;
