const { validationResult, body } = require('express-validator');
const { AppError } = require('../utils/response');
const { verifyAccess } = require('../utils/jwt');
const { TOKEN_TYPES } = require('../constants');
const userModel = require('../models/userModel');

/**
 * Express middleware to validate request inputs using express-validator schema.
 * Rejects with a 400 Bad Request error if validation fails.
 */
const validate = (req, _res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new AppError(
        'Validation failed',
        400,
        errors.array().map((e) => ({ field: e.path, message: e.msg })),
      ),
    );
  }
  next();
};

/**
 * Mobile number validator requiring country code prefix (e.g. +919876543210).
 */
const mobile = () =>
  body('mobile_number')
    .trim()
    .notEmpty()
    .matches(/^\+\d{1,4}[6-9]\d{9}$/)
    .withMessage('Invalid mobile number. Must include country code prefix (e.g., +919876543210)');

/**
 * OTP input validation.
 */
const otp = () => body('otp').trim().notEmpty().isLength({ min: 4, max: 8 }).isNumeric();

/**
 * Firebase verification ID validation.
 */
const verificationId = () => body('firebase_verification_id').trim().notEmpty();

const deviceRules = [
  body('device').optional({ values: 'falsy' }).isObject().withMessage('Device must be an object'),
  body('device.device_type')
    .optional({ values: 'falsy' })
    .trim()
    .isIn(['android', 'ios', 'web'])
    .withMessage('Invalid device type'),
  body('device.device_token')
    .optional({ values: 'falsy' })
    .trim()
    .notEmpty()
    .withMessage('Device token cannot be empty'),
];

const registerDeviceRules = [
  body('device').isObject().withMessage('Device must be an object'),
  body('device.device_type')
    .trim()
    .notEmpty()
    .isIn(['android', 'ios', 'web'])
    .withMessage('Invalid device type'),
  body('device.device_token').trim().notEmpty().withMessage('Device token is required'),
];

const sendOtpRules = [mobile(), body('recaptcha_token').optional()];
const verifyOtpRules = [mobile(), otp(), verificationId(), ...deviceRules];
const resendOtpRules = [mobile(), verificationId(), body('recaptcha_token').optional()];
const refreshRules = [body('refresh_token').trim().notEmpty()];
const logoutRules = [body('refresh_token').optional()];

/**
 * Validation rules for user registration.
 * business_type_id and business_category_id are optional integer IDs.
 */
const registerRules = [
  mobile(),
  body('full_name').trim().notEmpty().isLength({ min: 2, max: 100 }),
  body('company_name').trim().notEmpty().isLength({ min: 2, max: 200 }),
  body('email').optional({ values: 'falsy' }).isEmail().normalizeEmail(),
  body('gst_number')
    .optional({ values: 'falsy' })
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/),
  body('business_type_id')
    .optional({ values: 'falsy' })
    .isInt()
    .withMessage('Invalid business type ID'),
  body('business_category_id')
    .optional({ values: 'falsy' })
    .isInt()
    .withMessage('Invalid business category ID'),
  body('address_line_1').trim().notEmpty().isLength({ min: 3, max: 255 }),
  body('address_line_2').optional({ values: 'falsy' }).trim(),
  body('city').trim().notEmpty(),
  body('state').trim().notEmpty(),
  body('country').trim().notEmpty(),
  body('pincode')
    .trim()
    .matches(/^[1-9][0-9]{5}$/),
  body('language_id').notEmpty().isInt().withMessage('Invalid language ID'),
  body('role_id').notEmpty().isInt().withMessage('Invalid role ID'),
  ...registerDeviceRules,
];

/**
 * Validation rules for profile updates.
 */
const updateProfileRules = [
  body('full_name').optional().trim().isLength({ min: 2, max: 100 }),
  body('company_name').optional().trim().isLength({ min: 2, max: 200 }),
  body('email').optional({ values: 'falsy' }).isEmail().normalizeEmail(),
  body('business_type_id')
    .optional({ values: 'falsy' })
    .isInt()
    .withMessage('Invalid business type ID'),
  body('business_category_id')
    .optional({ values: 'falsy' })
    .isInt()
    .withMessage('Invalid business category ID'),
  body('pincode')
    .optional()
    .matches(/^[1-9][0-9]{5}$/),
  body('language_id').optional().isInt().withMessage('Invalid language ID'),
];

/**
 * Authentication middleware to secure private endpoints.
 * Validates JWT access token in the Authorization header and attaches the user record to req.user.
 */
const authenticate = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return next(new AppError('Access token required', 401));
    }

    const decoded = verifyAccess(header.split(' ')[1]);
    if (decoded.type !== TOKEN_TYPES.ACCESS) {
      return next(new AppError('Invalid token type', 401));
    }

    const user = await userModel.findUserById(decoded.userId);
    if (!user?.is_active) return next(new AppError('User not found or inactive', 401));

    req.user = user;
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
};

/**
 * Verification middleware for registration endpoint.
 * Validates the temporary registration access_token in the Authorization header.
 */
const verifyRegistration = (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return next(new AppError('Registration access token required', 401));
    }

    const decoded = verifyAccess(header.split(' ')[1]);
    if (decoded.type !== TOKEN_TYPES.REGISTRATION || !decoded.verified) {
      return next(new AppError('Invalid registration access token', 401));
    }
    if (decoded.mobileNumber !== req.body.mobile_number) {
      return next(new AppError('Mobile number mismatch', 401));
    }
    next();
  } catch {
    next(new AppError('Invalid or expired registration token', 401));
  }
};

module.exports = {
  validate,
  sendOtpRules,
  verifyOtpRules,
  resendOtpRules,
  registerRules,
  refreshRules,
  logoutRules,
  updateProfileRules,
  authenticate,
  verifyRegistration,
};
