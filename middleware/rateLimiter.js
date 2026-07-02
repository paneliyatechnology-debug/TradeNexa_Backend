/**
 * Express rate limiters for API, OTP, and admin login endpoints.
 */
const rateLimit = require('express-rate-limit');

// ==========================================
// General API limiter
// ==========================================

/** Applied to all /api/v1 routes — 100 requests per 15 minutes. */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests', errors: [] },
});

// ==========================================
// OTP limiter
// ==========================================

/** Applied to send-otp and resend-otp — 5 requests per 15 minutes. */
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many OTP requests', errors: [] },
});

// ==========================================
// Admin login limiter
// ==========================================

/** Applied to POST /admin/auth/login — 10 attempts per 15 minutes. */
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts', errors: [] },
});

module.exports = { apiLimiter, otpLimiter, adminLoginLimiter };
