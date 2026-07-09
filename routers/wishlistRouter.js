/**
 * Wishlist routes — authenticated buyer wishlist management.
 */
const express = require('express');
const wishlistController = require('../controllers/wishlistController');
const { authenticate, validate } = require('../middleware/auth');
const {
  wishlistAddRules,
  wishlistToggleRules,
  wishlistListQuery,
  wishlistProductIdParam,
} = require('../middleware/resourceValidation');

const router = express.Router();

router.use(authenticate);

router.get('/', wishlistListQuery, validate, wishlistController.getWishlist);
router.post('/', wishlistAddRules, validate, wishlistController.addToWishlist);
router.post('/toggle', wishlistToggleRules, validate, wishlistController.toggleWishlist);
router.get('/check/:product_id', wishlistProductIdParam, validate, wishlistController.checkWishlistStatus);
router.delete('/:product_id', wishlistProductIdParam, validate, wishlistController.removeFromWishlist);

module.exports = router;
