const roleModel = require('../models/roleModel');
const { success } = require('../utils/response');

// ==========================================
// Role Operations
// ==========================================

/**
 * GET /roles
 * List all available user roles.
 */
const getRoles = async (req, res, next) => {
  try {
    const filters = {
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
    };
    const data = await roleModel.findRoles(filters);
    return success(res, 'Roles retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getRoles,
};
