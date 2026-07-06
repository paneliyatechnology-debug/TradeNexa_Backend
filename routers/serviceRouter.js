/**
 * Service routes.
 *
 * Public read endpoints and admin-only write operations.
 * Create/update support multipart icon uploads.
 */
const express = require('express');
const serviceController = require('../controllers/serviceController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const { handleServiceCreateUpload, handleServiceUpdateUpload } = require('../middleware/upload');
const { idParam, serviceCreateRules, serviceUpdateRules } = require('../middleware/resourceValidation');

const router = express.Router();

router.get('/', serviceController.getServices);
router.get('/:id', idParam, validate, serviceController.getService);

router.post(
  '/',
  authenticate,
  authorize('admin'),
  handleServiceCreateUpload,
  serviceCreateRules,
  validate,
  serviceController.createService,
);

router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  idParam,
  handleServiceUpdateUpload,
  serviceUpdateRules,
  validate,
  serviceController.updateService,
);

router.delete('/:id', authenticate, authorize('admin'), idParam, validate, serviceController.deleteService);

module.exports = router;
