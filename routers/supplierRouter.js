/**
 * Supplier routes.
 *
 * Public read-only endpoints including verified and nearby supplier lookups.
 */
const express = require('express');
const supplierController = require('../controllers/supplierController');
const { validate } = require('../middleware/auth');
const { idParam, supplierNearbyRules, paginationQuery } = require('../middleware/resourceValidation');

const router = express.Router();

// ==========================================
// Public read routes
// ==========================================

router.get('/', paginationQuery, validate, supplierController.getSuppliers);
router.get('/verified', supplierController.getVerifiedSuppliers);
router.get('/nearby', supplierNearbyRules, validate, supplierController.getNearbySuppliers);
router.get('/:id', idParam, validate, supplierController.getSupplier);

module.exports = router;
