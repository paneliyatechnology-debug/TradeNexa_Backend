const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const firebase = require('../utils/firebase');
const { generateAuthTokens, signRegistration, verifyRefresh } = require('../utils/jwt');
const { AppError } = require('../utils/response');
const { TOKEN_TYPES, OTP_STATUS } = require('../constants');

const OTP_EXPIRY_MINUTES = 10;

/**
 * Add specified minutes to a date object.
 * @param {Date} date - Source date
 * @param {number} mins - Minutes to add
 * @returns {Date}
 */
const addMinutes = (date, mins) => new Date(date.getTime() + mins * 60000);

/**
 * Check if a date has expired compared to now.
 * @param {Date|string} date - Date to check
 * @returns {boolean}
 */
const isExpired = (date) => new Date(date) < new Date();

/**
 * Extract device info from request body (flat fields or nested device object).
 * @param {Object} body - Request body
 * @returns {{ device_type: string|null, device_token: string|null }|null}
 */
const getDeviceFromBody = (body) => {
  if (body.device_type && body.device_token) {
    return { device_type: body.device_type, device_token: body.device_token };
  }
  if (body.device?.device_token) {
    return {
      device_type: body.device.device_type || null,
      device_token: body.device.device_token,
    };
  }
  return null;
};

/**
 * Helper to verify OTP session state in local logs and validate via Firebase.
 * @param {string} mobile - Mobile number
 * @param {string} otp - Verification code
 * @param {string} verificationId - Firebase verification ID
 */
const verifyOtpSession = async (mobile, otp, verificationId) => {
  const otpLog = await userModel.findOtpByVerificationId(verificationId);

  if (!otpLog || otpLog.mobile_number !== mobile) {
    throw new AppError('Invalid verification session', 400);
  }
  if (otpLog.status === OTP_STATUS.VERIFIED) {
    throw new AppError('OTP session already used', 400);
  }
  if (isExpired(otpLog.expires_at)) {
    await userModel.markOtpExpired(otpLog.id);
    throw new AppError('OTP has expired', 400);
  }

  // Verify against Firebase API
  await firebase.verifyOtp(verificationId, otp);
  await userModel.markOtpVerified(otpLog.id);
};

/**
 * Helper to issue access/refresh tokens and fetch formatting information for response.
 * @param {Object} user - User record
 * @param {Object} req - Request context
 * @returns {Promise<Object>}
 */
const issueTokens = async (user, req) => {
  const tokens = generateAuthTokens(user);
  const decoded = jwt.decode(tokens.refreshToken);

  // Save new refresh token record and log user device details
  await userModel.saveRefreshToken(user.id, tokens.refreshToken, new Date(decoded.exp * 1000));
  await userModel.updateUser(user.id, { last_login: userModel.db.fn.now() });
  await userModel.createLoginLog({
    user_id: user.id,
    ip_address: req.ip,
    device_info: req.headers['user-agent'],
    login_at: new Date(),
  });

  // Track and update the user's active device token
  const device = getDeviceFromBody(req.body);
  if (device?.device_token) {
    try {
      await userModel.saveUserDevice(user.id, device.device_type, device.device_token);
    } catch (error) {
      console.error('Failed to update user device token:', error.message);
    }
  }

  const profile = await userModel.getFullProfile(user.id);
  return {
    is_registered: true,
    user: userModel.formatUser(profile),
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  };
};

/**
 * Send OTP verification code to a mobile number.
 * @param {string} mobileNumber - Target mobile number
 * @param {string} [recaptchaToken] - Recaptcha token
 * @returns {Promise<Object>}
 */
const sendOtp = async (mobileNumber, recaptchaToken) => {
  const result = await firebase.sendOtp(mobileNumber, recaptchaToken);
  await userModel.createOtpLog({
    mobile_number: mobileNumber,
    firebase_verification_id: result.firebaseVerificationId,
    status: OTP_STATUS.PENDING,
    expires_at: addMinutes(new Date(), OTP_EXPIRY_MINUTES),
  });
  return {
    firebase_verification_id: result.firebaseVerificationId,
    mobile_number: mobileNumber,
  };
};

/**
 * Verify OTP code. Returns access token pair if user exists, else temporary access_token.
 * @param {string} mobileNumber - Verified mobile number
 * @param {string} otp - Verification code
 * @param {string} verificationId - Firebase verification ID
 * @param {Object} req - Request object
 * @returns {Promise<Object>}
 */
const verifyOtp = async (mobileNumber, otp, verificationId, req) => {
  await verifyOtpSession(mobileNumber, otp, verificationId);
  const user = await userModel.findUserByMobile(mobileNumber);

  if (user) return issueTokens(user, req);

  // Return access_token (formerly registration_token) for registration flow
  return {
    is_registered: false,
    mobile_number: mobileNumber,
    access_token: signRegistration({
      mobileNumber,
      verified: true,
      type: TOKEN_TYPES.REGISTRATION,
    }),
  };
};

