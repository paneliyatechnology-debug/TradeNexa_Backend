const businessTypeModel = require('../models/businessTypeModel');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

// ==========================================
// Business Type Operations
// ==========================================

/**
 * POST /business-types
 * Create a new business type for a role (admin only).
 */
const createBusinessType = async (req, res, next) => {
  try {
    const type = await businessTypeModel.create(req.body);
    return success(res, 'Business type created successfully', type, HTTP_STATUS.CREATED);
  } catch (err) {
    if (err.message === 'INVALID_ROLE') {
      return next(new AppError('Invalid role ID', HTTP_STATUS.BAD_REQUEST));
    }
    if (err.message === 'INVALID_ROLE_FOR_BUSINESS_TYPE') {
      return next(
        new AppError(
          'Business type can only be assigned to buyer, seller, or buyer_seller role',
          HTTP_STATUS.BAD_REQUEST,
        ),
      );
    }
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Business type already exists for this role', HTTP_STATUS.CONFLICT));
    }
    next(err);
  }
};

/**
 * GET /business-types/:id
 * Retrieve a single business type by ID.
 */
const getBusinessType = async (req, res, next) => {
  try {
    const type = await businessTypeModel.findById(req.params.id);
    if (!type) return next(new AppError('Business type not found', HTTP_STATUS.NOT_FOUND));
    return success(res, 'Business type retrieved successfully', type);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /business-types
 * List business types filtered by role and active status.
 */
const getBusinessTypes = async (req, res, next) => {
  try {
    const filters = {
      role_id: req.query.role_id ? parseInt(req.query.role_id, 10) : undefined,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
      exact_role: req.query.exact_role === 'true',
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
    };
    const data = await businessTypeModel.findBusinessTypes(filters);

    return success(res, 'Business types retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /business-types/:id
 * Update an existing business type (admin only).
 */
const updateBusinessType = async (req, res, next) => {
  try {
    const existing = await businessTypeModel.findById(req.params.id);
    if (!existing) return next(new AppError('Business type not found', HTTP_STATUS.NOT_FOUND));

    const type = await businessTypeModel.update(req.params.id, req.body);
    return success(res, 'Business type updated successfully', type);
  } catch (err) {
    if (err.message === 'INVALID_ROLE_FOR_BUSINESS_TYPE') {
      return next(
        new AppError(
          'Business type can only be assigned to buyer, seller, or buyer_seller role',
          HTTP_STATUS.BAD_REQUEST,
        ),
      );
    }
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Business type already exists for this role', HTTP_STATUS.CONFLICT));
    }
    next(err);
  }
};

const deleteBusinessType = async (req, res, next) => {
  try {
    const existing = await businessTypeModel.findById(req.params.id);
    if (!existing) return next(new AppError('Business type not found', HTTP_STATUS.NOT_FOUND));

    if (req.query.permanent === 'true' || req.query.hard === 'true') {
      await businessTypeModel.deleteMany([parseInt(req.params.id, 10)]);
    } else {
      await businessTypeModel.softDelete(req.params.id);
    }
    return success(res, 'Business type deleted successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /business-types/bulk-delete or DELETE /business-types/bulk
 * Bulk delete business types or delete all if all: true.
 */
const bulkDeleteBusinessTypes = async (req, res, next) => {
  try {
    const { ids, all } = req.body || {};
    if (all === true || all === 'true') {
      const deletedCount = await businessTypeModel.deleteAll();
      return success(res, 'All business types deleted successfully', { deletedCount });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return next(new AppError('No business type IDs provided', HTTP_STATUS.BAD_REQUEST));
    }

    const numericIds = ids.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id));
    const deletedCount = await businessTypeModel.deleteMany(numericIds);
    return success(res, `${deletedCount} business type(s) deleted successfully`, { deletedCount });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /business-types/all
 * Delete all business types and reset auto-increment.
 */
const deleteAllBusinessTypes = async (req, res, next) => {
  try {
    const deletedCount = await businessTypeModel.deleteAll();
    return success(res, 'All business types deleted successfully', { deletedCount });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createBusinessType,
  getBusinessType,
  getBusinessTypes,
  updateBusinessType,
  deleteBusinessType,
  bulkDeleteBusinessTypes,
  deleteAllBusinessTypes,
};

