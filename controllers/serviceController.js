const serviceModel = require('../models/serviceModel');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

// ==========================================
// Service Operations
// ==========================================

/**
 * POST /services
 * Create a new platform service (admin only).
 */
const createService = async (req, res, next) => {
  try {
    const service = await serviceModel.createService(req.body, req.user?.id);
    return success(res, 'Service created successfully', service, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /services/:id
 * Retrieve a single service by ID.
 */
const getService = async (req, res, next) => {
  try {
    const service = await serviceModel.findServiceById(req.params.id);
    if (!service) {
      return next(new AppError('Service not found', HTTP_STATUS.NOT_FOUND));
    }
    return success(res, 'Service details retrieved successfully', service);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /services
 * List services with optional search and formatted summary fields.
 */
const getServices = async (req, res, next) => {
  try {
    const filters = {
      q: req.query.q,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
    };
    const services = await serviceModel.findServices(filters);
    
    // Format output as per spec: id, name, icon, description
    const formatted = services.map(s => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      description: s.description
    }));

    return success(res, 'Services list retrieved successfully', formatted);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /services/:id
 * Update an existing service (admin only).
 */
const updateService = async (req, res, next) => {
  try {
    const existing = await serviceModel.findServiceById(req.params.id);
    if (!existing) {
      return next(new AppError('Service not found', HTTP_STATUS.NOT_FOUND));
    }
    const service = await serviceModel.updateService(req.params.id, req.body, req.user?.id);
    return success(res, 'Service updated successfully', service);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /services/:id
 * Soft-delete a service (admin only).
 */
const deleteService = async (req, res, next) => {
  try {
    const existing = await serviceModel.findServiceById(req.params.id);
    if (!existing) {
      return next(new AppError('Service not found', HTTP_STATUS.NOT_FOUND));
    }
    await serviceModel.deleteService(req.params.id, req.user?.id);
    return success(res, 'Service deleted successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createService,
  getService,
  getServices,
  updateService,
  deleteService,
};
