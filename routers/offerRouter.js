/**
 * Offer routes.
 *
 * Public read endpoints with pagination and admin-only write operations.
 * Create/update use multipart form-data for the banner file field.
 */
const express = require('express');
const offerController = require('../controllers/offerController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const {
  handleOfferCreateUpload,
  handleOfferUpdateUpload,
  requireOfferBannerOnCreate,
  rejectEmptyFileFields,
} = require('../middleware/upload');
const { idParam, offerCreateRules, offerUpdateRules, paginationQuery } = require('../middleware/resourceValidation');

const router = express.Router();

router.get('/', paginationQuery, validate, offerController.getOffers);
router.get('/:id', idParam, validate, offerController.getOffer);

router.post(
  '/',
  authenticate,
  authorize('admin'),
  handleOfferCreateUpload,
  requireOfferBannerOnCreate,
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
  rejectEmptyFileFields([{ name: 'banner', label: 'Banner' }]),
  offerUpdateRules,
  validate,
  offerController.updateOffer,
);
router.delete('/:id', authenticate, authorize('admin'), idParam, validate, offerController.deleteOffer);

module.exports = router;
