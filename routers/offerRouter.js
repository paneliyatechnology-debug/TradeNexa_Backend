/**
 * Offer routes.
 *
 * Public read endpoints with pagination and admin-only write operations.
 */
const express = require('express');
const offerController = require('../controllers/offerController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const { idParam, offerCreateRules, offerUpdateRules, paginationQuery } = require('../middleware/resourceValidation');

const router = express.Router();

// ==========================================
// Public read routes
// ==========================================

router.get('/', paginationQuery, validate, offerController.getOffers);
router.get('/:id', idParam, validate, offerController.getOffer);

// ==========================================
// Admin write routes
// ==========================================

router.post('/', authenticate, authorize('admin'), offerCreateRules, validate, offerController.createOffer);
router.put('/:id', authenticate, authorize('admin'), idParam, offerUpdateRules, validate, offerController.updateOffer);
router.delete('/:id', authenticate, authorize('admin'), idParam, validate, offerController.deleteOffer);

module.exports = router;
