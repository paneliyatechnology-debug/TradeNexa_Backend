/**
 * Seller routes.
 *
 * Public read-only endpoints including verified and nearby seller lookups.
 */
const express = require('express');
const sellerController = require('../controllers/sellerController');
const { optionalAuthenticate, validate } = require('../middleware/auth');
const { idParam, sellerNearbyRules, sellerListQuery } = require('../middleware/resourceValidation');

const router = express.Router();

// ==========================================
// Public read routes (optional auth hides self for sellers)
// ==========================================

router.get('/', optionalAuthenticate, sellerListQuery, validate, sellerController.getSellers);
router.get('/verified', optionalAuthenticate, sellerController.getVerifiedSellers);
router.get('/nearby', optionalAuthenticate, sellerNearbyRules, validate, sellerController.getNearbySellers);
router.get('/:id', idParam, validate, sellerController.getSeller);

module.exports = router;
