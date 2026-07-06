/**
 * Offer routes.
 *
 * Public read endpoints with pagination and admin-only write operations.
 * Create/update use multipart form-data; banner is an optional single file.
 */
const express = require('express');
const offerController = require('../controllers/offerController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const {
  handleOfferCreateUpload,
  handleOfferUpdateUpload,
} = require('../middleware/upload');
const { idParam, offerCreateRules, offerUpdateRules, offerListQuery } = require('../middleware/resourceValidation');

const router = express.Router();

router.get('/', offerListQuery, validate, offerController.getOffers);
router.get('/:id', idParam, validate, offerController.getOffer);

router.post(
  '/',
  authenticate,
  authorize('admin'),
  handleOfferCreateUpload,
  offerCreateRules,
  validate,
  offerController.createOffer,
);

router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  idParam,
  handleOfferUpdateUpload,
  offerUpdateRules,
  validate,
  offerController.updateOffer,
);
router.delete('/:id', authenticate, authorize('admin'), idParam, validate, offerController.deleteOffer);

module.exports = router;
