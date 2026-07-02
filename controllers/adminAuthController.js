// Admin panel authentication and user provisioning handlers.

const adminAuthService = require('../services/adminAuthService');
const { success } = require('../utils/response');
const { MESSAGES, HTTP_STATUS } = require('../constants');

// ==========================================
// Admin Authentication
// ==========================================

/**
 * POST /admin/auth/login
 * Authenticate an admin panel user with email and password.
 */
const login = async (req, res, next) => {
  try {
    const data = await adminAuthService.login(req.body.email, req.body.password, req);
    return success(res, MESSAGES.ADMIN_LOGIN_SUCCESS, data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /admin/auth/users
 * Create a new admin panel user (super_admin or admin only).
 */
const createAdminUser = async (req, res, next) => {
  try {
    const data = await adminAuthService.createAdminUser(req.body, req.user?.id);
    return success(res, MESSAGES.ADMIN_USER_CREATED, data, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  login,
  createAdminUser,
};
