const authService = require('../services/authService');
const translationService = require('../services/translationTestService');
const { success } = require('../utils/response');
const { MESSAGES, HTTP_STATUS } = require('../constants');

/**
 * Extracts language code from query ('lang' or 'language') or headers ('x-language' or 'accept-language').
 */
const extractRequestLanguage = (req) => {
  const queryLang = req.query?.lang || req.query?.language;
  if (queryLang && typeof queryLang === 'string') return queryLang.toLowerCase().trim();
  const headerLang = req.headers?.['x-language'] || req.headers?.['accept-language'];
  if (headerLang && typeof headerLang === 'string') {
    const firstCode = headerLang.split(',')[0].split('-')[0].trim().toLowerCase();
    if (firstCode && firstCode !== '*' && translationService.SUPPORTED_LANGUAGES[firstCode]) {
      return firstCode;
    }
  }
  return 'en';
};

// ==========================================
// OTP Authentication
// ==========================================

/**
 * POST /auth/send-otp
 * Send OTP verification code to the user's mobile number.
 */
const sendOtp = async (req, res, next) => {
  try {
    // console.log('sendOtp controller entered');
    const data = await authService.sendOtp(req.body.mobile_number, req.body.recaptcha_token);
    // console.log('sendOtp controller exited');
    return success(res, MESSAGES.OTP_SENT, data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/verify-otp
 * Verify OTP and return authentication tokens.
 */
const verifyOtp = async (req, res, next) => {
  try {
    const data = await authService.verifyOtp(
      req.body.mobile_number,
      req.body.otp,
      req.body.firebase_verification_id,
      req,
    );
    return success(res, MESSAGES.OTP_VERIFIED, data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/resend-otp
 * Resend OTP to the user's mobile number.
 */
const resendOtp = async (req, res, next) => {
  try {
    const data = await authService.resendOtp(
      req.body.mobile_number,
      req.body.firebase_verification_id,
      req.body.recaptcha_token,
    );
    return success(res, MESSAGES.OTP_RESENT, data);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// Registration & Session
// ==========================================

/**
 * POST /auth/register
 * Register a new user account after OTP verification.
 */
const register = async (req, res, next) => {
  try {
    const data = await authService.register(req.body, req);
    return success(res, MESSAGES.REGISTER_SUCCESS, data, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/refresh-token
 * Exchange a refresh token for a new access token.
 */
const refreshToken = async (req, res, next) => {
  try {
    const data = await authService.refreshToken(req.body.refresh_token);
    return success(res, MESSAGES.TOKEN_REFRESHED, data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/logout
 * Invalidate the user's refresh token and end the session.
 */
const logout = async (req, res, next) => {
  try {
    const deviceToken = req.body.device_token || req.body.device?.device_token || null;
    const deviceType = req.body.device_type || req.body.device?.device_type || null;
    await authService.logout(req.user.id, req.body.refresh_token, {
      deviceToken,
      deviceType,
    });
    return success(res, MESSAGES.LOGOUT_SUCCESS);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// Profile
// ==========================================

/**
 * GET /auth/profile
 * Authenticated user profile plus badge `counts`
 * (wishlist, notifications_unread, chat_unread, inquiries, rfqs).
 */
const getProfile = async (req, res, next) => {
  try {
    const lang = extractRequestLanguage(req);
    const data = await authService.getProfile(req.user.id);
    const finalData = await translationService.translateUserProfile(data, lang);
    return success(res, MESSAGES.SUCCESS, finalData);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /auth/profile
 * Update the authenticated user's profile and optional uploads.
 */
const updateProfile = async (req, res, next) => {
  try {
    const data = await authService.updateProfile(req.user.id, req.body, req.files);
    return success(res, MESSAGES.PROFILE_UPDATED, data);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /auth/profile
 * Soft-delete the authenticated user's account.
 */
const deleteProfile = async (req, res, next) => {
  try {
    await authService.deleteProfile(req.user.id);
    return success(res, MESSAGES.ACCOUNT_DELETED);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /auth/devices
 * Get all active login devices for the authenticated user.
 */
const getActiveDevices = async (req, res, next) => {
  try {
    const lang = extractRequestLanguage(req);
    const data = await authService.getActiveDevices(req.user.id, req);
    const finalData = await translationService.translateDeviceList(data, lang);
    return success(res, 'Active devices retrieved successfully', finalData);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /auth/devices/:id
 * Revoke/log out a specific device session.
 */
const logoutDevice = async (req, res, next) => {
  try {
    await authService.logoutDevice(req.user.id, req.params.id);
    return success(res, 'Device session logged out successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/devices/logout-all
 * Revoke/log out all other device sessions.
 */
const logoutAllDevices = async (req, res, next) => {
  try {
    await authService.logoutAllDevices(req.user.id, req);
    return success(res, 'All other devices logged out successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/device-token
 * Register or update FCM device token for push notifications.
 */
const saveDeviceToken = async (req, res, next) => {
  try {
    const { device_token, device_type } = req.body;
    if (!device_token) {
      const { AppError } = require('../utils/response');
      return next(new AppError('device_token is required', 400));
    }
    const userModel = require('../models/userModel');
    const saved = await userModel.saveUserDevice(req.user.id, device_type || 'android', device_token);
    return success(res, 'Device token registered successfully', saved);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  sendOtp,
  verifyOtp,
  resendOtp,
  register,
  refreshToken,
  logout,
  getActiveDevices,
  logoutDevice,
  logoutAllDevices,
  saveDeviceToken,
  getProfile,
  updateProfile,
  deleteProfile,
};
