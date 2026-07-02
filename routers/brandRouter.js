/**
 * Brand routes.
 *
 * Public read endpoints (including popular brands) and admin-only write operations.
 */
const express = require('express');
const brandController = require('../controllers/brandController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const { idParam, brandCreateRules, brandUpdateRules, paginationQuery } = require('../middleware/resourceValidation');

const router = Router = express.Router();

// ==========================================
// Public read routes
// ==========================================

router.get('/', paginationQuery, validate, brandController.getBrands);
router.get('/popular', brandController.getPopularBrands);
router.get('/:id', idParam, validate, brandController.getBrand);

// ==========================================
// Admin write routes
// ==========================================

router.post('/', authenticate, authorize('admin'), brandCreateRules, validate, brandController.createBrand);
router.put('/:id', authenticate, authorize('admin'), idParam, brandUpdateRules, validate, brandController.updateBrand);
router.delete('/:id', authenticate, authorize('admin'), idParam, validate, brandController.deleteBrand);

module.exports = router;
