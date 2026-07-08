const sellerModel = require('../models/sellerModel');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

// ==========================================
// Seller Queries
// ==========================================

/**
 * GET /sellers/:id
 * Retrieve a single seller profile by ID.
 */
const getSeller = async (req, res, next) => {
  try {
    const seller = await sellerModel.findSellerById(req.params.id);
    if (!seller) {
      return next(new AppError('Seller not found', HTTP_STATUS.NOT_FOUND));
    }
    return success(res, 'Seller details retrieved successfully', seller);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /sellers
 * List sellers with search, filters, and pagination.
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
 */
const getVerifiedSellers = async (req, res, next) => {
  try {
    const filters = {
      page: req.query.page,
      limit: req.query.limit,
      is_verified: true,
      is_active: true,
    };
    const data = await sellerModel.findSellers(filters);
    
    // Format output as per spec: id, company_name, logo, verified, rating, response_rate, years_in_business, city, state
    const formatted = data.results.map((s) => ({
      id: s.id,
      company_name: s.company_name,
      logo: s.logo,
      verified: s.verified,
      rating: s.rating,
      response_rate: s.response_rate,
      years_in_business: s.years_in_business,
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
 */
const getNearbySellers = async (req, res, next) => {
  try {
    const { latitude, longitude, max_distance, page, limit } = req.query;
    const filters = { page, limit };
    const maxDist = max_distance ? parseFloat(max_distance) : 50;

    const data = await sellerModel.findNearbySellers(latitude, longitude, maxDist, filters);
    
    // Format output as per spec: id, company_name, distance, city, state, rating
    const formatted = data.results.map((s) => ({
      id: s.id,
      company_name: s.company_name,
      distance: s.distance,
      city: s.city,
      state: s.state,
      rating: s.rating,
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
