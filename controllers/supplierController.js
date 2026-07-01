const supplierModel = require('../models/supplierModel');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

const getSupplier = async (req, res, next) => {
  try {
    const supplier = await supplierModel.findSupplierById(req.params.id);
    if (!supplier) {
      return next(new AppError('Supplier not found', HTTP_STATUS.NOT_FOUND));
    }
    return success(res, 'Supplier details retrieved successfully', supplier);
  } catch (err) {
    next(err);
  }
};

const getSuppliers = async (req, res, next) => {
  try {
    const filters = {
      q: req.query.q,
      page: req.query.page,
      limit: req.query.limit,
      is_verified: req.query.is_verified !== undefined ? req.query.is_verified === 'true' : undefined,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
    };
    const data = await supplierModel.findSuppliers(filters);
    return success(res, 'Suppliers list retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

const getVerifiedSuppliers = async (req, res, next) => {
  try {
    const filters = {
      page: req.query.page,
      limit: req.query.limit,
      is_verified: true,
      is_active: true,
    };
    const data = await supplierModel.findSuppliers(filters);
    
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

    return success(res, 'Verified suppliers retrieved successfully', formatted);
  } catch (err) {
    next(err);
  }
};

const getNearbySuppliers = async (req, res, next) => {
  try {
    const { latitude, longitude, max_distance, page, limit } = req.query;
    const filters = { page, limit };
    const maxDist = max_distance ? parseFloat(max_distance) : 50;

    const data = await supplierModel.findNearbySuppliers(latitude, longitude, maxDist, filters);
    
    // Format output as per spec: id, company_name, distance, city, state, rating
    const formatted = data.results.map((s) => ({
      id: s.id,
      company_name: s.company_name,
      distance: s.distance,
      city: s.city,
      state: s.state,
      rating: s.rating,
    }));

    return success(res, 'Nearby suppliers retrieved successfully', formatted);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSupplier,
  getSuppliers,
  getVerifiedSuppliers,
  getNearbySuppliers,
};
