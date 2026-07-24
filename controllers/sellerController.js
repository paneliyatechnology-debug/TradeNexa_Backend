const sellerModel = require('../models/sellerModel');
const userModel = require('../models/userModel');
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

module.exports = {
  getSeller,
  getSellers,
  getVerifiedSellers,
  getNearbySellers,
};
