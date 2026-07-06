const offerService = require('../services/offerService');
const offerModel = require('../models/offerModel');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

const createOffer = async (req, res, next) => {
  try {
    const offer = await offerService.createOffer(req.body, req.files, req.user?.id);
    return success(res, 'Offer created successfully', offer, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

const getOffer = async (req, res, next) => {
  try {
    const offer = await offerModel.findOfferById(req.params.id);
    if (!offer) {
      return next(new AppError('Offer not found', HTTP_STATUS.NOT_FOUND));
    }
    return success(res, 'Offer details retrieved successfully', offer);
  } catch (err) {
    next(err);
  }
};

const getOffers = async (req, res, next) => {
  try {
    const filters = {
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
      include_expired: req.query.include_expired,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
    };
    const data = await offerModel.findOffers(filters);

    const formatted = {
      ...data,
      results: data.results.map((o) => ({
        id: o.id,
        title: o.title,
        banner: o.banner,
        discount: o.discount,
        expiry_date: o.expiry_date,
      })),
    };

    return success(res, 'Offers list retrieved successfully', formatted);
  } catch (err) {
    next(err);
  }
};

const updateOffer = async (req, res, next) => {
  try {
    const existing = await offerModel.findOfferById(req.params.id);
    if (!existing) {
      return next(new AppError('Offer not found', HTTP_STATUS.NOT_FOUND));
    }
    const offer = await offerService.updateOffer(req.params.id, req.body, req.files, req.user?.id);
    return success(res, 'Offer updated successfully', offer);
  } catch (err) {
    next(err);
  }
};

const deleteOffer = async (req, res, next) => {
  try {
    const existing = await offerModel.findOfferById(req.params.id);
    if (!existing) {
      return next(new AppError('Offer not found', HTTP_STATUS.NOT_FOUND));
    }
    await offerModel.deleteOffer(req.params.id, req.user?.id);
    return success(res, 'Offer deleted successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createOffer,
  getOffer,
  getOffers,
  updateOffer,
  deleteOffer,
};
