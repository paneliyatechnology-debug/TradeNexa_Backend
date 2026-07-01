const express = require('express');
const supplierController = require('../controllers/supplierController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const { idParam, supplierCreateRules, supplierUpdateRules, supplierNearbyRules, paginationQuery } = require('../middleware/resourceValidation');

const router = express.Router();

router.get('/', paginationQuery, validate, supplierController.getSuppliers);
router.get('/verified', supplierController.getVerifiedSuppliers);
router.get('/nearby', supplierNearbyRules, validate, supplierController.getNearbySuppliers);
router.get('/:id', idParam, validate, supplierController.getSupplier);

module.exports = router;
