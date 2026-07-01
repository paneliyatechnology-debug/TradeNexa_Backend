const brandModel = require('../models/brandModel');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

const createBrand = async (req, res, next) => {
  try {
    const brand = await brandModel.createBrand(req.body, req.user?.id);
    return success(res, 'Brand created successfully', brand, HTTP_STATUS.CREATED);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Brand name already exists', HTTP_STATUS.CONFLICT));
    }
    next(err);
  }
};

const getBrand = async (req, res, next) => {
  try {
    const brand = await brandModel.findBrandById(req.params.id);
    if (!brand) {
      return next(new AppError('Brand not found', HTTP_STATUS.NOT_FOUND));
    }
    return success(res, 'Brand details retrieved successfully', brand);
  } catch (err) {
    next(err);
  }
};

const getBrands = async (req, res, next) => {
  try {
    const filters = {
      q: req.query.q,
      page: req.query.page,
      limit: req.query.limit,
      is_popular: req.query.is_popular !== undefined ? req.query.is_popular === 'true' : undefined,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
    };
    const data = await brandModel.findBrands(filters);
    return success(res, 'Brands list retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

const getPopularBrands = async (req, res, next) => {
  try {
    const filters = {
      page: req.query.page,
      limit: req.query.limit,
      is_popular: true,
      is_active: true,
    };
    const data = await brandModel.findBrands(filters);
    
    // As per B2B Marketplace Buyer Home documentation, GET /brands/popular returns flat structure
    // Let's format the return output to match the specification fields: id, name, logo
    const formatted = data.results.map(b => ({
      id: b.id,
      name: b.name,
      logo: b.logo
    }));
    return success(res, 'Popular brands retrieved successfully', formatted);
  } catch (err) {
    next(err);
  }
};

const updateBrand = async (req, res, next) => {
  try {
    const existing = await brandModel.findBrandById(req.params.id);
    if (!existing) {
      return next(new AppError('Brand not found', HTTP_STATUS.NOT_FOUND));
    }
    const brand = await brandModel.updateBrand(req.params.id, req.body, req.user?.id);
    return success(res, 'Brand updated successfully', brand);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Brand name already exists', HTTP_STATUS.CONFLICT));
    }
    next(err);
  }
};

const deleteBrand = async (req, res, next) => {
  try {
    const existing = await brandModel.findBrandById(req.params.id);
    if (!existing) {
      return next(new AppError('Brand not found', HTTP_STATUS.NOT_FOUND));
    }
    await brandModel.deleteBrand(req.params.id, req.user?.id);
    return success(res, 'Brand deleted successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createBrand,
  getBrand,
  getBrands,
  getPopularBrands,
  updateBrand,
  deleteBrand,
};
