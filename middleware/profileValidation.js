const { body, validationResult } = require('express-validator');
const userModel = require('../models/userModel');
const { AppError } = require('../utils/response');
const { ROLE_CODES } = require('../constants');

const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

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
  blockedField('device_type', 'Device type'),
  blockedField('device_token', 'Device token'),
  blockedField('device', 'Device'),
  blockedField('complete_profile', 'complete_profile'),
];

const imageUrl = (field, label) =>
  body(field)
    .trim()
    .notEmpty()
    .withMessage(`${label} is required`)
    .isURL()
    .withMessage(`Invalid ${label} URL`);

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
  imageUrl('profile_image', 'Profile image'),
  body('company_name').trim().notEmpty().withMessage('Company name is required').isLength({ min: 2, max: 200 }),
  ...industryRules,
  body('gst_number')
    .optional({ values: 'falsy' })
    .trim()
    .matches(GST_REGEX)
    .withMessage('Invalid GST number'),
  body('address_line_1').trim().notEmpty().withMessage('Address is required').isLength({ min: 3, max: 255 }),
  body('country').trim().notEmpty().withMessage('Country is required'),
  body('address_line_2').optional({ values: 'falsy' }).trim(),
  body('state').optional({ values: 'falsy' }).trim(),
  body('city').optional({ values: 'falsy' }).trim(),
  body('pincode').optional({ values: 'falsy' }).trim().matches(PINCODE_REGEX).withMessage('Invalid pincode'),
];

const sellerProfileRules = [
  ...blockedRules,
  imageUrl('company_logo', 'Company logo'),
  imageUrl('company_banner', 'Company banner'),
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
  imageUrl('profile_image', 'Profile image'),
  imageUrl('company_logo', 'Company logo'),
  imageUrl('company_banner', 'Company banner'),
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
  body('address_line_1').trim().notEmpty().withMessage('Address is required').isLength({ min: 3, max: 255 }),
  body('country').trim().notEmpty().withMessage('Country is required'),
  body('address_line_2').optional({ values: 'falsy' }).trim(),
  body('state').optional({ values: 'falsy' }).trim(),
  body('city').optional({ values: 'falsy' }).trim(),
  body('pincode').optional({ values: 'falsy' }).trim().matches(PINCODE_REGEX).withMessage('Invalid pincode'),
  body('cin').optional({ values: 'falsy' }).trim(),
  body('iec').optional({ values: 'falsy' }).trim(),
];

const RULES_BY_ROLE = {
  [ROLE_CODES.BUYER]: buyerProfileRules,
  [ROLE_CODES.SELLER]: sellerProfileRules,
  [ROLE_CODES.BUYER_SELLER]: buyerSellerProfileRules,
};

const REQUIRED_BY_ROLE = {
  [ROLE_CODES.BUYER]: [
    'profile_image',
    'company_name',
    'industry',
    'address_line_1',
    'country',
  ],
  [ROLE_CODES.SELLER]: [
    'company_logo',
    'company_banner',
    'company_name',
    'gst_number',
    'pan_number',
    'business_description',
  ],
  [ROLE_CODES.BUYER_SELLER]: [
    'profile_image',
    'company_logo',
    'company_banner',
    'company_name',
    'industry',
    'gst_number',
    'pan_number',
    'business_description',
    'address_line_1',
    'country',
  ],
};

const OPTIONAL_BY_ROLE = {
  [ROLE_CODES.BUYER]: ['gst_number', 'address_line_2', 'state', 'city', 'pincode'],
  [ROLE_CODES.SELLER]: ['cin', 'iec'],
  [ROLE_CODES.BUYER_SELLER]: ['address_line_2', 'state', 'city', 'pincode', 'cin', 'iec'],
};

const getProfileFieldsForRole = (roleCode) => {
  const required = REQUIRED_BY_ROLE[roleCode] || [];
  const optional = OPTIONAL_BY_ROLE[roleCode] || [];
  return [...required, ...optional];
};

const getRequiredFieldsForRole = (roleCode) => REQUIRED_BY_ROLE[roleCode] || [];

/**
 * Role-based profile validation — same style as register (all required fields must be sent).
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

module.exports = {
  validateProfileUpdate,
  getProfileFieldsForRole,
  getRequiredFieldsForRole,
  GST_REGEX,
  PAN_REGEX,
};
