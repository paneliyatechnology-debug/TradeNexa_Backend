const sellerModel = require('../models/sellerModel');
const productModel = require('../models/productModel');
const userModel = require('../models/userModel');
const wishlistService = require('../services/wishlistService');
const inquiryModel = require('../models/inquiryModel');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

const SELLER_ROLES = new Set(['seller', 'buyer_seller']);

/**
 * When the caller is an authenticated seller, exclude their own row from list APIs.
 */
const resolveExcludeSellerId = async (req) => {
  if (!req.user?.id) return undefined;
  const roles = await userModel.getUserRoles(req.user.id);
  const roleCode = roles?.[0]?.code;
  if (!SELLER_ROLES.has(roleCode)) return undefined;
  return req.user.id;
};

/** Merge is_wishlist filter when query param is present (requires authenticated user). */
const withWishlistFilter = (req, filters) => {
  if (req.query.is_wishlist === undefined) return filters;

  if (!req.user?.id) {
    throw new AppError(
      'Authentication required to filter by is_wishlist',
      HTTP_STATUS.UNAUTHORIZED,
    );
  }

  return {
    ...filters,
    is_wishlist: req.query.is_wishlist === 'true',
    user_id: req.user.id,
  };
};

/**
 * Attach token-user inquiry flags on product list cards:
 * `is_inquiry_sent` + `conversation_id` (null when no inquiry).
 */
const attachInquiryStateToProductList = async (data, userId) => {
  if (!data?.results?.length) {
    return data?.results
      ? {
          ...data,
          results: data.results.map((product) => ({
            ...product,
            is_inquiry_sent: false,
            conversation_id: null,
          })),
        }
      : data;
  }

  if (!userId) {
    return {
      ...data,
      results: data.results.map((product) => ({
        ...product,
        is_inquiry_sent: false,
        conversation_id: null,
      })),
    };
  }

  const stateMap = await inquiryModel.mapInquiryStateByProducts(
    userId,
    data.results.map((p) => p.id).filter(Boolean),
  );

  return {
    ...data,
    results: data.results.map((product) => {
      const state = stateMap.get(Number(product.id));
      return {
        ...product,
        is_inquiry_sent: !!state?.is_inquiry_sent,
        conversation_id: state?.conversation_id ?? null,
      };
    }),
  };
};

// ==========================================
// Seller Queries
// ==========================================

/**
 * GET /sellers/:id
 * Retrieve a single seller profile by ID.
 * Increments profile_views_count unless the viewer is the seller themselves.
 */
const getSeller = async (req, res, next) => {
  try {
    const sellerId = parseInt(req.params.id, 10);
    const seller = await sellerModel.findSellerById(sellerId);
    if (!seller) {
      return next(new AppError('Seller not found', HTTP_STATUS.NOT_FOUND));
    }

    const viewerId = req.user?.id ? Number(req.user.id) : null;
    if (!viewerId || viewerId !== sellerId) {
      const updatedCount = await sellerModel.incrementProfileViews(sellerId, viewerId);
      if (updatedCount > 0) {
        seller.profile_views_count = updatedCount;
      }
    }

    return success(res, 'Seller details retrieved successfully', seller);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /sellers
 * List sellers with search, filters, and pagination.
 * Optional Bearer: authenticated sellers do not see themselves in the list.
 */
const getSellers = async (req, res, next) => {
  try {
    const filters = {
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
      is_verified: req.query.is_verified !== undefined ? req.query.is_verified === 'true' : undefined,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      exclude_seller_id: await resolveExcludeSellerId(req),
    };
    const data = await sellerModel.findSellers(filters);
    return success(res, 'Sellers list retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /sellers/verified
 * List verified sellers formatted for buyer home display.
 * Optional Bearer: authenticated sellers do not see themselves in the list.
 */
const getVerifiedSellers = async (req, res, next) => {
  try {
    const filters = {
      page: req.query.page,
      limit: req.query.limit,
      is_verified: true,
      is_active: true,
      exclude_seller_id: await resolveExcludeSellerId(req),
    };
    const data = await sellerModel.findSellers(filters);

    // Format for buyer home: keep card fields lean (includes industry + product_count)
    const formatted = data.results.map((s) => ({
      id: s.id,
      company_name: s.company_name,
      industry: s.industry || null,
      logo: s.logo,
      verified: s.verified,
      rating: s.rating,
      response_rate: s.response_rate,
      years_in_business: s.years_in_business,
      product_count: s.product_count ?? 0,
      city: s.city,
      state: s.state,
    }));

    return success(res, 'Verified sellers retrieved successfully', formatted);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /sellers/nearby
 * List sellers near the given coordinates formatted for buyer home display.
 * Optional Bearer: authenticated sellers do not see themselves in the list.
 */
const getNearbySellers = async (req, res, next) => {
  try {
    const { latitude, longitude, max_distance, page, limit } = req.query;
    const filters = {
      page,
      limit,
      exclude_seller_id: await resolveExcludeSellerId(req),
    };
    const maxDist = max_distance ? parseFloat(max_distance) : 50;

    const data = await sellerModel.findNearbySellers(latitude, longitude, maxDist, filters);

    // Format for buyer home nearby cards (includes industry + product_count)
    const formatted = data.results.map((s) => ({
      id: s.id,
      company_name: s.company_name,
      industry: s.industry || null,
      distance: s.distance,
      city: s.city,
      state: s.state,
      rating: s.rating,
      product_count: s.product_count ?? 0,
    }));

    return success(res, 'Nearby sellers retrieved successfully', formatted);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /sellers/:id/products
 * Public catalog of a seller's approved + active products.
 * Supports the same filters, sort, and pagination as GET /products
 * (seller is taken from the path — not from ?seller_id).
 */
const getSellerProducts = async (req, res, next) => {
  try {
    const sellerId = parseInt(req.params.id, 10);
    const seller = await sellerModel.findSellerById(sellerId);
    if (!seller) {
      return next(new AppError('Seller not found', HTTP_STATUS.NOT_FOUND));
    }

    const filters = withWishlistFilter(req, {
      seller_id: sellerId,
      search: req.query.search,
      category_id: req.query.category_id,
      subcategory_id: req.query.subcategory_id,
      city_id: req.query.city_id,
      brand_id: req.query.brand_id,
      min_price: req.query.min_price,
      max_price: req.query.max_price,
      page: req.query.page,
      limit: req.query.limit,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      public_only: true,
      is_active:
        req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
      is_trending:
        req.query.is_trending !== undefined ? req.query.is_trending === 'true' : undefined,
    });

    const data = await productModel.findProducts(filters);
    const withWishlist = await wishlistService.attachWishlistToProductList(data, req.user?.id);
    const withInquiry = await attachInquiryStateToProductList(withWishlist, req.user?.id);

    return success(res, 'Seller products retrieved successfully', withInquiry);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSeller,
  getSellers,
  getVerifiedSellers,
  getNearbySellers,
  getSellerProducts,
};
