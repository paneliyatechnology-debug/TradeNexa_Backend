/**
 * User authentication service.
 *
 * OTP-based login/registration, token management, and profile delegation.
 */
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const firebase = require('../utils/firebase');
const { generateAuthTokens, signRegistration, verifyRefresh } = require('../utils/jwt');
const { AppError } = require('../utils/response');
const { TOKEN_TYPES, OTP_STATUS } = require('../constants');
const logger = require('../utils/logger');

const OTP_EXPIRY_MINUTES = 10;

// ==========================================
// Internal helpers
// ==========================================

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
 * Extract FCM device info from request body (flat fields or nested `device` object).
 * Expected on verify-otp / register: device_type (android|ios|web) + device_token (real FCM token).
 * @param {Object} body - Request body
 * @returns {{ device_type: string|null, device_token: string|null }|null}
 */
const getDeviceFromBody = (body = {}) => {
  let deviceType = null;
  let deviceToken = null;

  if (body.device_token) {
    deviceType = body.device_type || null;
    deviceToken = body.device_token;
  } else if (body.device?.device_token) {
    deviceType = body.device.device_type || null;
    deviceToken = body.device.device_token;
  } else {
    return null;
  }

  const token = String(deviceToken).trim();
  if (!token) return null;

  return {
    device_type: deviceType ? String(deviceType).toLowerCase().trim() : null,
    device_token: token,
  };
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
 * Resolve is_completed_profile from a users-table row.
 * Returns false when the user record is missing.
 */
const resolveIsCompletedProfile = (user) => {
  if (!user) return false;
  return Boolean(user.is_completed_profile);
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

  // Save new refresh token record and log user device details in parallel
  await Promise.all([
    userModel.saveRefreshToken(user.id, tokens.refreshToken, new Date(decoded.exp * 1000)),
    userModel.updateUser(user.id, { last_login: userModel.db.fn.now() }),
    userModel.createLoginLog({
      user_id: user.id,
      ip_address: req.ip,
      device_info: req.headers['user-agent'],
      login_at: new Date(),
    }),
  ]);

  // Persist FCM token from verify-otp / register if provided
  const device = getDeviceFromBody(req.body);
  if (device?.device_token) {
    try {
      const saved = await userModel.saveUserDevice(user.id, device.device_type, device.device_token);
      logger.info('FCM device saved on auth', {
        userId: user.id,
        deviceType: saved.device_type,
        replaced: saved.replaced,
      });
    } catch (error) {
      logger.error('Failed to save FCM device token on auth', {
        userId: user.id,
        deviceType: device.device_type,
        error: error.message,
      });
    }
  } else {
    logger.warn('Auth completed without device_token — chat push will not work until token is saved', {
      userId: user.id,
    });
  }

  const profile = await userModel.getFullProfile(user.id);

  return {
    is_registered: true,
    is_completed_profile: resolveIsCompletedProfile(user),
    user: userModel.formatUser(profile),
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  };
};

// ==========================================
// OTP flow
// ==========================================

/**
 * Send OTP verification code to a mobile number.
 * @param {string} mobileNumber - Target mobile number
 * @param {string} [recaptchaToken] - Recaptcha token
 * @returns {Promise<Object>}
 */
const sendOtp = async (mobileNumber, recaptchaToken) => {
  console.log('sendOtp service entered');
  const result = await firebase.sendOtp(mobileNumber, recaptchaToken);
  console.log('sendOtp service exited');
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

  return {
    is_registered: false,
    is_completed_profile: resolveIsCompletedProfile(null),
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

// ==========================================
// Registration & session management
// ==========================================

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
 * Revoke refresh tokens and unregister only the logging-out device.
 * Other device tokens stay registered so remaining phones/browsers still get push.
 * Prefer sending `device_token` on logout so only that install is removed.
 * @param {number} userId
 * @param {string} [token] - refresh token
 * @param {{ deviceToken?: string|null, deviceType?: string|null }} [device]
 */
const logout = async (userId, token, device = {}) => {
  const deviceToken = device.deviceToken || null;
  const deviceType = device.deviceType || null;

  if (token) await userModel.revokeRefreshTokenByValue(userId, token);
  else await userModel.revokeAllRefreshTokens(userId);

  if (deviceToken) {
    await userModel.deleteDeviceByToken(deviceToken);
  } else if (deviceType) {
    await userModel.deleteUserDeviceByType(userId, deviceType);
  }
  // If neither token nor type is sent, keep all device tokens so other devices still get push
};

// ==========================================
// Profile (delegated to profileService)
// ==========================================

const profileService = require('./profileService');

/**
 * Get profile data formatted for response.
 * @param {number} userId - Authenticated user ID
 * @returns {Promise<Object>}
 */
const getProfile = (userId) => profileService.getProfile(userId);

/**
 * Update user profile (role-based fields).
 * @param {number} userId - Authenticated user ID
 * @param {Object} data - Profile update payload
 * @param {Object} files - Uploaded file map from multer
 * @returns {Promise<Object>}
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

// ==========================================
// Login Devices & Session Management
// ==========================================

/**
 * Parse User-Agent string to extract device brand/model, OS, and browser details.
 */
const detectDeviceBrandAndModel = (uaRaw) => {
  const ua = String(uaRaw || '');

  // 1. Apple Devices
  if (/iPhone/i.test(ua)) return 'Apple iPhone';
  if (/iPad/i.test(ua)) return 'Apple iPad';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Apple Mac';

  // 2. Android Brand and Model Detection
  const androidMatch = ua.match(/Android\s+([0-9\.]+)?;\s*([^;)]+)/i);
  if (androidMatch && androidMatch[2]) {
    const rawModel = androidMatch[2].trim();

    // Samsung
    if (/^SM-|SAMSUNG|GT-/i.test(rawModel)) {
      return `Samsung Galaxy (${rawModel.replace(/^SM-/i, '')})`;
    }
    // Google Pixel
    if (/Pixel/i.test(rawModel)) {
      return `Google ${rawModel}`;
    }
    // OnePlus
    if (/OnePlus|CPH[0-9]{4}|IN20[0-9]{2}|GM19[0-9]{2}/i.test(rawModel)) {
      return `OnePlus (${rawModel})`;
    }
    // Xiaomi / Redmi / POCO
    if (/Redmi|POCO|Xiaomi|220[0-9]|230[0-9]|210[0-9]|M20|M21/i.test(rawModel)) {
      return `Xiaomi / Redmi (${rawModel})`;
    }
    // Vivo / iQOO
    if (/Vivo|V2[0-9]{3}|iQOO/i.test(rawModel)) {
      return `Vivo / iQOO (${rawModel})`;
    }
    // Realme / Oppo
    if (/RMX[0-9]{4}|Realme|Oppo/i.test(rawModel)) {
      return `Realme / Oppo (${rawModel})`;
    }
    // Motorola
    if (/Moto|Motorola|XT[0-9]{4}/i.test(rawModel)) {
      return `Motorola (${rawModel})`;
    }

    if (rawModel.length > 2 && rawModel.length < 30 && !/build|khtml|gecko|version/i.test(rawModel)) {
      return `Android (${rawModel})`;
    }
    return 'Android Smartphone';
  }

  // 3. Windows PC
  if (/Windows NT 10.0|Windows NT 11.0/i.test(ua)) return 'Windows 10/11 PC';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Linux/i.test(ua)) return 'Linux System';

  return null;
};

const parseUserAgent = (uaString, explicitDeviceType) => {
  const ua = String(uaString || '').toLowerCase();
  let browser = 'Web Browser';
  let os = 'Unknown OS';
  let deviceType = explicitDeviceType || 'desktop';

  // Specific App & Client detection
  if (ua.includes('okhttp') || ua.includes('dalvik')) {
    browser = 'TradeNexa Android App';
    os = 'Android';
    deviceType = 'mobile';
  } else if (ua.includes('cfnetwork') || ua.includes('darwin')) {
    browser = 'TradeNexa iOS App';
    os = 'iOS';
    deviceType = 'mobile';
  } else if (ua.includes('dart') || ua.includes('flutter')) {
    browser = 'TradeNexa Mobile App';
    os = 'Mobile OS';
    deviceType = 'mobile';
  } else if (ua.includes('postman')) {
    browser = 'Postman API Client';
    os = 'Desktop';
    deviceType = 'desktop';
  } else {
    // OS Detection
    if (ua.includes('windows nt 10')) os = 'Windows 10/11';
    else if (ua.includes('windows nt 6.3')) os = 'Windows 8.1';
    else if (ua.includes('windows nt 6.1')) os = 'Windows 7';
    else if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('macintosh') || ua.includes('mac os x')) os = 'macOS';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('iphone')) os = 'iOS (iPhone)';
    else if (ua.includes('ipad')) os = 'iPadOS';
    else if (ua.includes('ipod')) os = 'iOS';
    else if (ua.includes('linux')) os = 'Linux';

    // Device type
    if (ua.includes('ipad') || ua.includes('tablet')) {
      deviceType = 'tablet';
    } else if (
      ua.includes('mobile') ||
      ua.includes('iphone') ||
      ua.includes('ipod') ||
      ua.includes('android') ||
      ua.includes('windows phone')
    ) {
      deviceType = 'mobile';
    } else {
      deviceType = 'desktop';
    }

    // Browser Detection
    if (ua.includes('edg/')) browser = 'Microsoft Edge';
    else if (ua.includes('chrome/') || ua.includes('crios/')) browser = deviceType === 'mobile' ? 'Chrome Mobile' : 'Chrome';
    else if (ua.includes('firefox/') || ua.includes('fxios/')) browser = deviceType === 'mobile' ? 'Firefox Mobile' : 'Firefox';
    else if (ua.includes('safari/') && !ua.includes('chrome/')) browser = deviceType === 'mobile' ? 'Safari Mobile' : 'Safari';
    else if (ua.includes('opera/') || ua.includes('opr/')) browser = 'Opera';
  }

  const modelBrand = detectDeviceBrandAndModel(uaString);
  const title = modelBrand
    ? `${modelBrand} (${browser})`
    : browser.includes(os)
      ? browser
      : `${browser} on ${os}`;

  return { browser, os, deviceType, modelBrand, title };
};

