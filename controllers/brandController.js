// Brand CRUD handlers with multipart logo upload support.

const brandModel = require('../models/brandModel');
const brandService = require('../services/brandService');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

// ==========================================
// Brand Operations
// ==========================================

/**
 * POST /brands
 * Create a new brand with optional logo upload (admin only).
 */
const createBrand = async (req, res, next) => {
  try {
    const brand = await brandService.createBrand(req.body, req.files, req.user?.id);
    return success(res, 'Brand created successfully', brand, HTTP_STATUS.CREATED);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Brand name already exists', HTTP_STATUS.CONFLICT));
    }
    next(err);
  }
};

/**
 * GET /brands/:id
 * Retrieve a single brand by ID.
 */
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

/**
 * GET /brands
 * List brands with search, pagination, and filters.
 * Use is_popular=true to fetch popular brands only.
 */
const getBrands = async (req, res, next) => {
  try {
    const filters = {
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
      is_popular: req.query.is_popular !== undefined ? req.query.is_popular === 'true' : undefined,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
    };
    const data = await brandModel.findBrands(filters);
    const message =
      filters.is_popular === true
        ? 'Popular brands retrieved successfully'
        : 'Brands list retrieved successfully';
    return success(res, message, data);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /brands/:id
 * Update an existing brand with optional logo upload (admin only).
 */
const updateBrand = async (req, res, next) => {
  try {
    const existing = await brandModel.findBrandById(req.params.id);
    if (!existing) {
      return next(new AppError('Brand not found', HTTP_STATUS.NOT_FOUND));
    }
    const brand = await brandService.updateBrand(req.params.id, req.body, req.files, req.user?.id);
    return success(res, 'Brand updated successfully', brand);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Brand name already exists', HTTP_STATUS.CONFLICT));
    }
    next(err);
  }
};

/**
 * DELETE /brands/:id
 * Soft-delete a brand (admin only).
 */
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
  updateBrand,
  deleteBrand,
};
