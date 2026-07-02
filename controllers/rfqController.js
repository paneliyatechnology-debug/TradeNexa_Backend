const rfqModel = require('../models/rfqModel');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

// ==========================================
// RFQ Operations
// ==========================================

/**
 * POST /rfqs
 * Create a new request for quotation (buyer or admin).
 */
const createRfq = async (req, res, next) => {
  try {
    const rfq = await rfqModel.createRfq(req.body, req.user.id);
    return success(res, 'RFQ created successfully', rfq, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /rfqs/:id
 * Retrieve a single RFQ by ID.
 */
const getRfq = async (req, res, next) => {
  try {
    const rfq = await rfqModel.findRfqById(req.params.id);
    if (!rfq) {
      return next(new AppError('RFQ not found', HTTP_STATUS.NOT_FOUND));
    }
    return success(res, 'RFQ details retrieved successfully', rfq);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /rfqs
 * List RFQs with search, filters, and pagination.
 */
const getRfqs = async (req, res, next) => {
  try {
    const filters = {
      q: req.query.q,
      category_id: req.query.category_id,
      city_id: req.query.city_id,
      user_id: req.query.user_id,
      page: req.query.page,
      limit: req.query.limit,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
    };
    const data = await rfqModel.findRfqs(filters);
    return success(res, 'RFQs list retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /rfqs/latest
 * List the most recent RFQs formatted for buyer home display.
 */
const getLatestRfqs = async (req, res, next) => {
  try {
    const filters = {
      is_active: true,
      page: req.query.page,
      limit: req.query.limit,
    };
    const data = await rfqModel.findRfqs(filters);

    // Format output as per spec: id, title, category, city, created_at
    const formatted = data.results.map(r => ({
      id: r.id,
      title: r.title,
      category: r.category,
      city: r.city,
      created_at: r.created_at
    }));

    return success(res, 'Latest RFQs retrieved successfully', formatted);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /rfqs/:id
 * Update an RFQ (creator or admin only).
 */
const updateRfq = async (req, res, next) => {
  try {
    const existing = await rfqModel.findRfqById(req.params.id);
    if (!existing) {
      return next(new AppError('RFQ not found', HTTP_STATUS.NOT_FOUND));
    }
    
    // Authorization: User must be creator of the RFQ or an Admin
    const userRoles = req.user.role ? [req.user.role] : [];
    if (existing.user_id !== req.user.id && !userRoles.includes('admin')) {
      return next(new AppError('Forbidden: Access denied', HTTP_STATUS.FORBIDDEN));
    }

    const rfq = await rfqModel.updateRfq(req.params.id, req.body, req.user.id);
    return success(res, 'RFQ updated successfully', rfq);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /rfqs/:id
 * Soft-delete an RFQ (creator or admin only).
 */
const deleteRfq = async (req, res, next) => {
  try {
    const existing = await rfqModel.findRfqById(req.params.id);
    if (!existing) {
      return next(new AppError('RFQ not found', HTTP_STATUS.NOT_FOUND));
    }

    // Authorization: User must be creator of the RFQ or an Admin
    const userRoles = req.user.role ? [req.user.role] : [];
    if (existing.user_id !== req.user.id && !userRoles.includes('admin')) {
      return next(new AppError('Forbidden: Access denied', HTTP_STATUS.FORBIDDEN));
    }

    await rfqModel.deleteRfq(req.params.id, req.user.id);
    return success(res, 'RFQ deleted successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createRfq,
  getRfq,
  getRfqs,
  getLatestRfqs,
  updateRfq,
  deleteRfq,
};
