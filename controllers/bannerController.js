const bannerModel = require('../models/bannerModel');
const bannerService = require('../services/bannerService');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

// ==========================================
// Banner Operations
// ==========================================

/**
 * POST /banners
 * Create a new banner with required image upload (admin only).
 */
const createBanner = async (req, res, next) => {
  try {
    const banner = await bannerService.createBanner(req.body, req.files, req.user?.id);
    return success(res, 'Banner created successfully', banner, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /banners/:id
 * Retrieve a single banner by ID.
 */
const getBanner = async (req, res, next) => {
  try {
    const banner = await bannerModel.findBannerById(req.params.id);
    if (!banner) {
      return next(new AppError('Banner not found', HTTP_STATUS.NOT_FOUND));
    }
    return success(res, 'Banner details retrieved successfully', banner);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /banners
 * List banners with optional active-status filter.
 */
const getBanners = async (req, res, next) => {
  try {
    const filters = {
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
      redirect_type: req.query.redirect_type,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
    };
    const data = await bannerModel.findBanners(filters);
    return success(res, 'Banners list retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /banners/:id
 * Update an existing banner with optional image upload (admin only).
 */
const updateBanner = async (req, res, next) => {
  try {
    const existing = await bannerModel.findBannerById(req.params.id);
    if (!existing) {
      return next(new AppError('Banner not found', HTTP_STATUS.NOT_FOUND));
    }
    const banner = await bannerService.updateBanner(req.params.id, req.body, req.files, req.user?.id);
    return success(res, 'Banner updated successfully', banner);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /banners/:id
 * Soft-delete a banner (admin only).
 */
const deleteBanner = async (req, res, next) => {
  try {
    const existing = await bannerModel.findBannerById(req.params.id);
    if (!existing) {
      return next(new AppError('Banner not found', HTTP_STATUS.NOT_FOUND));
    }
    await bannerModel.deleteBanner(req.params.id, req.user?.id);
    return success(res, 'Banner deleted successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createBanner,
  getBanner,
  getBanners,
  updateBanner,
  deleteBanner,
};
