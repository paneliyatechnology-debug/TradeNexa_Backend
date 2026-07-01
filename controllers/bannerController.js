const bannerModel = require('../models/bannerModel');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

const createBanner = async (req, res, next) => {
  try {
    const banner = await bannerModel.createBanner(req.body, req.user?.id);
    return success(res, 'Banner created successfully', banner, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

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

const getBanners = async (req, res, next) => {
  try {
    const filters = {
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
    };
    const banners = await bannerModel.findBanners(filters);
    return success(res, 'Banners list retrieved successfully', banners);
  } catch (err) {
    next(err);
  }
};

const updateBanner = async (req, res, next) => {
  try {
    const existing = await bannerModel.findBannerById(req.params.id);
    if (!existing) {
      return next(new AppError('Banner not found', HTTP_STATUS.NOT_FOUND));
    }
    const banner = await bannerModel.updateBanner(req.params.id, req.body, req.user?.id);
    return success(res, 'Banner updated successfully', banner);
  } catch (err) {
    next(err);
  }
};

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
