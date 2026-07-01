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
  authenticate,
  verifyRegistration,
} = require('../middleware/auth');
const { validateProfileUpdate } = require('../middleware/profileValidation');
const { otpLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/send-otp', otpLimiter, sendOtpRules, validate, authController.sendOtp);
router.post('/verify-otp', verifyOtpRules, validate, authController.verifyOtp);
router.post('/resend-otp', otpLimiter, resendOtpRules, validate, authController.resendOtp);
router.post('/register', registerRules, validate, verifyRegistration, authController.register);
router.post('/refresh-token', refreshRules, validate, authController.refreshToken);
router.post('/logout', authenticate, logoutRules, validate, authController.logout);
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, validateProfileUpdate, authController.updateProfile);
router.delete('/profile', authenticate, authController.deleteProfile);

module.exports = router;
