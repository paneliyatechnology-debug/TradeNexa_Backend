/**
 * Service routes.
 *
 * Public read endpoints and admin-only write operations.
 */
const express = require('express');
const serviceController = require('../controllers/serviceController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const { idParam, serviceCreateRules, serviceUpdateRules } = require('../middleware/resourceValidation');

const router = express.Router();

// ==========================================
// Public read routes
// ==========================================

router.get('/', serviceController.getServices);
router.get('/:id', idParam, validate, serviceController.getService);

// ==========================================
// Admin write routes
// ==========================================

router.post('/', authenticate, authorize('admin'), serviceCreateRules, validate, serviceController.createService);
router.put('/:id', authenticate, authorize('admin'), idParam, serviceUpdateRules, validate, serviceController.updateService);
router.delete('/:id', authenticate, authorize('admin'), idParam, validate, serviceController.deleteService);

module.exports = router;
