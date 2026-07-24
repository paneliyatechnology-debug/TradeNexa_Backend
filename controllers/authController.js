// User authentication, OTP verification, and profile management handlers.

const authService = require('../services/authService');
const { success } = require('../utils/response');
const { MESSAGES, HTTP_STATUS } = require('../constants');

// ==========================================
// OTP Authentication
// ==========================================

/**
 * POST /auth/send-otp
 * Send OTP verification code to the user's mobile number.
 */
const sendOtp = async (req, res, next) => {
  try {
    const data = await authService.sendOtp(req.body.mobile_number, req.body.recaptcha_token);
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
 * (wishlist, notifications_unread, chat_unread, inquiries, rfqs,
 *  pending_inquiries, pending_rfqs).
 */
const getProfile = async (req, res, next) => {
  try {
    const data = await authService.getProfile(req.user.id);
    return success(res, MESSAGES.SUCCESS, data);
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

module.exports = {
  sendOtp,
  verifyOtp,
  resendOtp,
  register,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  deleteProfile,
};
