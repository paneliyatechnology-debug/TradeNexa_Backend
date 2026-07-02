/**
 * Business type routes.
 *
 * Public read endpoints filtered by role; admin-only create/update/delete.
 */
const express = require('express');
const businessTypeController = require('../controllers/businessTypeController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const {
  idParam,
  businessTypeCreateRules,
  businessTypeUpdateRules,
  businessTypeListQuery,
} = require('../middleware/resourceValidation');

const router = express.Router();

// ==========================================
// Public read routes
// ==========================================

router.get('/', businessTypeListQuery, validate, businessTypeController.getBusinessTypes);
router.get('/:id', idParam, validate, businessTypeController.getBusinessType);

// ==========================================
// Admin write routes
// ==========================================

router.post(
  '/',
  authenticate,
  authorize('admin'),
  businessTypeCreateRules,
  validate,
  businessTypeController.createBusinessType,
);

router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  idParam,
  businessTypeUpdateRules,
  validate,
  businessTypeController.updateBusinessType,
);

router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  idParam,
  validate,
  businessTypeController.deleteBusinessType,
);

module.exports = router;