/**
 * Resend OTP verification code to a mobile number.
 * @param {string} mobileNumber - Mobile number
 * @param {string} verificationId - Original verification session ID
 * @param {string} [recaptchaToken] - Recaptcha token
 * @returns {Promise<Object>}
 */
const resendOtp = async (mobileNumber, verificationId, recaptchaToken) => {
  const otpLog = await userModel.findOtpByVerificationId(verificationId);
  if (!otpLog || otpLog.mobile_number !== mobileNumber) {
    throw new AppError('Invalid verification session', 400);
  }

  const result = await firebase.resendOtp(verificationId, recaptchaToken);
  await userModel.updateOtpVerificationId(
    otpLog.id,
    result.firebaseVerificationId,
    addMinutes(new Date(), OTP_EXPIRY_MINUTES),
  );

  return {
    firebase_verification_id: result.firebaseVerificationId,
    mobile_number: mobileNumber,
  };
};

/**
 * Register a new user and create their profile & address details in a single transaction.
 * @param {Object} data - Input registration payload
 * @param {Object} req - Request context
 * @returns {Promise<Object>}
 */
const register = async (data, req) => {
  if (await userModel.findUserByMobile(data.mobile_number)) {
    throw new AppError('User already registered', 409);
  }
  if (await userModel.findUserByEmail(data.email)) {
    throw new AppError('Email already in use', 409);
  }

  const role = await userModel.db('roles').where({ id: data.role_id, is_active: true }).first();
  if (!role) throw new AppError('Invalid role ID', 400);

  const businessTypeModel = require('../models/businessTypeModel');
  const isValidType = await businessTypeModel.isValidForRole(data.business_type_id, role.id);
  if (!isValidType) {
    throw new AppError('Business type does not match selected role', 400);
  }

  let languageId;
  if (data.language_id) {
    const language = await userModel.db('languages').where({ id: data.language_id, is_active: true }).first();
    if (!language) throw new AppError('Invalid language ID', 400);
    languageId = language.id;
  } else {
    const defaultLanguage = await userModel.findLanguageByCode('en');
    if (!defaultLanguage) throw new AppError('Default language not found', 500);
    languageId = defaultLanguage.id;
  }

  const user = await userModel.createUser({
    uuid: userModel.uuidv4(),
    mobile_number: data.mobile_number,
    email: data.email,
    full_name: data.full_name,
    role_id: role.id,
    business_type_id: data.business_type_id,
    language_id: languageId,
    is_verified: true,
    is_active: true,
  });

  return issueTokens(await userModel.findUserById(user.id), req);
};

/**
 * Regenerate token pairs using an active refresh token.
 * @param {string} token - Refresh token
 * @returns {Promise<Object>}
 */
const refreshToken = async (token) => {
  let decoded;
  try {
    decoded = verifyRefresh(token);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  if (decoded.type !== TOKEN_TYPES.REFRESH) throw new AppError('Invalid token type', 401);

  const record = await userModel.findValidRefreshToken(decoded.userId, token);
  if (!record) throw new AppError('Refresh token revoked', 401);

  const user = await userModel.findUserById(decoded.userId);
  if (!user?.is_active) throw new AppError('User not found or inactive', 401);

  // Revoke old and save new refresh token (Rotate refresh tokens)
  await userModel.revokeRefreshToken(record.id);
  const tokens = generateAuthTokens(user);
  const newDecoded = jwt.decode(tokens.refreshToken);
  await userModel.saveRefreshToken(user.id, tokens.refreshToken, new Date(newDecoded.exp * 1000));

  return { access_token: tokens.accessToken, refresh_token: tokens.refreshToken };
};

/**
 * Revoke specific or all active refresh tokens for the user, and remove active device registrations.
 * @param {number} userId - Authenticated user ID
 * @param {string} [token] - Specific refresh token to revoke
 */
const logout = async (userId, token) => {
  if (token) await userModel.revokeRefreshTokenByValue(userId, token);
  else await userModel.revokeAllRefreshTokens(userId);

  await userModel.deleteUserDevice(userId);
};

const profileService = require('./profileService');

/**
 * Get profile data formatted for response.
 */
const getProfile = (userId) => profileService.getProfile(userId);

/**
 * Update user profile (role-based fields).
 */
const updateProfile = (userId, data, files) => profileService.updateProfile(userId, data, files);

/**
 * Soft delete user profile and clean up active sessions.
 * @param {number} userId - User ID
 * @returns {Promise<void>}
 */
const deleteProfile = async (userId) => {
  const user = await userModel.findUserById(userId);
  if (!user) throw new AppError('User not found', 404);

  await userModel.softDeleteUser(userId);
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
