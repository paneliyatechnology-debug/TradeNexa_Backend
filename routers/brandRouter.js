/**
 * Brand routes.
 *
 * Public read endpoints and admin-only write operations.
 * Create/update support multipart logo uploads.
 */
const express = require('express');
const brandController = require('../controllers/brandController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const { handleBrandCreateUpload, handleBrandUpdateUpload } = require('../middleware/upload');
const { idParam, brandCreateRules, brandUpdateRules, brandListQuery } = require('../middleware/resourceValidation');

const router = express.Router();

// ==========================================
// Public read routes
// ==========================================

router.get('/', brandListQuery, validate, brandController.getBrands);
router.get('/:id', idParam, validate, brandController.getBrand);

// ==========================================
// Admin write routes
// ==========================================

router.post(
  '/',
  authenticate,
  authorize('admin'),
  handleBrandCreateUpload,
  brandCreateRules,
  validate,
  brandController.createBrand,
);

router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  idParam,
  handleBrandUpdateUpload,
  brandUpdateRules,
  validate,
  brandController.updateBrand,
);

router.delete('/:id', authenticate, authorize('admin'), idParam, validate, brandController.deleteBrand);

module.exports = router;
