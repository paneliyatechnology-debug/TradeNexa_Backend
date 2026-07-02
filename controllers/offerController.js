const offerModel = require('../models/offerModel');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

// ==========================================
// Offer Operations
// ==========================================

/**
 * POST /offers
 * Create a new promotional offer (admin only).
 */
const createOffer = async (req, res, next) => {
  try {
    const offer = await offerModel.createOffer(req.body, req.user?.id);
    return success(res, 'Offer created successfully', offer, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /offers/:id
 * Retrieve a single offer by ID.
 */
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

/**
 * GET /offers
 * List offers with pagination and formatted summary fields.
 */
const getOffers = async (req, res, next) => {
  try {
    const filters = {
      page: req.query.page,
      limit: req.query.limit,
      include_expired: req.query.include_expired,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
    };
    const data = await offerModel.findOffers(filters);

    // Format output as per spec: id, title, banner, discount, expiry_date
    const formatted = {
      ...data,
      results: data.results.map(o => ({
        id: o.id,
        title: o.title,
        banner: o.banner,
        discount: o.discount,
        expiry_date: o.expiry_date
      }))
    };

    return success(res, 'Offers list retrieved successfully', formatted);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /offers/:id
 * Update an existing offer (admin only).
 */
const updateOffer = async (req, res, next) => {
  try {
    const existing = await offerModel.findOfferById(req.params.id);
    if (!existing) {
      return next(new AppError('Offer not found', HTTP_STATUS.NOT_FOUND));
    }
    const offer = await offerModel.updateOffer(req.params.id, req.body, req.user?.id);
    return success(res, 'Offer updated successfully', offer);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /offers/:id
 * Soft-delete an offer (admin only).
 */
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
