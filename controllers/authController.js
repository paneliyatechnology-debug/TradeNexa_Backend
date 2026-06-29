const authService = require('../services/authService');
const { success } = require('../utils/response');
const { MESSAGES, HTTP_STATUS } = require('../constants');

const sendOtp = async (req, res, next) => {
  try {
    const data = await authService.sendOtp(req.body.mobile_number, req.body.recaptcha_token);
    return success(res, MESSAGES.OTP_SENT, data);
  } catch (err) {
    next(err);
  }
};

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

const register = async (req, res, next) => {
  try {
    const data = await authService.register(req.body, req);
    return success(res, MESSAGES.REGISTER_SUCCESS, data, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const data = await authService.refreshToken(req.body.refresh_token);
    return success(res, MESSAGES.TOKEN_REFRESHED, data);
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    await authService.logout(req.user.id, req.body.refresh_token);
    return success(res, MESSAGES.LOGOUT_SUCCESS);
  } catch (err) {
    next(err);
  }
};

const getProfile = async (req, res, next) => {
  try {
    const data = await authService.getProfile(req.user.id);
    return success(res, MESSAGES.SUCCESS, data);
  } catch (err) {
    next(err);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const data = await authService.updateProfile(req.user.id, req.body);
    return success(res, MESSAGES.PROFILE_UPDATED, data);
  } catch (err) {
    next(err);
  }
};

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
