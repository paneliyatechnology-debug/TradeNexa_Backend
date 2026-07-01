const { body, validationResult } = require('express-validator');
const userModel = require('../models/userModel');
const { AppError } = require('../utils/response');
const { ROLE_CODES } = require('../constants');
const { REQUIRED_IMAGE_FIELDS } = require('../constants/profileFields');
const { IMAGE_FIELD_LABELS } = require('../utils/media');

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
  blockedField('profile_image', 'Profile image'),
  blockedField('company_logo', 'Company logo'),
  blockedField('company_banner', 'Company banner'),
  blockedField('device_type', 'Device type'),
  blockedField('device_token', 'Device token'),
  blockedField('device', 'Device'),
  blockedField('complete_profile', 'complete_profile'),
];

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
  body('address_line_1').trim().notEmpty().withMessage('Address is required').isLength({ min: 3, max: 255 }),
  body('country').trim().notEmpty().withMessage('Country is required'),
  body('address_line_2').optional({ values: 'falsy' }).trim(),
  body('state').optional({ values: 'falsy' }).trim(),
  body('city').optional({ values: 'falsy' }).trim(),
  body('pincode').optional({ values: 'falsy' }).trim().matches(PINCODE_REGEX).withMessage('Invalid pincode'),
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

const validateRequiredImages = (roleCode, files = {}, existingProfile = {}) => {
  const requiredFields = REQUIRED_IMAGE_FIELDS[roleCode] || [];
  return requiredFields
    .filter((field) => {
      const hasNewFile = Boolean(files[field]?.[0]);
      const hasExisting = Boolean(existingProfile?.[field]);
      return !hasNewFile && !hasExisting;
    })
    .map((field) => ({
      field,
      message: `${IMAGE_FIELD_LABELS[field] || field} is required`,
    }));
};

/**
 * Role-based profile validation for multipart profile updates.
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

    const existingProfile = await userModel.getCompanyDetails(req.user.id);

    const imageErrors = validateRequiredImages(roleCode, req.files, existingProfile);
    if (imageErrors.length) {
      return next(new AppError('Validation failed', 400, imageErrors));
    }

    req.userRoleCode = roleCode;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { validateProfileUpdate };
