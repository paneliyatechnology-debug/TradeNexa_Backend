const businessTypeModel = require('../models/businessTypeModel');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

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

const getBusinessType = async (req, res, next) => {
  try {
    const type = await businessTypeModel.findById(req.params.id);
    if (!type) return next(new AppError('Business type not found', HTTP_STATUS.NOT_FOUND));
    return success(res, 'Business type retrieved successfully', type);
  } catch (err) {
    next(err);
  }
};

const getBusinessTypes = async (req, res, next) => {
  try {
    const roleId = parseInt(req.query.role_id, 10);
    const types = await businessTypeModel.findByRoleId(
      roleId,
      req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
    );

    return success(res, 'Business types retrieved successfully', types);
  } catch (err) {
    next(err);
  }
};

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

    await businessTypeModel.softDelete(req.params.id);
    return success(res, 'Business type deleted successfully');
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
};
