/**
 * User authentication and profile routes.
 *
 * OTP login/registration flow, token refresh/logout, and authenticated profile CRUD.
 */
const express = require('express');
const authController = require('../controllers/authController');
const {
  validate,
  sendOtpRules,
  verifyOtpRules,
  resendOtpRules,
  registerRules,
  refreshRules,
  logoutRules,
  registerDeviceRules,
  authenticate,
  verifyRegistration,
} = require('../middleware/auth');
const { validateProfileUpdate } = require('../middleware/profileValidation');
const { handleProfileUpload } = require('../middleware/upload');
const { otpLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// ==========================================
// OTP & registration (public)
// ==========================================

router.post('/send-otp', otpLimiter, sendOtpRules, validate, authController.sendOtp);
router.post('/verify-otp', verifyOtpRules, validate, authController.verifyOtp);
router.post('/resend-otp', otpLimiter, resendOtpRules, validate, authController.resendOtp);
router.post('/register', registerRules, validate, verifyRegistration, authController.register);

// ==========================================
// Session management
// ==========================================

router.post('/refresh-token', refreshRules, validate, authController.refreshToken);
router.post('/logout', authenticate, logoutRules, validate, authController.logout);
router.post('/device', authenticate, registerDeviceRules, validate, authController.registerDevice);

// ==========================================
// Profile (authenticated)
// ==========================================

router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, handleProfileUpload, validateProfileUpdate, authController.updateProfile);
router.delete('/profile', authenticate, authController.deleteProfile);

module.exports = router;
