const { body } = require('express-validator');
const userModel = require('../models/userModel');
const { ADMIN_PANEL_ROLE_CODES } = require('../constants');
const { PASSWORD_REGEX, PASSWORD_POLICY_MESSAGE } = require('../utils/password');

// ==========================================
// Reusable field validators
// ==========================================

/**
 * Password validator for admin user creation.
 * Enforces the project password policy (length, case, number, special char).
 */
const password = () =>
  body('password')
    .trim()
    .notEmpty()
    .withMessage('Password is required')
    .matches(PASSWORD_REGEX)
    .withMessage(PASSWORD_POLICY_MESSAGE);

// ==========================================
// Route validation rules
// ==========================================

/** POST /admin/auth/login */
const adminLoginRules = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email')
    .normalizeEmail(),
  body('password').trim().notEmpty().withMessage('Password is required'),
];

/** POST /admin/auth/users */
const adminCreateUserRules = [
  body('full_name')
    .trim()
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email')
    .normalizeEmail(),
  password(),
  body('role_id')
    .isInt({ min: 1 })
    .withMessage('role_id is required')
    .custom(async (roleId) => {
      const role = await userModel.db('roles').where({ id: roleId, is_active: true }).first();
      if (!role || !ADMIN_PANEL_ROLE_CODES.includes(role.code)) {
        throw new Error('role_id must reference a valid admin panel role');
      }
      return true;
    }),
];

module.exports = {
  adminLoginRules,
  adminCreateUserRules,
};
