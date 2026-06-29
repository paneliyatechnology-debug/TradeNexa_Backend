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
  if (req.body.device && req.body.device.device_token) {
    const trx = await userModel.db.transaction();
    try {
      // Keep only one active device token per user
      await trx('devices').where({ user_id: user.id }).del();
      await trx('devices').insert({
        user_id: user.id,
        device_type: req.body.device.device_type || null,
        device_token: req.body.device.device_token,
        last_active: userModel.db.fn.now(),
      });
      await trx.commit();
    } catch (error) {
      await trx.rollback();
      // Log failure but don't fail authentication since login/register succeeded
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
  // Enforce single registration per mobile number and email
  if (await userModel.findUserByMobile(data.mobile_number)) {
    throw new AppError('User already registered', 409);
  }
  if (data.email && (await userModel.findUserByEmail(data.email))) {
    throw new AppError('Email already in use', 409);
  }

  const role = await userModel.db('roles').where({ id: data.role_id, is_active: true }).first();
  const language = await userModel
    .db('languages')
    .where({ id: data.language_id, is_active: true })
    .first();
  if (!role) throw new AppError('Invalid role ID', 400);
  if (!language) throw new AppError('Invalid language ID', 400);

  const locationIds = await userModel.findLocationIds(data.city, data.state, data.country);
  const trx = await userModel.db.transaction();

  try {
    // Create direct user entry
    const user = await userModel.createUser(
      {
        uuid: userModel.uuidv4(),
        mobile_number: data.mobile_number,
        email: data.email || null,
        full_name: data.full_name,
        role_id: role.id,
        is_verified: true,
        is_active: true,
      },
      trx,
    );

    // Create company details entry
    await userModel.createProfile(
      {
        user_id: user.id,
        company_name: data.company_name,
        gst_number: data.gst_number || null,
        business_type_id: data.business_type_id || null,
        business_category_id: data.business_category_id || null,
      },
      trx,
    );

    // Assign language and address details
    await userModel.assignLanguage(user.id, language.id, trx);
    await userModel.createAddress(
      {
        user_id: user.id,
        address_line_1: data.address_line_1,
        address_line_2: data.address_line_2 || null,
        city_id: locationIds.city_id,
        state_id: locationIds.state_id,
        country_id: locationIds.country_id,
        pincode: data.pincode,
        is_primary: true,
      },
      trx,
    );

    await trx.commit();
    return issueTokens(await userModel.findUserById(user.id), req);
  } catch (error) {
    await trx.rollback();
    throw error;
  }
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

/**
 * Get profile data formatted for response.
 * @param {number} userId - User ID
 * @returns {Promise<Object>}
 */
const getProfile = async (userId) => {
  const profile = await userModel.getFullProfile(userId);
  if (!profile) throw new AppError('User not found', 404);
  return userModel.formatUser(profile);
};

/**
 * Update user and company profile details.
 * @param {number} userId - User ID
 * @param {Object} data - Update data fields
 * @returns {Promise<Object>}
 */
const updateProfile = async (userId, data) => {
  const user = await userModel.findUserById(userId);
  if (!user) throw new AppError('User not found', 404);

  const userUpdate = {};
  if (data.email && data.email !== user.email) {
    if (await userModel.findUserByEmail(data.email)) throw new AppError('Email in use', 409);
    userUpdate.email = data.email;
  }
  if (data.full_name && data.full_name !== user.full_name) {
    userUpdate.full_name = data.full_name;
  }
  if (Object.keys(userUpdate).length) {
    userUpdate.updated_by = userId;
    await userModel.updateUser(userId, userUpdate);
  }

  const profileData = {};
  if (data.company_name) profileData.company_name = data.company_name;
  if (data.gst_number !== undefined) profileData.gst_number = data.gst_number;
  if (data.business_type_id !== undefined) profileData.business_type_id = data.business_type_id;
  if (data.business_category_id !== undefined)
    profileData.business_category_id = data.business_category_id;
  if (data.profile_image !== undefined) profileData.profile_image = data.profile_image;
  if (Object.keys(profileData).length) {
    profileData.updated_by = userId;
    await userModel.updateProfile(userId, profileData);
  }

  if (data.language_id) {
    const lang = await userModel
      .db('languages')
      .where({ id: data.language_id, is_active: true })
      .first();
    if (!lang) throw new AppError('Invalid language ID', 400);
    await userModel.db('user_languages').where({ user_id: userId }).del();
    await userModel.db('user_languages').insert({ user_id: userId, language_id: lang.id });
  }

  const hasAddress = data.address_line_1 || data.city || data.state || data.country || data.pincode;
  if (hasAddress) {
    const loc = await userModel.findLocationIds(data.city, data.state, data.country);
    const addr = {};
    if (data.address_line_1) addr.address_line_1 = data.address_line_1;
    if (data.address_line_2 !== undefined) addr.address_line_2 = data.address_line_2;
    if (data.pincode) addr.pincode = data.pincode;
    if (loc.city_id) addr.city_id = loc.city_id;
    if (loc.state_id) addr.state_id = loc.state_id;
    if (loc.country_id) addr.country_id = loc.country_id;
    await userModel.updateAddress(userId, addr);
  }

  return userModel.formatUser(await userModel.getFullProfile(userId));
};

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
