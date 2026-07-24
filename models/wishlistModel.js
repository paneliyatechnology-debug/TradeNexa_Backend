/**
 * Wishlist data access — buyer product saves.
 */
const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { resolveMediaUrl } = require('../utils/media');
const { applyListSort } = require('../utils/listQuery');
const { formatRow } = require('./productModel');

const WISHLIST_SORT_FIELDS = {
  wishlisted_at: 'wishlist.created_at',
  id: 'products.id',
  name: 'products.name',
  price: 'products.price',
  rating: 'products.rating',
  created_at: 'products.created_at',
};

// ==========================================
// Read helpers
// ==========================================

/**
 * Return a Set of product IDs wishlisted by the user from the given list.
 * @param {number} userId
 * @param {number[]} productIds
 * @returns {Promise<Set<number>>}
 */
const findWishlistedProductIds = async (userId, productIds = []) => {
  if (!userId || !productIds.length) return new Set();

  const ids = [...new Set(productIds.map((id) => parseInt(id, 10)).filter(Boolean))];
  if (!ids.length) return new Set();

  const rows = await db('wishlist')
    .where({ user_id: userId })
    .whereIn('product_id', ids)
    .select('product_id');

  return new Set(rows.map((row) => row.product_id));
};

/**
 * Check if a product is in the user's wishlist.
 * @param {number} userId
 * @param {number} productId
 * @returns {Promise<boolean>}
 */
const isProductWishlisted = async (userId, productId) => {
  if (!userId) return false;

  const row = await db('wishlist')
    .where({ user_id: userId, product_id: productId })
    .first();

  return !!row;
};

/**
 * Find a wishlist row for user + product.
 * @param {number} userId
 * @param {number} productId
 * @returns {Promise<Object|undefined>}
 */
const findWishlistItem = async (userId, productId) =>
  db('wishlist').where({ user_id: userId, product_id: productId }).first();

// ==========================================
// List
// ==========================================

/**
 * Paginated wishlist products for a user.
 * @param {number} userId
 * @param {Object} [filters]
 * @returns {Promise<{ items: Array, pagination: Object }>}
 */
const findUserWishlist = async (userId, filters = {}) => {
  const q = db('wishlist')
    .innerJoin('products', 'wishlist.product_id', '=', 'products.id')
    .leftJoin('users as sellers', 'products.seller_id', '=', 'sellers.id')
    .leftJoin('company_details', 'sellers.id', '=', 'company_details.user_id')
    .leftJoin('categories as subcategories', 'products.subcategory_id', '=', 'subcategories.id')
    .leftJoin('categories', 'products.category_id', '=', 'categories.id')
    .leftJoin('addresses', function () {
      this.on('sellers.id', '=', 'addresses.user_id').andOn('addresses.is_primary', '=', db.raw('?', [true]));
    })
    .leftJoin('cities', 'addresses.city_id', '=', 'cities.id')
    .leftJoin('states', 'addresses.state_id', '=', 'states.id')
    .where('wishlist.user_id', userId)
    .whereNull('products.deleted_at')
    .select(
      'products.id',
      'products.name',
      'products.slug',
      'products.thumbnail',
      'products.price',
      'products.currency',
      'products.moq',
      'products.unit',
      'products.seller_id',
      'products.category_id',
      'products.subcategory_id',
      'company_details.company_name as seller_name',
      'categories.name as category_name',
      'subcategories.name as subcategory_name',
      'sellers.is_verified as verified',
      'products.rating',
      'cities.name as city',
      'states.name as state',
      'products.is_trending',
      'products.is_active',
      'products.created_at',
      'wishlist.created_at as wishlisted_at',
    );

  if (filters.search) {
    q.where('products.name', 'like', `%${filters.search}%`);
  }

  applyListSort(q, filters, WISHLIST_SORT_FIELDS, {
    defaultSortBy: 'wishlisted_at',
    defaultSortOrder: 'desc',
  });

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 20;
  const paginated = await paginate(q, page, limit);

  const items = paginated.results.map((row) => ({
    ...formatRow(row),
    is_wishlist: true,
    wishlisted_at: row.wishlisted_at,
  }));

  return {
    items,
    pagination: {
      page: paginated.pagination.page,
      limit: paginated.pagination.limit,
      total: paginated.pagination.total,
      total_pages: paginated.pagination.totalPages,
    },
  };
};

// ==========================================
// Write
// ==========================================

/**
 * Add a product to the user's wishlist.
 * @param {number} userId
 * @param {number} productId
 * @returns {Promise<void>}
 */
const addToWishlist = async (userId, productId) => {
  await db('wishlist').insert({
    user_id: userId,
    product_id: productId,
  });
};

/**
 * Permanently remove a product from the user's wishlist.
 * @param {number} userId
 * @param {number} productId
 * @returns {Promise<number>} Rows deleted
 */
const removeFromWishlist = async (userId, productId) =>
  db('wishlist').where({ user_id: userId, product_id: productId }).del();

/**
 * Total wishlist items for a user.
 * Joins products and excludes soft-deleted listings so badge counts stay accurate.
 * @param {number} userId
 * @returns {Promise<number>}
 */
const countForUser = async (userId) => {
  const row = await db('wishlist')
    .innerJoin('products', 'wishlist.product_id', '=', 'products.id')
    .where('wishlist.user_id', userId)
    .whereNull('products.deleted_at')
    .count({ total: '*' })
    .first();
  return parseInt(row?.total || 0, 10);
};

module.exports = {
  findWishlistedProductIds,
  isProductWishlisted,
  findWishlistItem,
  findUserWishlist,
  addToWishlist,
  removeFromWishlist,
  countForUser,
};
