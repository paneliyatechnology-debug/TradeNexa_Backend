/**
 * Admin panel authentication routes.
 *
 * Email/password login and admin user creation for admin, super_admin, and supporter roles.
 */
const express = require('express');
const adminAuthController = require('../controllers/adminAuthController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const { adminLoginRules, adminCreateUserRules } = require('../middleware/adminValidation');
const { adminLoginLimiter } = require('../middleware/rateLimiter');
const { ROLE_CODES } = require('../constants');

const router = express.Router();

// ==========================================
// Public routes
// ==========================================

/** POST /admin/auth/login */
router.post('/login', adminLoginLimiter, adminLoginRules, validate, adminAuthController.login);

// ==========================================
// Protected routes (admin / super_admin)
// ==========================================

/** POST /admin/auth/users */
router.post(
  '/users',
  authenticate,
  authorize(ROLE_CODES.SUPER_ADMIN, ROLE_CODES.ADMIN),
  adminCreateUserRules,
  validate,
  adminAuthController.createAdminUser,
);

module.exports = router;