/**
 * Get all active login sessions / devices for the user (including web sessions and mobile app devices).
 * @param {number} userId - Authenticated user ID
 * @param {Object} req - Current request context
 * @returns {Promise<Array>}
 */
const getActiveDevices = async (userId, req) => {
  const currentIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const currentUa = req.headers['user-agent'] || '';

  // 1. Fetch login activity logs & registered devices
  const [logs, registeredDevices] = await Promise.all([
    userModel.getUserLoginLogs(userId, 30),
    userModel.findDevicesByUserId(userId),
  ]);

  const devicesList = [];
  const seenKeys = new Set();
  const currentParsed = parseUserAgent(currentUa);

  // Match current device by comparing UA string or browser+os+type
  let currentMatchedId = null;
  for (const log of logs) {
    if (log.device_info && currentUa && log.device_info.trim() === currentUa.trim()) {
      currentMatchedId = log.id;
      break;
    }
  }

  // Process login logs
  logs.forEach((log) => {
    const parsed = parseUserAgent(log.device_info);
    const key = `${parsed.deviceType}-${parsed.os}-${parsed.browser}-${log.ip_address}`;

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      const isCurrent = currentMatchedId ? log.id === currentMatchedId : false;
      devicesList.push({
        id: log.id,
        title: parsed.title,
        browser: parsed.browser,
        os: parsed.os,
        device_type: parsed.deviceType,
        ip_address: log.ip_address || '127.0.0.1',
        login_at: log.login_at,
        last_active: log.login_at,
        is_current: isCurrent,
      });
    }
  });

  // Process registered mobile push devices (from TradeNexa mobile apps)
  registeredDevices.forEach((dev) => {
    const isAndroid = dev.device_type === 'android';
    const isIos = dev.device_type === 'ios';
    const title = isAndroid
      ? 'TradeNexa App (Android)'
      : isIos
        ? 'TradeNexa App (iOS)'
        : 'TradeNexa Web Push';
    const deviceType = isAndroid || isIos ? 'mobile' : 'desktop';
    const os = isAndroid ? 'Android' : isIos ? 'iOS' : 'Web';
    const key = `fcm-${dev.device_type}-${dev.id}`;

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      devicesList.push({
        id: `fcm_${dev.id}`,
        title,
        browser: 'TradeNexa Mobile App',
        os,
        device_type: deviceType,
        ip_address: 'Mobile App Device',
        login_at: dev.last_active || dev.created_at || new Date(),
        last_active: dev.last_active || dev.created_at || new Date(),
        is_current: false,
      });
    }
  });

  // If no device marked as current, mark the first matching device type or first in list
  let hasCurrent = devicesList.some((d) => d.is_current);
  if (!hasCurrent && devicesList.length > 0) {
    const matchType = devicesList.find((d) => d.device_type === currentParsed.deviceType);
    if (matchType) {
      matchType.is_current = true;
    } else {
      devicesList[0].is_current = true;
    }
    hasCurrent = true;
  }

  // If list is completely empty, create an entry for current session
  if (devicesList.length === 0) {
    devicesList.push({
      id: 1,
      title: currentParsed.title,
      browser: currentParsed.browser,
      os: currentParsed.os,
      device_type: currentParsed.deviceType,
      ip_address: currentIp,
      login_at: new Date(),
      last_active: new Date(),
      is_current: true,
    });
  }

  // Sort so current device is always first
  devicesList.sort((a, b) => (b.is_current ? 1 : 0) - (a.is_current ? 1 : 0));

  return devicesList;
};

