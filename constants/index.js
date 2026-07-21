/**
 * Application-wide constants.
 *
 * HTTP status codes, response messages, role codes, token types, and OTP statuses.
 */

// ==========================================
// HTTP status codes
// ==========================================

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
};

// ==========================================
// Response messages
// ==========================================

const MESSAGES = {
  SUCCESS: 'Success',
  OTP_SENT: 'OTP sent successfully',
  OTP_VERIFIED: 'OTP verified successfully',
  OTP_RESENT: 'OTP resent successfully',
  REGISTER_SUCCESS: 'Registration successful',
  LOGOUT_SUCCESS: 'Logout successful',
  TOKEN_REFRESHED: 'Token refreshed successfully',
  PROFILE_UPDATED: 'Profile updated successfully',
  ACCOUNT_DELETED: 'Account deleted successfully',
  ADMIN_LOGIN_SUCCESS: 'Admin login successful',
  ADMIN_USER_CREATED: 'Admin user created successfully',
};

// ==========================================
// Role codes
// ==========================================

const ROLE_CODES = {
  BUYER: 'buyer',
  SELLER: 'seller',
  BUYER_SELLER: 'buyer_seller',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
  SUPPORTER: 'supporter',
};

/** Roles permitted to access the admin panel. */
const ADMIN_PANEL_ROLE_CODES = ['admin', 'super_admin', 'supporter'];

// ==========================================
// Language codes
// ==========================================

const LANGUAGE_CODES = {
  ENGLISH: 'en',
  HINDI: 'hi',
  GUJARATI: 'gu',
};

// ==========================================
// Token types
// ==========================================

const TOKEN_TYPES = {
  ACCESS: 'access',
  REFRESH: 'refresh',
  REGISTRATION: 'registration',
};

// ==========================================
// OTP statuses
// ==========================================

const OTP_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  EXPIRED: 'expired',
};

// ==========================================
// Device types (FCM push platforms)
// ==========================================

/**
 * Client platforms that may register an FCM token.
 * Each user stores at most one token per type (android | ios | web).
 */
const DEVICE_TYPES = {
  ANDROID: 'android',
  IOS: 'ios',
  WEB: 'web',
};

/** Allowed device_type values for auth / devices table. */
const DEVICE_TYPE_VALUES = Object.values(DEVICE_TYPES);

module.exports = {
  HTTP_STATUS,
  MESSAGES,
  ROLE_CODES,
  ADMIN_PANEL_ROLE_CODES,
  LANGUAGE_CODES,
  TOKEN_TYPES,
  OTP_STATUS,
  DEVICE_TYPES,
  DEVICE_TYPE_VALUES,
};
