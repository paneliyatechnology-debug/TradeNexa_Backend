const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const { generateAuthTokens } = require('../utils/jwt');
const { hashPassword, comparePassword } = require('../utils/password');
const { AppError } = require('../utils/response');
const { ADMIN_PANEL_ROLE_CODES } = require('../constants');

// ==========================================
// Internal helpers
// ==========================================

/**
 * Ensure the user role is allowed to access the admin panel.
 * @param {string|null} roleCode - Role code from the roles table
 * @throws {AppError} 403 when role is not an admin-panel role
 */
const assertAdminPanelRole = (roleCode) => {
  if (!roleCode || !ADMIN_PANEL_ROLE_CODES.includes(roleCode)) {
    throw new AppError('Access denied. Admin panel login is restricted to authorized roles', 403);
  }
};

// ==========================================
// Admin authentication
// ==========================================

/**
 * Authenticate an admin panel user with email and password.
 * Issues JWT tokens and records login activity on success.
 *
 * @param {string} email - Admin email address
 * @param {string} password - Plain-text password (verified via bcrypt)
 * @param {Object} req - Express request (used for IP and user-agent logging)
 * @returns {Promise<{ user: Object, access_token: string, refresh_token: string }>}
 */
const login = async (email, password, req) => {
  const user = await userModel.findUserWithRoleByEmail(email);

  if (!user?.password || !user.is_active) {
    throw new AppError('Invalid email or password', 401);
  }

  const passwordValid = await comparePassword(password, user.password);
  if (!passwordValid) {
    throw new AppError('Invalid email or password', 401);
  }

  assertAdminPanelRole(user.role_code);

  const tokens = generateAuthTokens(user);
  const decoded = jwt.decode(tokens.refreshToken);

  await userModel.saveRefreshToken(user.id, tokens.refreshToken, new Date(decoded.exp * 1000));
  await userModel.updateUser(user.id, { last_login: userModel.db.fn.now() });
  await userModel.createLoginLog({
    user_id: user.id,
    ip_address: req.ip,
    device_info: req.headers['user-agent'],
    login_at: new Date(),
  });

  const freshUser = await userModel.findUserWithRoleById(user.id);

  return {
    user: userModel.formatAdminUser(freshUser),
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  };
};

/**
 * Create a new admin panel user in the users table.
 * Password is hashed before storage; mobile_number is not required for admins.
 *
 * @param {Object} data - { full_name, email, password, role_id }
 * @param {number|null} [createdBy] - ID of the admin creating this user
 * @returns {Promise<Object>} Sanitized admin user (password excluded)
 */
const createAdminUser = async (data, createdBy = null) => {
  if (await userModel.findUserByEmail(data.email)) {
    throw new AppError('Email already in use', 409);
  }

  const role = await userModel.db('roles').where({ id: data.role_id, is_active: true }).first();
  if (!role || !ADMIN_PANEL_ROLE_CODES.includes(role.code)) {
    throw new AppError('role_id must reference a valid admin panel role', 400);
  }

  const passwordHash = await hashPassword(data.password);

  const user = await userModel.createUser({
    uuid: userModel.uuidv4(),
    mobile_number: null,
    email: data.email,
    full_name: data.full_name,
    password: passwordHash,
    role_id: role.id,
    is_verified: true,
    is_active: true,
    is_completed_profile: true,
    created_by: createdBy,
  });

  const created = await userModel.findUserWithRoleById(user.id);
  return userModel.formatAdminUser(created);
};

module.exports = {
  login,
  createAdminUser,
};
