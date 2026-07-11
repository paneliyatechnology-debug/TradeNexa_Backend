/**
 * Express rate limiters for API, OTP, and admin login endpoints.
 *
 * Global API limiter is env-driven (see config.rateLimit).
 * OTP and admin login keep stricter limits for abuse protection.
 */
const rateLimit = require('express-rate-limit');
const config = require('../config');

// ==========================================
// General API limiter
// ==========================================

const passThrough = (_req, _res, next) => next();

/** Applied to all /api/v1 routes when RATE_LIMIT_ENABLED is on. */
const apiLimiter = config.rateLimit.enabled
  ? rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message: 'Too many requests', errors: [] },
    })
  : passThrough;

// ==========================================
// OTP limiter
// ==========================================

/** Applied to send-otp and resend-otp — 5 requests per 15 minutes. */
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many OTP requests', errors: [] },
});

// ==========================================
// Admin login limiter
// ==========================================

/** Applied to POST /admin/auth/login — 10 attempts per 15 minutes. */
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts', errors: [] },
});

module.exports = { apiLimiter, otpLimiter, adminLoginLimiter };
