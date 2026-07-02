/**
 * JWT token utilities.
 *
 * Sign, verify, and hash access/refresh/registration tokens.
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const config = require('../config');
const { TOKEN_TYPES } = require('../constants');

// ==========================================
// Token signing
// ==========================================

/**
 * Sign a short-lived access token.
 * @param {Object} payload - Claims to embed in the token
 * @returns {string}
 */
const signAccess = (payload) =>
  jwt.sign({ ...payload, type: TOKEN_TYPES.ACCESS }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiry,
  });

/**
 * Sign a long-lived refresh token.
 * @param {Object} payload - Claims to embed in the token
 * @returns {string}
 */
const signRefresh = (payload) =>
  jwt.sign({ ...payload, type: TOKEN_TYPES.REFRESH }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiry,
  });

/**
 * Sign a temporary registration token issued after OTP verification.
 * @param {Object} payload - Claims to embed in the token
 * @returns {string}
 */
const signRegistration = (payload) =>
  jwt.sign({ ...payload, type: TOKEN_TYPES.REGISTRATION }, config.jwt.accessSecret, {
    expiresIn: config.jwt.registrationExpiry,
  });

// ==========================================
// Token verification
// ==========================================

/**
 * Verify and decode an access or registration token.
 * @param {string} token - JWT string
 * @returns {Object}
 */
const verifyAccess = (token) => jwt.verify(token, config.jwt.accessSecret);

/**
 * Verify and decode a refresh token.
 * @param {string} token - JWT string
 * @returns {Object}
 */
const verifyRefresh = (token) => jwt.verify(token, config.jwt.refreshSecret);

// ==========================================
// Token hashing (for refresh token storage)
// ==========================================

/**
 * Hash a token for secure database storage.
 * @param {string} token - Plain token string
 * @returns {Promise<string>}
 */
const hashToken = (token) => bcrypt.hash(token, config.bcryptSaltRounds);

/**
 * Compare a plain token against a stored bcrypt hash.
 * @param {string} token - Plain token string
 * @param {string} hash - Stored bcrypt hash
 * @returns {Promise<boolean>}
 */
const compareToken = (token, hash) => bcrypt.compare(token, hash);

// ==========================================
// Token generation helpers
// ==========================================

/**
 * Build the standard JWT payload from a user record.
 * @param {Object} user - User row from the database
 * @returns {{ userId: number, uuid: string, mobileNumber: string }}
 */
const buildPayload = (user) => ({
  userId: user.id,
  uuid: user.uuid,
  mobileNumber: user.mobile_number,
});

/**
 * Generate a fresh access/refresh token pair for a user.
 * @param {Object} user - User row from the database
 * @returns {{ accessToken: string, refreshToken: string }}
 */
const generateAuthTokens = (user) => {
  const payload = buildPayload(user);
  return { accessToken: signAccess(payload), refreshToken: signRefresh(payload) };
};

module.exports = {
  signRegistration,
  verifyAccess,
  verifyRefresh,
  hashToken,
  compareToken,
  generateAuthTokens,
};
