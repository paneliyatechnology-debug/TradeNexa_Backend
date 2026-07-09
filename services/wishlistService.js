const db = require('../database/knex');
const wishlistModel = require('../models/wishlistModel');
const productModel = require('../models/productModel');
const { AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

// ==========================================
// Product validation
// ==========================================

/**
 * Ensure product exists, is not deleted, and is active (for add/toggle add path).
 * @param {number} productId
 * @param {{ requireActive?: boolean }} [options]
 */
const assertProductForWishlist = async (productId, { requireActive = true } = {}) => {
  const product = await productModel.findProductById(productId, { raw: true });
  if (!product) {
    throw new AppError('Product not found', HTTP_STATUS.NOT_FOUND);
  }
  if (requireActive && !product.is_active) {
    throw new AppError('Product is not active', HTTP_STATUS.BAD_REQUEST);
  }
  return product;
};

// ==========================================
// Wishlist flags on product payloads
// ==========================================

/**
 * Attach is_wishlist to product objects (list cards or detail).
 * @param {Array<Object>} products
 * @param {number|null|undefined} userId
 * @returns {Promise<Array<Object>>}
 */
const attachWishlistFlags = async (products = [], userId) => {
  if (!products.length) return products;

  if (!userId) {
    return products.map((product) => applyWishlistFlag(product, false));
  }

  const productIds = products.map((p) => p.id).filter(Boolean);
  const wishlistedIds = await wishlistModel.findWishlistedProductIds(userId, productIds);

  return products.map((product) => applyWishlistFlag(product, wishlistedIds.has(product.id)));
};

/**
 * Attach is_wishlist to a paginated product list response ({ results, pagination }).
 * @param {Object} data
 * @param {number|null|undefined} userId
 */
const attachWishlistToProductList = async (data, userId) => {
  if (!data?.results) return data;
  return {
    ...data,
    results: await attachWishlistFlags(data.results, userId),
  };
};

/**
 * Set is_wishlist on a product object (including nested user_actions when present).
 */
const applyWishlistFlag = (product, isWishlist) => {
  if (!product) return product;

  const updated = {
    ...product,
    is_wishlist: !!isWishlist,
  };

  if (product.user_actions) {
    updated.user_actions = {
      ...product.user_actions,
      is_wishlist: !!isWishlist,
      is_favourite: !!isWishlist,
    };
  }

  return updated;
};

/**
 * Attach is_wishlist to a single product detail response.
 */
const attachWishlistToProductDetail = async (product, userId) => {
  if (!product) return product;
  if (!userId) return applyWishlistFlag(product, false);

  const isWishlist = await wishlistModel.isProductWishlisted(userId, product.id);
  return applyWishlistFlag(product, isWishlist);
};

// ==========================================
// Wishlist operations
// ==========================================

const addProduct = async (userId, productId) => {
  await assertProductForWishlist(productId);

  const existing = await wishlistModel.findWishlistItem(userId, productId);
  if (existing) {
    return { alreadyExists: true };
  }

  await wishlistModel.addToWishlist(userId, productId);
  return { alreadyExists: false };
};

const removeProduct = async (userId, productId) => {
  const deleted = await wishlistModel.removeFromWishlist(userId, productId);
  if (!deleted) {
    throw new AppError('Product not found in wishlist', HTTP_STATUS.NOT_FOUND);
  }
};

const getWishlist = async (userId, filters) => wishlistModel.findUserWishlist(userId, filters);

const checkStatus = async (userId, productId) => {
  const is_wishlist = await wishlistModel.isProductWishlisted(userId, productId);
  return { is_wishlist };
};

const toggleProduct = async (userId, productId) => {
  await assertProductForWishlist(productId);

  return db.transaction(async (trx) => {
    const existing = await trx('wishlist')
      .where({ user_id: userId, product_id: productId })
      .forUpdate()
      .first();

    if (existing) {
      await trx('wishlist').where({ id: existing.id }).del();
      return { is_wishlist: false };
    }

    await trx('wishlist').insert({
      user_id: userId,
      product_id: productId,
    });
    return { is_wishlist: true };
  });
};

module.exports = {
  attachWishlistFlags,
  attachWishlistToProductList,
  attachWishlistToProductDetail,
  addProduct,
  removeProduct,
  getWishlist,
  checkStatus,
  toggleProduct,
};
