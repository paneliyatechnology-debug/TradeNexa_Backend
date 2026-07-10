const { body, validationResult } = require('express-validator');
const userModel = require('../models/userModel');
const locationModel = require('../models/locationModel');
const { AppError } = require('../utils/response');
const { ROLE_CODES } = require('../constants');

// ==========================================
// Validation patterns
// ==========================================

const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

// ==========================================
// Blocked body fields (must use file upload or cannot be changed)
// ==========================================

/** Reject a field if it appears in req.body. */
const blockedField = (field, label) =>
  body(field).custom((val) => {
    if (val !== undefined) throw new Error(`${label} cannot be updated`);
    return true;
  });

const blockedRules = [
  blockedField('mobile_number', 'Mobile number'),
  blockedField('role_id', 'Role'),
  blockedField('business_type_id', 'Business type'),
  blockedField('business_category_id', 'Business category'),
  blockedField('profile_image', 'Profile image'),
  blockedField('company_logo', 'Company logo'),
  blockedField('company_banner', 'Company banner'),
  blockedField('device_type', 'Device type'),
  blockedField('device_token', 'Device token'),
  blockedField('device', 'Device'),
  blockedField('complete_profile', 'complete_profile'),
  blockedField('is_completed_profile', 'is_completed_profile'),
  blockedField('country', 'country'),
  blockedField('state', 'state'),
  blockedField('city', 'city'),
];

const addressLocationRules = [
  body('address_line_1')
    .trim()
    .notEmpty()
    .withMessage('Address line 1 is required')
    .isLength({ min: 3, max: 255 })
    .withMessage('Address line 1 must be between 3 and 255 characters'),
  body('address_line_2').optional({ values: 'falsy' }).trim().isLength({ max: 255 }),
  body('pincode')
    .trim()
    .notEmpty()
    .withMessage('Pincode is required')
    .matches(PINCODE_REGEX)
    .withMessage('Invalid pincode'),
  body('country_id')
    .notEmpty()
    .withMessage('Country is required')
    .isInt({ min: 1 })
    .withMessage('country_id must be a positive integer'),
  body('state_id')
    .notEmpty()
    .withMessage('State is required')
    .isInt({ min: 1 })
    .withMessage('state_id must be a positive integer'),
  body('city_id')
    .notEmpty()
    .withMessage('City is required')
    .isInt({ min: 1 })
    .withMessage('city_id must be a positive integer'),
  body('city_id').custom(async (_cityId, { req }) => {
    const countryId = Number(req.body.country_id);
    const stateId = Number(req.body.state_id);
    const cityId = Number(req.body.city_id);

    const isValid = await locationModel.validateLocationIds(countryId, stateId, cityId);
    if (!isValid) {
      throw new Error('Invalid location — city must belong to the selected state and country');
    }
    return true;
  }),
];

// ==========================================
// Role-specific text field rules
// ==========================================

const industryRules = [
  body('industry')
    .trim()
    .notEmpty()
    .withMessage('Industry is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('Industry must be between 2 and 200 characters'),
];

const buyerProfileRules = [
  ...blockedRules,
  body('company_name').trim().notEmpty().withMessage('Company name is required').isLength({ min: 2, max: 200 }),
  ...industryRules,
  body('gst_number')
    .optional({ values: 'falsy' })
    .trim()
    .matches(GST_REGEX)
    .withMessage('Invalid GST number'),
  ...addressLocationRules,
];

const sellerProfileRules = [
  ...blockedRules,
  body('company_name').trim().notEmpty().withMessage('Company name is required').isLength({ min: 2, max: 200 }),
  body('gst_number')
    .trim()
    .notEmpty()
    .withMessage('GST number is required')
    .matches(GST_REGEX)
    .withMessage('Invalid GST number'),
  body('pan_number')
    .trim()
    .notEmpty()
    .withMessage('PAN number is required')
    .matches(PAN_REGEX)
    .withMessage('Invalid PAN number'),
  body('business_description')
    .trim()
    .notEmpty()
    .withMessage('Business description is required')
    .isLength({ min: 10 })
    .withMessage('Business description must be at least 10 characters'),
  body('cin').optional({ values: 'falsy' }).trim(),
  body('iec').optional({ values: 'falsy' }).trim(),
];

const buyerSellerProfileRules = [
  ...blockedRules,
  body('company_name').trim().notEmpty().withMessage('Company name is required').isLength({ min: 2, max: 200 }),
  ...industryRules,
  body('gst_number')
    .trim()
    .notEmpty()
    .withMessage('GST number is required')
    .matches(GST_REGEX)
    .withMessage('Invalid GST number'),
  body('pan_number')
    .trim()
    .notEmpty()
    .withMessage('PAN number is required')
    .matches(PAN_REGEX)
    .withMessage('Invalid PAN number'),
  body('business_description')
    .trim()
    .notEmpty()
    .withMessage('Business description is required')
    .isLength({ min: 10 })
    .withMessage('Business description must be at least 10 characters'),
  ...addressLocationRules,
  body('cin').optional({ values: 'falsy' }).trim(),
  body('iec').optional({ values: 'falsy' }).trim(),
];

const RULES_BY_ROLE = {
  [ROLE_CODES.BUYER]: buyerProfileRules,
  [ROLE_CODES.SELLER]: sellerProfileRules,
  [ROLE_CODES.BUYER_SELLER]: buyerSellerProfileRules,
};

// ==========================================
// Middleware
// ==========================================

/**
 * Role-based profile validation for multipart profile updates.
 * Image fields are optional — only text fields are enforced per role.
 */
const validateProfileUpdate = async (req, _res, next) => {
  try {
    const roles = await userModel.getUserRoles(req.user.id);
    const roleCode = roles?.[0]?.code;
    const rules = RULES_BY_ROLE[roleCode];

    if (!rules) {
      return next(new AppError('Profile completion is not available for this role', 400));
    }

    await Promise.all(rules.map((rule) => rule.run(req)));
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

    req.userRoleCode = roleCode;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { validateProfileUpdate };
