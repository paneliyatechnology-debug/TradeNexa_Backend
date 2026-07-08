/**
 * Seller routes.
 *
 * Public read-only endpoints including verified and nearby seller lookups.
 */
const express = require('express');
const sellerController = require('../controllers/sellerController');
const { validate } = require('../middleware/auth');
const { idParam, sellerNearbyRules, sellerListQuery } = require('../middleware/resourceValidation');

const router = express.Router();

// ==========================================
// Public read routes
// ==========================================

router.get('/', sellerListQuery, validate, sellerController.getSellers);
router.get('/verified', sellerController.getVerifiedSellers);
router.get('/nearby', sellerNearbyRules, validate, sellerController.getNearbySellers);
router.get('/:id', idParam, validate, sellerController.getSeller);

module.exports = router;
