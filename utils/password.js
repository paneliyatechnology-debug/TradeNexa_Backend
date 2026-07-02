/**
 * Password hashing and validation utilities (bcrypt).
 * Used by admin panel authentication.
 */
const bcrypt = require('bcrypt');
const config = require('../config');

// ==========================================
// Policy
// ==========================================

/** Min 8 chars with uppercase, lowercase, digit, and special character. */
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,128}$/;

const PASSWORD_POLICY_MESSAGE =
  'Password must be 8-128 characters and include uppercase, lowercase, number, and special character';

// ==========================================
// Hashing
// ==========================================

/** Hash a plain-text password before storing in the database. */
const hashPassword = (password) => bcrypt.hash(password, config.bcryptSaltRounds);

/** Compare a plain-text password against a stored bcrypt hash. */
const comparePassword = (password, hash) => bcrypt.compare(password, hash);

/** Check if a password meets the project policy. */
const isValidPassword = (password) => PASSWORD_REGEX.test(password);

module.exports = {
  PASSWORD_REGEX,
  PASSWORD_POLICY_MESSAGE,
  hashPassword,
  comparePassword,
  isValidPassword,
};