/**
 * Log out / remove a specific device session.
 * @param {number} userId - Authenticated user ID
 * @param {string|number} deviceId - Session ID
 */
const logoutDevice = async (userId, deviceId) => {
  const idStr = String(deviceId);
  if (idStr.startsWith('fcm_')) {
    const rawId = idStr.replace('fcm_', '');
    await userModel.db('devices').where({ id: rawId, user_id: userId }).del();
    // Also remove mobile login logs
    const userLogs = await userModel.db('login_logs').where({ user_id: userId });
    for (const ul of userLogs) {
      const parsed = parseUserAgent(ul.device_info);
      if (parsed.deviceType === 'mobile' || parsed.deviceType === 'tablet') {
        await userModel.deleteLoginLogById(userId, ul.id);
      }
    }
  } else {
    const targetLog = await userModel.db('login_logs').where({ id: Number(deviceId), user_id: userId }).first();
    if (targetLog) {
      const targetParsed = parseUserAgent(targetLog.device_info);

      // 1. Delete target log by ID
      await userModel.deleteLoginLogById(userId, Number(deviceId));

      // 2. Fetch all remaining login logs for this user and delete any from the same platform / OS / IP
      const userLogs = await userModel.db('login_logs').where({ user_id: userId });
      for (const ul of userLogs) {
        const ulParsed = parseUserAgent(ul.device_info);
        const isSameIp = targetLog.ip_address && ul.ip_address === targetLog.ip_address && ul.ip_address !== '127.0.0.1';
        const isSamePlatform =
          ulParsed.deviceType === targetParsed.deviceType &&
          (ulParsed.os === targetParsed.os || (ulParsed.deviceType === 'desktop' && targetParsed.deviceType === 'desktop'));

        if (isSameIp || isSamePlatform) {
          await userModel.deleteLoginLogById(userId, ul.id);
        }
      }

      // 3. If mobile/tablet, clean up push devices
      if (targetParsed.deviceType === 'mobile' || targetParsed.deviceType === 'tablet') {
        await userModel.db('devices').where({ user_id: userId }).del();
      }
    } else {
      await userModel.deleteLoginLogById(userId, Number(deviceId));
    }
  }

  // Realtime notify all active connections so revoked device immediately signs out
  try {
    const chatSocketEmitter = require('./chatSocketEmitter');
    chatSocketEmitter.emitToUser(userId, 'SESSION_REVOKED', {
      user_id: userId,
      device_id: deviceId,
    });
  } catch (err) {
    logger.warn('Failed to emit SESSION_REVOKED socket', { error: err.message });
  }
};

/**
 * Log out all devices except the current active session.
 * @param {number} userId - Authenticated user ID
 * @param {Object} req - Request context
 */
const logoutAllDevices = async (userId, req) => {
  const logs = await userModel.getUserLoginLogs(userId, 1);
  const currentLogId = logs[0]?.id || null;
  await Promise.all([
    userModel.deleteAllLoginLogsExcept(userId, currentLogId),
    userModel.db('devices').where({ user_id: userId }).del(),
  ]);

  // Realtime notify other devices to immediately clear session
  try {
    const chatSocketEmitter = require('./chatSocketEmitter');
    chatSocketEmitter.emitToUser(userId, 'SESSION_REVOKED', {
      user_id: userId,
      all_except_current: true,
      current_log_id: currentLogId,
    });
  } catch (err) {
    logger.warn('Failed to emit SESSION_REVOKED socket', { error: err.message });
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
  getProfile,
  updateProfile,
  deleteProfile,
};
