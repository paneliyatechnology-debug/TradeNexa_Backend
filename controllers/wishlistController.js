const wishlistService = require('../services/wishlistService');
const { success } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

// ==========================================
// Wishlist operations
// ==========================================

/**
 * POST /wishlist
 * Add a product to the authenticated user's wishlist.
 */
const addToWishlist = async (req, res, next) => {
  try {
    const productId = parseInt(req.body.product_id, 10);
    const result = await wishlistService.addProduct(req.user.id, productId);

    if (result.alreadyExists) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        message: 'Product already exists in wishlist.',
      });
    }

    return success(res, 'Product added to wishlist successfully.');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /wishlist/:product_id
 * Remove a product from the authenticated user's wishlist.
 */
const removeFromWishlist = async (req, res, next) => {
  try {
    const productId = parseInt(req.params.product_id, 10);
    await wishlistService.removeProduct(req.user.id, productId);
    return success(res, 'Product removed from wishlist successfully.');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /wishlist
 * Paginated wishlist products for the authenticated user.
 */
const getWishlist = async (req, res, next) => {
  try {
    const data = await wishlistService.getWishlist(req.user.id, {
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
    });
    return success(res, 'Wishlist fetched successfully.', data);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /wishlist/check/:product_id
 * Check whether a product is in the user's wishlist.
 */
const checkWishlistStatus = async (req, res, next) => {
  try {
    const productId = parseInt(req.params.product_id, 10);
    const data = await wishlistService.checkStatus(req.user.id, productId);
    return success(res, 'Wishlist status retrieved successfully.', data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /wishlist/toggle
 * Add or remove a product from the wishlist in one request.
 */
const toggleWishlist = async (req, res, next) => {
  try {
    const productId = parseInt(req.body.product_id, 10);
    const data = await wishlistService.toggleProduct(req.user.id, productId);
    return success(res, 'Wishlist updated successfully.', data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  checkWishlistStatus,
  toggleWishlist,
};
