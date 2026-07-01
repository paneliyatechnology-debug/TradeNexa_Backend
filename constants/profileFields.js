const { ROLE_CODES } = require('./index');

/** Required image upload fields per marketplace role (shared by validation + profile service). */
const REQUIRED_IMAGE_FIELDS = {
  [ROLE_CODES.BUYER]: ['profile_image'],
  [ROLE_CODES.SELLER]: ['company_logo', 'company_banner'],
  [ROLE_CODES.BUYER_SELLER]: ['profile_image', 'company_logo', 'company_banner'],
};

module.exports = { REQUIRED_IMAGE_FIELDS };
