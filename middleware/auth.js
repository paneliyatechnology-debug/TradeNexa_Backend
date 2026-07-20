/**
 * Authentication and authorization middleware.
 *
 * Request validation rules, JWT authentication, registration token verification,
 * and role-based access control.
 */
const { validationResult, body } = require('express-validator');
const { AppError } = require('../utils/response');
const { verifyAccess } = require('../utils/jwt');
const { TOKEN_TYPES, DEVICE_TYPE_VALUES } = require('../constants');
const userModel = require('../models/userModel');

// ==========================================
// Validation middleware
// ==========================================

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

// ==========================================
// Reusable field validators
// ==========================================

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
    .toLowerCase()
    .isIn(DEVICE_TYPE_VALUES)
    .withMessage('Invalid device type (android | ios | web)'),
  body('device.device_token')
    .optional({ values: 'falsy' })
    .trim()
    .notEmpty()
    .withMessage('Device token cannot be empty'),
  body('device_type')
    .optional({ values: 'falsy' })
    .trim()
    .toLowerCase()
    .isIn(DEVICE_TYPE_VALUES)
    .withMessage('Invalid device type (android | ios | web)'),
  body('device_token')
    .optional({ values: 'falsy' })
    .trim()
    .notEmpty()
    .withMessage('Device token cannot be empty'),
];

// ==========================================
// Route validation rules
// ==========================================

const sendOtpRules = [mobile(), body('recaptcha_token').optional()];
const verifyOtpRules = [mobile(), otp(), verificationId(), ...deviceRules];
const resendOtpRules = [mobile(), verificationId(), body('recaptcha_token').optional()];
const refreshRules = [body('refresh_token').trim().notEmpty()];
const logoutRules = [
  body('refresh_token').optional(),
  body('device_token')
    .optional({ values: 'falsy' })
    .trim()
    .notEmpty()
    .withMessage('Device token cannot be empty'),
  body('device.device_token')
    .optional({ values: 'falsy' })
    .trim()
    .notEmpty()
    .withMessage('Device token cannot be empty'),
];

/**
 * Validation rules for user registration.
 */
const registerRules = [
  mobile(),
  body('full_name').trim().notEmpty().isLength({ min: 2, max: 100 }),
  body('email').trim().notEmpty().isEmail().normalizeEmail(),
  body('role_id').isInt({ min: 1 }).withMessage('role_id is required'),
  body('business_type_id').isInt({ min: 1 }).withMessage('business_type_id is required'),
  body('language_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Invalid language ID'),
  ...deviceRules,
];

// ==========================================
// Authentication & authorization
// ==========================================

/**
 * Extract JWT from Authorization header.
 * Accepts both "Bearer <token>" and raw "<token>" (Bearer prefix optional).
 * @param {string|undefined} header - Authorization header value
 * @returns {string|null}
 */
const extractAuthToken = (header) => {
  if (!header || typeof header !== 'string') return null;

  const trimmed = header.trim();
  if (!trimmed) return null;

  const bearerMatch = trimmed.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return bearerMatch[1].trim() || null;
  }

  return trimmed;
};

/**
 * Authentication middleware to secure private endpoints.
 * Validates JWT access token in the Authorization header and attaches the user record to req.user.
 */
const authenticate = async (req, _res, next) => {
  try {
    const token = extractAuthToken(req.headers.authorization);
    if (!token) {
      return next(new AppError('Access token required', 401));
    }

    const decoded = verifyAccess(token);
    if (decoded.type !== TOKEN_TYPES.ACCESS) {
      return next(new AppError('Invalid token type', 401));
    }

    const user = await userModel.findUserById(decoded.userId);
    if (!user?.is_active) return next(new AppError('User not found or inactive', 401));

    // Attach role code (users table only has role_id; authorize also sets this)
    const roles = await userModel.getUserRoles(user.id);
    user.role = roles?.[0]?.code || null;
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
    const token = extractAuthToken(req.headers.authorization);
    if (!token) {
      return next(new AppError('Registration access token required', 401));
    }

    const decoded = verifyAccess(token);
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

/**
 * Optional authentication — attaches req.user when a valid token is sent; continues as guest otherwise.
 * Also attaches role code so handlers can detect admin/seller without requiring authorize().
 */
const optionalAuthenticate = async (req, _res, next) => {
  try {
    const token = extractAuthToken(req.headers.authorization);
    if (!token) {
      return next();
    }

    const decoded = verifyAccess(token);
    if (decoded.type !== TOKEN_TYPES.ACCESS) {
      return next();
    }

    const user = await userModel.findUserById(decoded.userId);
    if (user?.is_active) {
      const roles = await userModel.getUserRoles(user.id);
      user.role = roles?.[0]?.code || null;
      req.user = user;
    }
    next();
  } catch {
    next();
  }
};

/**
 * Authorization middleware to check if user has required roles.
 * @param {...string} allowedRoles - List of allowed role codes
 */
const authorize = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(new AppError('Unauthorized', 401));
      }
      const roles = await userModel.getUserRoles(req.user.id);
      const userRoleCode = roles?.[0]?.code;
      if (!userRoleCode || !allowedRoles.includes(userRoleCode)) {
        return next(new AppError('Forbidden: Access denied', 403));
      }
      req.user.role = userRoleCode;
      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = {
  validate,
  sendOtpRules,
  verifyOtpRules,
  resendOtpRules,
  registerRules,
  refreshRules,
  logoutRules,
  authenticate,
  optionalAuthenticate,
  verifyRegistration,
  authorize,
};
