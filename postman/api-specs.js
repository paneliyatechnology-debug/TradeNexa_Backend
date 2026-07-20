/**
 * API field specs for Postman collection enrichment.
 * Synced with middleware/resourceValidation.js and middleware/profileValidation.js
 */

const R = 'REQUIRED';
const O = 'OPTIONAL';
const FILE = 'FILE upload only — do not send as URL text';

const fieldTable = (rows) =>
  '\n\n| Field | Required | Type | Description |\n|-------|----------|------|-------------|\n' +
  rows.map(([f, req, type, desc]) => `| \`${f}\` | ${req} | ${type} | ${desc} |`).join('\n');

const queryTable = (rows) =>
  '\n\n| Query | Required | Description |\n|-------|----------|-------------|\n' +
  rows.map(([q, req, desc]) => `| \`${q}\` | ${req} | ${desc} |`).join('\n');

/** @type {Record<string, object>} keyed by "METHOD path/pattern" */
const SPECS = {
  'POST auth/send-otp': {
    description:
      'POST /auth/send-otp — Send OTP to mobile for login/registration.' +
      fieldTable([
        ['mobile_number', R, 'string', 'E.164 format with country code e.g. +919876543210'],
        ['recaptcha_token', O, 'string', 'Optional reCAPTCHA token'],
      ]),
    bodyRaw: {
      mobile_number: '+919876543210',
      recaptcha_token: '',
    },
  },
  'POST auth/verify-otp': {
    description:
      'POST /auth/verify-otp — Verify OTP. Returns access_token (existing user) or registration_token (new user).' +
      fieldTable([
        ['mobile_number', R, 'string', 'Same mobile used in send-otp'],
        ['otp', R, 'string', '6-digit OTP from SMS/Firebase'],
        ['firebase_verification_id', R, 'string', 'Firebase verification session ID'],
        ['device_type', O, 'string', 'android | ios | web'],
        ['device_token', O, 'string', 'FCM/push device token'],
      ]),
    bodyRaw: {
      mobile_number: '+919876543210',
      otp: '123456',
      firebase_verification_id: 'mock-verification-id',
      device_type: 'android',
      device_token: 'mock-device-token',
    },
  },
  'POST auth/resend-otp': {
    description:
      'POST /auth/resend-otp — Resend OTP.' +
      fieldTable([
        ['mobile_number', R, 'string', 'E.164 format'],
        ['firebase_verification_id', R, 'string', 'From prior send-otp response'],
        ['recaptcha_token', O, 'string', 'Optional reCAPTCHA'],
      ]),
    bodyRaw: {
      mobile_number: '+919876543210',
      firebase_verification_id: 'mock-verification-id',
    },
  },
  'POST auth/refresh-token': {
    description:
      'POST /auth/refresh-token — Get new access token.' +
      fieldTable([['refresh_token', R, 'string', 'Valid refresh token from login']]),
    bodyRaw: { refresh_token: '{{refresh_token}}' },
  },
  'POST auth/logout': {
    description:
      'POST /auth/logout — Invalidate refresh token. Requires Bearer access_token.' +
      fieldTable([['refresh_token', O, 'string', 'Refresh token to revoke']]),
    bodyRaw: { refresh_token: '{{refresh_token}}' },
  },
  'POST auth/register': {
    description:
      'POST /auth/register — Complete registration after OTP (Bearer registration_token).' +
      fieldTable([
        ['mobile_number', R, 'string', 'E.164 format — must match verified mobile'],
        ['full_name', R, 'string', '2-100 characters'],
        ['email', R, 'string', 'Valid email address'],
        ['role_id', R, 'integer', 'Role ID — buyer {{buyer_role_id}}, seller {{seller_role_id}}'],
        ['business_type_id', R, 'integer', 'From GET /business-types?role_id='],
        ['language_id', O, 'integer', 'Defaults to English if omitted'],
        ['device_type', O, 'string', 'android | ios | web'],
        ['device_token', O, 'string', 'Push notification token'],
      ]),
    bodyRaw: {
      mobile_number: '+919876543211',
      full_name: 'Jane Buyer',
      email: 'jane@example.com',
      role_id: '{{buyer_role_id}}',
      business_type_id: 1,
      language_id: 1,
      device_type: 'android',
      device_token: 'mock-device-token',
    },
  },
  'GET auth/profile': {
    description:
      'GET /auth/profile — Authenticated user profile.\n\nRequires Bearer `{{access_token}}`.\n\nResponse varies by role (buyer / seller / buyer_seller). Address includes `country_id`, `state_id`, `city_id` plus names.',
  },
  'GET locations/countries': {
    description:
      'GET /locations/countries — Paginated country list (public).' +
      queryTable([
        ['page', O, 'Page number (default 1)'],
        ['limit', O, 'Items per page 1-100 (default 10)'],
        ['search', O, 'Search name or code'],
        ['code', O, 'Exact country code e.g. IN'],
        ['is_active', O, 'true | false (default active only)'],
        ['sort_by', O, 'name | code | id | created_at'],
        ['sort_order', O, 'asc | desc'],
      ]),
  },
  'GET locations/states': {
    description:
      'GET /locations/states — States for a country (public).' +
      queryTable([
        ['country_id', R, 'Country ID from /locations/countries'],
        ['page', O, 'Page number'],
        ['limit', O, 'Items per page 1-100'],
        ['search', O, 'Search state name or code'],
        ['code', O, 'Exact state code e.g. GJ'],
        ['is_active', O, 'true | false'],
        ['sort_by', O, 'name | code | id | created_at'],
        ['sort_order', O, 'asc | desc'],
      ]),
  },
  'GET locations/cities': {
    description:
      'GET /locations/cities — Cities list (public). Omit `state_id` to return all cities.' +
      queryTable([
        ['state_id', O, 'Filter by state — omit to return all cities'],
        ['page', O, 'Page number'],
        ['limit', O, 'Items per page 1-100'],
        ['search', O, 'Search city name'],
        ['is_active', O, 'true | false'],
        ['sort_by', O, 'name | id | created_at'],
        ['sort_order', O, 'asc | desc'],
      ]),
  },
  'GET roles': {
    description:
      'GET /roles — List roles (public).' +
      queryTable([
        ['page', O, 'Page number'],
        ['limit', O, 'Items per page'],
        ['search', O, 'Search name/code'],
        ['is_active', O, 'true | false'],
        ['sort_by', O, 'id | name | code | is_active | created_at'],
        ['sort_order', O, 'asc | desc'],
      ]),
  },
  'GET business-types': {
    description:
      'GET /business-types — List business types.' +
      queryTable([
        ['role_id', O, 'Filter by role ID'],
        ['page', O, 'Page number'],
        ['limit', O, 'Items per page'],
        ['search', O, 'Search name'],
        ['is_active', O, 'true | false'],
        ['sort_by', O, 'id | name | code | is_active | created_at'],
        ['sort_order', O, 'asc | desc'],
      ]),
  },
  'GET sellers': {
    description:
      'GET /sellers — Paginated seller list. Optional Bearer: if the caller is a **seller** / **buyer_seller**, their own profile is excluded from results.' +
      queryTable([
        ['page', O, 'Page number'],
        ['limit', O, 'Items per page'],
        ['search', O, 'Search company name'],
        ['is_verified', O, 'true | false'],
        ['is_active', O, 'true | false'],
        ['sort_by', O, 'id | company_name | rating | response_rate | years_in_business | created_at'],
        ['sort_order', O, 'asc | desc'],
      ]),
  },
  'GET sellers/nearby': {
    description:
      'GET /sellers/nearby — Sellers near coordinates. Optional Bearer: authenticated sellers do not see themselves.' +
      queryTable([
        ['latitude', R, 'Latitude -90 to 90'],
        ['longitude', R, 'Longitude -180 to 180'],
        ['max_distance', O, 'Max distance in km'],
        ['page', O, 'Page number'],
        ['limit', O, 'Items per page'],
      ]),
  },
  'GET services/:id': {
    description: 'GET /services/:id — Single service detail by ID.',
  },
  'GET news/:id': {
    description: 'GET /news/:id — Single news article by ID.',
  },
};

// Multipart profile specs
SPECS['PUT auth/profile|buyer'] = {
  matchName: 'Update Buyer Profile',
  description:
    'PUT /auth/profile — Role: **buyer**\n\nContent-Type: `multipart/form-data`\n\nSets `is_completed_profile = true` on success.' +
    fieldTable([
      ['company_name', R, 'text', '2-200 chars'],
      ['industry', R, 'text', '2-200 chars'],
      ['gst_number', O, 'text', 'Valid GST format 15 chars'],
      ['address_line_1', R, 'text', '3-255 chars'],
      ['address_line_2', O, 'text', 'Max 255 chars'],
      ['pincode', R, 'text', '6-digit Indian pincode'],
      ['country_id', R, 'integer', 'From GET /locations/countries'],
      ['state_id', R, 'integer', 'From GET /locations/states?country_id='],
      ['city_id', R, 'integer', 'From GET /locations/cities?state_id='],
      ['profile_image', O, FILE, 'Buyer profile photo'],
    ]) +
    '\n\n**BLOCKED:** mobile_number, role_id, country/state/city name strings, profile_image as URL',
  formdata: [
    { key: 'profile_image', type: 'file', description: `${O} — ${FILE}`, src: [] },
    { key: 'company_name', value: 'ABC Retail Pvt Ltd', type: 'text', description: `${R} — 2-200 chars` },
    { key: 'industry', value: 'Electronics & Electrical', type: 'text', description: `${R} — 2-200 chars` },
    { key: 'gst_number', value: '24AAAAB1234C1Z1', type: 'text', description: `${O} — valid GST format` },
    { key: 'address_line_1', value: '123 Market Road, Navrangpura', type: 'text', description: `${R} — 3-255 chars` },
    { key: 'address_line_2', value: 'Near City Mall', type: 'text', description: `${O}` },
    { key: 'pincode', value: '380001', type: 'text', description: `${R} — 6-digit Indian pincode` },
    { key: 'country_id', value: '{{country_id}}', type: 'text', description: `${R} — from /locations/countries` },
    { key: 'state_id', value: '{{state_id}}', type: 'text', description: `${R} — from /locations/states` },
    { key: 'city_id', value: '{{city_id}}', type: 'text', description: `${R} — from /locations/cities` },
  ],
};

SPECS['PUT auth/profile|seller'] = {
  matchName: 'Update Seller Profile',
  description:
    'PUT /auth/profile — Role: **seller**\n\nContent-Type: `multipart/form-data`\n\nNo address fields for seller role.' +
    fieldTable([
      ['company_name', R, 'text', '2-200 chars'],
      ['gst_number', R, 'text', 'Valid GST format'],
      ['pan_number', R, 'text', 'Valid PAN format ABCDE1234F'],
      ['business_description', R, 'text', 'Min 10 chars'],
      ['cin', O, 'text', 'Company Identification Number'],
      ['iec', O, 'text', 'Import Export Code'],
      ['company_logo', O, FILE, 'Company logo'],
      ['company_banner', O, FILE, 'Company banner image'],
    ]),
  formdata: [
    { key: 'company_logo', type: 'file', description: `${O} — ${FILE}`, src: [] },
    { key: 'company_banner', type: 'file', description: `${O} — ${FILE}`, src: [] },
    { key: 'company_name', value: 'Super Manufacturer Ltd', type: 'text', description: `${R}` },
    { key: 'gst_number', value: '24AAAAB1234C1Z1', type: 'text', description: `${R} — GST format` },
    { key: 'pan_number', value: 'ABCDE1234F', type: 'text', description: `${R} — PAN format` },
    { key: 'business_description', value: 'We manufacture industrial equipment across India.', type: 'text', description: `${R} — min 10 chars` },
    { key: 'cin', value: 'U12345GJ2020PTC123456', type: 'text', description: `${O}` },
    { key: 'iec', value: '1234567890', type: 'text', description: `${O}` },
  ],
};

SPECS['PUT auth/profile|buyer_seller'] = {
  matchName: 'Update Buyer+Seller Profile',
  description:
    'PUT /auth/profile — Role: **buyer_seller**\n\nCombines buyer + seller fields. Content-Type: `multipart/form-data`.' +
    fieldTable([
      ['company_name', R, 'text', '2-200 chars'],
      ['industry', R, 'text', '2-200 chars'],
      ['gst_number', R, 'text', 'Valid GST'],
      ['pan_number', R, 'text', 'Valid PAN'],
      ['business_description', R, 'text', 'Min 10 chars'],
      ['address_line_1', R, 'text', '3-255 chars'],
      ['address_line_2', O, 'text', 'Max 255'],
      ['pincode', R, 'text', '6-digit Indian'],
      ['country_id', R, 'integer', 'From /locations/countries'],
      ['state_id', R, 'integer', 'From /locations/states'],
      ['city_id', R, 'integer', 'From /locations/cities'],
      ['cin', O, 'text', 'CIN'],
      ['iec', O, 'text', 'IEC'],
      ['profile_image', O, FILE, 'Profile photo'],
      ['company_logo', O, FILE, 'Logo'],
      ['company_banner', O, FILE, 'Banner'],
    ]),
  formdata: [
    { key: 'profile_image', type: 'file', description: `${O} — ${FILE}`, src: [] },
    { key: 'company_logo', type: 'file', description: `${O} — ${FILE}`, src: [] },
    { key: 'company_banner', type: 'file', description: `${O} — ${FILE}`, src: [] },
    { key: 'company_name', value: 'Trade Corp Industries', type: 'text', description: `${R}` },
    { key: 'industry', value: 'Industrial Machinery', type: 'text', description: `${R}` },
    { key: 'gst_number', value: '24AAAAB1234C1Z1', type: 'text', description: `${R}` },
    { key: 'pan_number', value: 'ABCDE1234F', type: 'text', description: `${R}` },
    { key: 'business_description', value: 'We buy and sell industrial goods across India.', type: 'text', description: `${R} — min 10 chars` },
    { key: 'address_line_1', value: '456 Industrial Estate, GIDC', type: 'text', description: `${R}` },
    { key: 'address_line_2', value: 'Phase 2, Block B', type: 'text', description: `${O}` },
    { key: 'pincode', value: '390001', type: 'text', description: `${R}` },
    { key: 'country_id', value: '{{country_id}}', type: 'text', description: `${R}` },
    { key: 'state_id', value: '{{state_id}}', type: 'text', description: `${R}` },
    { key: 'city_id', value: '{{city_id}}', type: 'text', description: `${R}` },
    { key: 'cin', value: 'U67890GJ2019PTC654321', type: 'text', description: `${O}` },
    { key: 'iec', value: '0987654321', type: 'text', description: `${O}` },
  ],
};

// Admin auth
SPECS['POST admin/auth/login'] = {
  description:
    'POST /admin/auth/login — Admin panel login.' +
    fieldTable([
      ['email', R, 'string', 'Admin email'],
      ['password', R, 'string', 'Admin password'],
    ]),
  bodyRaw: { email: 'admin@tradenexa.com', password: 'your_password' },
};

SPECS['POST admin/auth/register'] = {
  description:
    'POST /admin/auth/register — Create admin user (super_admin only).' +
    fieldTable([
      ['full_name', R, 'string', '2-100 chars'],
      ['email', R, 'string', 'Valid email'],
      ['password', R, 'string', 'Min 8 chars'],
      ['role_id', R, 'integer', 'admin | super_admin | supporter role ID'],
    ]),
  bodyRaw: {
    full_name: 'Admin User',
    email: 'admin@tradenexa.com',
    password: 'SecurePass123!',
    role_id: 1,
  },
};

// Business type CRUD
SPECS['POST business-types'] = {
  description:
    'POST /business-types — Admin only.' +
    fieldTable([
      ['name', R, 'string', '2-100 chars'],
      ['code', O, 'string', 'Max 50 chars — auto-generated if omitted'],
      ['role_id', R, 'integer', 'buyer | seller | buyer_seller role ID'],
      ['is_active', O, 'boolean', 'Default true'],
    ]),
  bodyRaw: { name: 'Retailer', code: 'retailer', role_id: '{{buyer_role_id}}', is_active: true },
};

SPECS['PUT business-types/:id'] = {
  description:
    'PUT /business-types/:id — Admin only. All fields optional on update.' +
    fieldTable([
      ['name', O, 'string', '2-100 chars'],
      ['code', O, 'string', 'Max 50 chars'],
      ['role_id', O, 'integer', 'Role ID'],
      ['is_active', O, 'boolean', 'Active flag'],
    ]),
  bodyRaw: { name: 'Updated Retailer', is_active: true },
};

// Brand
SPECS['POST brands'] = {
  description:
    'POST /brands — Admin only. multipart/form-data.' +
    fieldTable([
      ['name', R, 'text', '2-100 chars — slug auto-generated'],
      ['description', R, 'text', '10-2000 chars'],
      ['country', R, 'text', '2-100 chars e.g. India'],
      ['website', O, 'text', 'Max 500 chars URL'],
      ['logo', O, FILE, 'Brand logo image'],
      ['is_popular', O, 'boolean', 'Popular brand flag'],
      ['is_featured', O, 'boolean', 'Featured on home'],
      ['is_active', O, 'boolean', 'Default true'],
    ]),
};

SPECS['PUT brands/:id'] = {
  description:
    'PUT /brands/:id — Admin only. multipart/form-data. All fields optional on update.' +
    fieldTable([
      ['name', O, 'text', '2-100 chars'],
      ['description', O, 'text', '10-2000 chars'],
      ['country', O, 'text', '2-100 chars'],
      ['website', O, 'text', 'Max 500 chars'],
      ['logo', O, FILE, 'Replace logo'],
      ['is_popular', O, 'boolean', ''],
      ['is_featured', O, 'boolean', ''],
      ['is_active', O, 'boolean', ''],
    ]),
};

// Offer
SPECS['POST offers'] = {
  description:
    'POST /offers — Admin only. multipart/form-data.' +
    fieldTable([
      ['title', R, 'text', '2-200 chars'],
      ['discount', R, 'number', 'Discount value (percentage or amount)'],
      ['expiry_date', R, 'ISO8601', 'Offer expiry datetime'],
      ['banner', O, FILE, 'Offer banner image'],
      ['is_active', O, 'boolean', 'Default true'],
    ]),
};

// Service
SPECS['POST services'] = {
  description:
    'POST /services — Admin only. multipart/form-data.' +
    fieldTable([
      ['name', R, 'text', '2-100 chars'],
      ['description', O, 'text', 'Service description'],
      ['icon', O, FILE, 'Service icon image'],
      ['is_active', O, 'boolean', 'Default true'],
    ]),
};

SPECS['PUT services/:id'] = {
  description:
    'PUT /services/:id — Admin only.' +
    fieldTable([
      ['name', O, 'text', '2-100 chars'],
      ['description', O, 'text', ''],
      ['icon', O, FILE, ''],
      ['is_active', O, 'boolean', ''],
    ]),
};

// News
SPECS['POST news'] = {
  description:
    'POST /news — Admin only. multipart/form-data.' +
    fieldTable([
      ['title', R, 'text', '2-200 chars'],
      ['content', R, 'text', 'Article HTML/text content'],
      ['thumbnail', O, FILE, 'Cover image'],
      ['published_at', O, 'ISO8601', 'Publish datetime'],
      ['is_active', O, 'boolean', ''],
    ]),
};

// Wishlist
SPECS['POST wishlist'] = {
  description:
    'POST /wishlist — Add product to wishlist (buyer).' +
    fieldTable([['product_id', R, 'integer', 'Active product ID']]),
  bodyRaw: { product_id: '{{product_id}}' },
};

SPECS['POST wishlist/toggle'] = {
  description:
    'POST /wishlist/toggle — Toggle wishlist (recommended).' +
    fieldTable([['product_id', R, 'integer', 'Adds if absent, removes if present']]),
  bodyRaw: { product_id: '{{product_id}}' },
};

// Chat
SPECS['GET chats/conversations'] = {
  description:
    'GET /chats/conversations — Inbox: **one conversation per buyer↔seller pair**.' +
    queryTable([
      ['page', O, ''],
      ['limit', O, ''],
      ['search', O, 'Other user name / company / last message / context title'],
      ['role', O, 'buyer | seller'],
      ['sort_by', O, 'last_message_at | created_at | updated_at'],
      ['sort_order', O, 'asc | desc'],
    ]) +
    '\n\nEach result includes `conversation_id`, `user` (other party), `last_message`, `last_message_at`, `last_message_sender_id`, `unread_count`, `last_context` `{ type, id, title }` (type: product | rfq | enquiry).',
};

SPECS['POST chats/conversations'] = {
  description:
    'POST /chats/conversations — Continue the shared buyer↔seller thread for an RFQ or inquiry. Does **not** create a second conversation if one already exists for the pair. Updates `last_context`.' +
    fieldTable([
      ['rfq_id', O, 'integer', 'RFQ context (xor with inquiry_id)'],
      ['inquiry_id', O, 'integer', 'Inquiry context (xor with rfq_id)'],
      ['seller_id', O, 'integer', 'Required for buyer/admin on RFQ only'],
    ]),
  bodyRaw: { inquiry_id: '{{inquiry_id}}' },
};

SPECS['GET chats/conversations/:id'] = {
  description:
    'GET /chats/conversations/:id — Chat screen payload.\n\nReturns `{ conversation, context, messages }`. Marks unread messages as read by default (`mark_read=false` to skip). Pass `messages=false` for conversation+context only.\n\nEach message includes `is_read` and `read_at`.' +
    queryTable([
      ['page', O, 'Messages page'],
      ['limit', O, 'Messages page size (default 20)'],
      ['mark_read', O, 'true | false (default true)'],
      ['messages', O, 'true | false (default true)'],
      ['before_id', O, 'Cursor'],
      ['after_id', O, 'Cursor'],
      ['order', O, 'asc | desc'],
    ]),
};

SPECS['POST chats/conversations/:id/messages'] = {
  description:
    'POST /chats/conversations/:id/messages — Send message.' +
    fieldTable([
      ['message_type', R, 'enum', 'TEXT | PRODUCT | QUOTATION'],
      ['content', 'conditional', 'string', 'Required for TEXT'],
      ['product_id', 'conditional', 'integer', 'Required for PRODUCT'],
      ['quotation_id', 'conditional', 'integer', 'Required for QUOTATION'],
      ['reply_to_message_id', O, 'integer', 'Reply to message ID'],
    ]),
  bodyRaw: { message_type: 'TEXT', content: 'Hello, can you share best price for 500 units?' },
};

SPECS['POST chats/conversations/:id/read'] = {
  description:
    'POST /chats/conversations/:id/read — Mark conversation read.' +
    fieldTable([['last_read_message_id', O, 'integer', 'Defaults to latest message']]),
  bodyRaw: { last_read_message_id: '{{message_id}}' },
};

// RFQ quotations
SPECS['POST rfqs/:id/quotations'] = {
  description:
    'POST /rfqs/:id/quotations — Seller submit quotation.' +
    fieldTable([
      ['price', R, 'number', 'Unit price — positive'],
      ['quantity', O, 'integer', 'Min 1'],
      ['unit', O, 'string', 'Max 50 chars e.g. pcs'],
      ['gst_percentage', O, 'number', 'GST %'],
      ['transportation_charge', O, 'number', ''],
      ['delivery_days', O, 'integer', ''],
      ['payment_terms', O, 'string', 'Max 200 chars'],
      ['validity_days', O, 'integer', 'Quotation validity in days'],
      ['remarks', O, 'string', 'Additional notes'],
    ]),
  bodyRaw: {
    price: 420,
    quantity: 500,
    unit: 'pcs',
    gst_percentage: 18,
    transportation_charge: 5000,
    delivery_days: 7,
    payment_terms: '50% advance, 50% on delivery',
    validity_days: 30,
    remarks: 'Price inclusive of packaging',
  },
};

SPECS['POST rfqs/quotations/:id/request-revision'] = {
  description:
    'POST /rfqs/quotations/:quotationId/request-revision — Buyer requests seller to revise quotation.' +
    fieldTable([['remarks', R, 'string', 'Why revision is needed (min 1 char)']]),
  bodyRaw: { remarks: 'Please revise price for bulk 500 units with GST included.' },
};

SPECS['POST rfqs/quotations/:id/revise'] = {
  description:
    'POST /rfqs/quotations/:quotationId/revise — Seller submits revised quotation (same fields as update).' +
    fieldTable([
      ['price', O, 'number', 'Revised unit price'],
      ['quantity', O, 'integer', ''],
      ['unit', O, 'string', ''],
      ['gst_percentage', O, 'number', ''],
      ['transportation_charge', O, 'number', ''],
      ['delivery_days', O, 'integer', ''],
      ['payment_terms', O, 'string', ''],
      ['validity_days', O, 'integer', ''],
      ['remarks', O, 'string', ''],
    ]),
  bodyRaw: {
    price: 410,
    quantity: 500,
    gst_percentage: 18,
    remarks: 'Revised price after negotiation',
  },
};

// ── Categories ──────────────────────────────────────────────────────────────
SPECS['POST categories'] = {
  description:
    'POST /categories — Admin. multipart/form-data.' +
    fieldTable([
      ['name', R, 'text', '2-100 chars'],
      ['icon', R, FILE, 'Category icon image'],
      ['image', O, FILE, 'Category banner image'],
      ['slug', O, 'text', 'a-z0-9-_ only — auto if omitted'],
      ['is_active', O, 'boolean', 'Default true'],
    ]),
};

SPECS['PUT categories/:id'] = {
  description:
    'PUT /categories/:id — Admin. All fields optional on update.' +
    fieldTable([
      ['name', O, 'text', '2-100 chars'],
      ['icon', O, FILE, 'Replace icon'],
      ['image', O, FILE, 'Replace image'],
      ['slug', O, 'text', 'URL slug'],
      ['is_active', O, 'boolean', ''],
    ]),
};

SPECS['GET categories'] = {
  description:
    'GET /categories — Paginated main categories.' +
    queryTable([
      ['page', O, 'Page number'],
      ['limit', O, '1-100'],
      ['search', O, 'Search name'],
      ['slug', O, 'Filter by slug'],
      ['is_active', O, 'true | false'],
      ['sort_by', O, 'id | name | slug | is_active | subcategory_count | product_count'],
      ['sort_order', O, 'asc | desc'],
    ]),
};

// ── Products ────────────────────────────────────────────────────────────────
SPECS['GET products'] = {
  description:
    'GET /products — Public product list (**approved + active only**). Optional Bearer for `is_wishlist`, `is_inquiry_sent`, `conversation_id`.\n\n' +
    '**Search history:** When authenticated and `search` has ≥ 2 non-empty characters, the keyword is saved/updated in product search history (max 20). Guest / short / empty search → no history write. Response shape is unchanged.' +
    queryTable([
      ['page', O, 'Page number'],
      ['limit', O, '1-100'],
      ['search', O, 'Search name, tags — also records history when auth + length ≥ 2'],
      ['category_id', O, 'Filter by category'],
      ['subcategory_id', O, 'Filter by subcategory'],
      ['city_id', O, 'Filter by seller primary address city — from GET /locations/cities'],
      ['seller_id', O, 'Exclude products created by this seller (hide own listings)'],
      ['brand_id', O, 'Filter by brand'],
      ['min_price', O, 'Minimum price'],
      ['max_price', O, 'Maximum price'],
      ['is_active', O, 'true | false (default active)'],
      ['is_wishlist', O, 'true | false — requires auth'],
      ['sort_by', O, 'id | name | price | rating | moq | created_at | seller_name'],
      ['sort_order', O, 'asc | desc'],
    ]),
};

SPECS['GET products/search-history'] = {
  description:
    'GET /products/search-history — Paginated product search keywords for the logged-in user (newest first). Max 20 stored per user.\n\n' +
    'Auth required. Response `data`: `{ results: [{ id, keyword, searched_at }], pagination }`.\n\n' +
    'History is recorded only from authenticated `GET /products?search=…` (keyword ≥ 2 chars).' +
    queryTable([
      ['page', O, 'Page number (default 1)'],
      ['limit', O, 'Items per page 1–100 (default 10)'],
    ]),
};

SPECS['DELETE products/search-history/:id'] = {
  description:
    'DELETE /products/search-history/:id — Delete one search-history row owned by the logged-in user.\n\n' +
    '| Path | Required | Description |\n|-------|----------|-------------|\n| `id` | REQUIRED | Search history row id |',
};

SPECS['DELETE products/search-history'] = {
  description:
    'DELETE /products/search-history — Delete **all** product search history for the logged-in user only.',
};

SPECS['GET products/my'] = {
  description:
    'GET /products/my — Seller own products (all approval statuses). Includes `approval_status`, remarks, review timestamps.' +
    queryTable([
      ['page', O, 'Page number'],
      ['limit', O, '1-100'],
      ['search', O, 'Search'],
      ['category_id', O, 'Category filter'],
      ['subcategory_id', O, 'Subcategory filter'],
      ['approval_status', O, 'in_review | revision_required | approved | rejected'],
      ['is_active', O, 'true | false — default shows all'],
      ['sort_by', O, 'id | name | price | rating | created_at | submitted_at'],
      ['sort_order', O, 'asc | desc'],
    ]),
};

SPECS['GET products/trending'] = {
  description: 'GET /products/trending — Trending products.' + queryTable([
    ['page', O, ''], ['limit', O, ''], ['category_id', O, ''], ['subcategory_id', O, ''],
    ['city_id', O, 'Filter by seller primary address city'],
    ['seller_id', O, 'Exclude products created by this seller'],
    ['brand_id', O, ''], ['min_price', O, ''], ['max_price', O, ''],
    ['is_wishlist', O, 'Requires auth'], ['sort_by', O, ''], ['sort_order', O, ''],
  ]),
};

SPECS['GET products/related'] = {
  description:
    'GET /products/related — Related products by subcategory.' +
    queryTable([
      ['subcategory_id', R, 'Subcategory ID'],
      ['product_id', O, 'Exclude this product from results'],
      ['city_id', O, 'Filter by seller primary address city'],
      ['seller_id', O, 'Exclude products created by this seller'],
      ['page', O, ''], ['limit', O, ''],
    ]),
};

SPECS['DELETE products/:id/media'] = {
  description:
    'DELETE /products/:id/media — Remove product gallery images/videos.' +
    fieldTable([
      ['image_ids', O, 'integer[]', 'Product image IDs to delete'],
      ['video_ids', O, 'integer[]', 'Product video IDs to delete'],
    ]) + '\n\nAt least one of `image_ids` or `video_ids` required.',
  bodyRaw: { image_ids: [1, 2], video_ids: [] },
};

// ── Brands list ─────────────────────────────────────────────────────────────
SPECS['GET brands'] = {
  description:
    'GET /brands — Paginated brand list.' +
    queryTable([
      ['page', O, ''], ['limit', O, ''], ['search', O, 'Search name'],
      ['country', O, 'Filter by country name'],
      ['is_popular', O, 'true | false'],
      ['is_featured', O, 'true | false'],
      ['is_active', O, 'true | false'],
      ['sort_by', O, 'id | name | slug | country | is_popular | is_featured | created_at'],
      ['sort_order', O, 'asc | desc'],
    ]),
};

// ── Offers list ─────────────────────────────────────────────────────────────
SPECS['GET offers'] = {
  description:
    'GET /offers — Paginated offers.' +
    queryTable([
      ['page', O, ''], ['limit', O, ''], ['search', O, ''],
      ['is_active', O, 'true | false'],
      ['include_expired', O, 'true | false'],
      ['sort_by', O, 'id | title | discount | expiry_date | created_at'],
      ['sort_order', O, 'asc | desc'],
    ]),
};

// ── RFQ ───────────────────────────────────────────────────────────────────────
SPECS['GET rfqs'] = {
  description:
    'GET /rfqs — Public RFQ list. Optional Bearer hides own RFQs (`buyer_id` from JWT). Each item includes buyer `company` (`company_name`, `company_logo`, `industry`, `gst_number`) or `null`.' +
    queryTable([
      ['page', O, ''], ['limit', O, ''], ['search', O, 'Title, RFQ number, product, buyer name, company name, city'],
      ['category_id', O, ''], ['subcategory_id', O, ''],
      ['city', O, ''], ['state', O, ''], ['country', O, ''],
      ['status', O, 'DRAFT | OPEN | PUBLISHED | CLOSED | AWARDED | CANCELLED etc'],
      ['min_budget', O, ''], ['max_budget', O, ''],
      ['date_from', O, 'ISO8601'], ['date_to', O, 'ISO8601'],
      ['sort_by', O, 'id | created_at | quotation_deadline | expected_price | total_quotations | title | budget | quantity | category | city'],
      ['sort_order', O, 'asc | desc'],
    ]),
};

SPECS['POST rfqs'] = {
  description:
    'POST /rfqs — Create RFQ in DRAFT (buyer/buyer_seller/admin).' +
    fieldTable([
      ['title', R, 'string', '2-200 chars'],
      ['category_id', R, 'integer', 'Category ID'],
      ['subcategory_id', R, 'integer', 'Subcategory ID'],
      ['description', R, 'string', 'Min 10 chars'],
      ['quantity', R, 'integer', 'Min 1'],
      ['unit', R, 'string', 'pcs | kg | ton etc max 50 chars'],
      ['quotation_deadline', R, 'ISO8601', 'Deadline for quotations'],
      ['address_line_1', R, 'string', '3-255 chars'],
      ['address_line_2', O, 'string', ''],
      ['city', R, 'string', 'City name'],
      ['state', R, 'string', 'State name'],
      ['country', R, 'string', 'Country name'],
      ['pincode', R, 'string', '6-digit Indian pincode'],
      ['product_id', O, 'integer', 'Linked product'],
      ['expected_price', O, 'number', 'Per unit expected price'],
      ['budget', O, 'number', 'Total budget'],
      ['currency', O, 'string', 'Default INR'],
      ['required_before', O, 'ISO8601', 'Delivery required by'],
      ['payment_terms', O, 'string', 'Max 200 chars'],
      ['visibility', O, 'enum', 'PUBLIC | PRIVATE (default PUBLIC)'],
      ['seller_ids', O, 'integer[]', 'Invite specific sellers for PRIVATE'],
    ]),
  bodyRaw: {
    title: 'Bulk order of Industrial Steel Pipes',
    category_id: '{{category_id}}',
    subcategory_id: '{{subcategory_id}}',
    description: 'Need 500 units of 2-inch GI pipes. ISI certified preferred.',
    quantity: 500,
    unit: 'pcs',
    quotation_deadline: '2026-08-30T00:00:00.000Z',
    address_line_1: '123 Industrial Estate, GIDC',
    address_line_2: 'Near Ring Road',
    city: 'Ahmedabad',
    state: 'Gujarat',
    country: 'India',
    pincode: '380001',
    product_id: '{{product_id}}',
    expected_price: 450,
    budget: 225000,
    currency: 'INR',
    required_before: '2026-09-15T00:00:00.000Z',
    payment_terms: '50% advance, 50% on delivery',
    visibility: 'PUBLIC',
    seller_ids: [2, 3],
  },
};

SPECS['PUT rfqs/:id'] = {
  description: 'PUT /rfqs/:id — Update DRAFT RFQ. All fields optional.' + fieldTable([
    ['title', O, 'string', '2-200 chars'],
    ['category_id', O, 'integer', ''],
    ['subcategory_id', O, 'integer', ''],
    ['description', O, 'string', 'Min 10 chars'],
    ['quantity', O, 'integer', ''],
    ['unit', O, 'string', ''],
    ['address_line_1', O, 'string', ''],
    ['city', O, 'string', ''],
    ['state', O, 'string', ''],
    ['country', O, 'string', ''],
    ['pincode', O, 'string', ''],
    ['visibility', O, 'enum', 'PUBLIC | PRIVATE'],
    ['seller_ids', O, 'array', ''],
  ]),
};

// ── Chat GET ────────────────────────────────────────────────────────────────
SPECS['GET chats/conversations'] = {
  description:
    'GET /chats/conversations — Inbox.' +
    queryTable([
      ['page', O, ''], ['limit', O, ''],
      ['role', O, 'buyer | seller — filter by side'],
      ['rfq_id', O, 'Filter by RFQ'],
      ['search', O, 'RFQ title or company name'],
      ['sort_by', O, 'last_message_at | created_at | updated_at'],
      ['sort_order', O, 'asc | desc'],
    ]),
};

SPECS['GET chats/conversations/:id/messages'] = {
  description:
    'GET /chats/conversations/:id/messages — Message history.' +
    queryTable([
      ['page', O, ''], ['limit', O, ''],
      ['before_id', O, 'Cursor — messages before ID'],
      ['after_id', O, 'Cursor — messages after ID'],
      ['order', O, 'asc | desc'],
    ]),
};

SPECS['GET chats/unread-summary'] = {
  description: 'GET /chats/unread-summary — Badge counts: total, as_buyer, as_seller.',
};

SPECS['GET wishlist'] = {
  description:
    'GET /wishlist — Paginated wishlist (buyer).' +
    queryTable([
      ['page', O, ''], ['limit', O, ''], ['search', O, 'Search product name'],
      ['sort_by', O, 'wishlisted_at | id | name | price | rating | created_at'],
      ['sort_order', O, 'asc | desc'],
    ]),
};

// ── Admin users (matchName — shared route) ───────────────────────────────────
const adminCreateUserDesc =
  'POST /admin/auth/users — Create admin panel user.\n\n**Auth:** Bearer `{{admin_token}}` (admin or super_admin).' +
  fieldTable([
    ['full_name', R, 'string', '2-100 characters'],
    ['email', R, 'string', 'Unique valid email'],
    ['password', R, 'string', 'Min 8 chars — uppercase, lowercase, number, special char'],
    ['role_id', R, 'integer', 'Admin panel role ID — admin | super_admin | supporter'],
  ]);

SPECS['POST admin/auth/users|admin'] = {
  matchName: 'Create Admin User',
  description: adminCreateUserDesc + '\n\nUse `{{admin_role_id}}` for standard admin.',
  descriptionOnly: true,
};
SPECS['POST admin/auth/users|super'] = {
  matchName: 'Create Super Admin User',
  description: adminCreateUserDesc + '\n\nUse `{{super_admin_role_id}}`.',
  descriptionOnly: true,
};
SPECS['POST admin/auth/users|supporter'] = {
  matchName: 'Create Supporter User',
  description: adminCreateUserDesc + '\n\nUse `{{supporter_role_id}}`.',
  descriptionOnly: true,
};

// ── Business types ───────────────────────────────────────────────────────────
SPECS['GET business-types/:id'] = {
  description: 'GET /business-types/:id — Single business type by ID.',
};
SPECS['DELETE business-types/:id'] = {
  description: 'DELETE /business-types/:id — Admin only. Soft-deletes business type.',
};

// ── Categories detail & subcategories ──────────────────────────────────────
SPECS['GET categories/:id'] = {
  description:
    'GET /categories/:id — Category detail with nested subcategories list.\n\n**Path:** `:id` — Category ID.',
};
SPECS['PUT categories/:id'] = {
  description:
    'PUT /categories/:id — Admin. multipart/form-data. All fields optional on update.' +
    fieldTable([
      ['name', O, 'text', '2-100 chars'],
      ['icon', O, FILE, 'Replace category icon'],
      ['image', O, FILE, 'Replace banner image'],
      ['slug', O, 'text', 'a-z0-9-_ only'],
      ['is_active', O, 'boolean', ''],
    ]),
  descriptionOnly: true,
};
SPECS['DELETE categories/:id'] = {
  description: 'DELETE /categories/:id — Admin only. Deletes category (must have no products).',
};
SPECS['GET categories/:id/subcategories'] = {
  description:
    'GET /categories/:categoryId/subcategories — Paginated subcategories for a category.' +
    queryTable([
      ['page', O, 'Page number'],
      ['limit', O, '1-100'],
      ['search', O, 'Search name'],
      ['is_active', O, 'true | false'],
      ['sort_by', O, 'id | name | slug | is_active | product_count'],
      ['sort_order', O, 'asc | desc'],
    ]),
};
SPECS['GET categories/:id/subcategories/:id'] = {
  description: 'GET /categories/:categoryId/subcategories/:id — Single subcategory detail.',
};
SPECS['POST categories/:id/subcategories'] = {
  description:
    'POST /categories/:categoryId/subcategories — Admin. multipart/form-data.' +
    fieldTable([
      ['name', R, 'text', '2-100 chars'],
      ['icon', R, FILE, 'Subcategory icon'],
      ['image', O, FILE, 'Banner image'],
      ['slug', O, 'text', 'Auto-generated if omitted'],
      ['is_active', O, 'boolean', 'Default true'],
    ]),
  descriptionOnly: true,
};
SPECS['PUT categories/:id/subcategories/:id'] = {
  description:
    'PUT /categories/:categoryId/subcategories/:id — Admin. All fields optional.' +
    fieldTable([
      ['name', O, 'text', '2-100 chars'],
      ['icon', O, FILE, 'Replace icon'],
      ['image', O, FILE, 'Replace image'],
      ['slug', O, 'text', ''],
      ['is_active', O, 'boolean', ''],
    ]),
  descriptionOnly: true,
};
SPECS['DELETE categories/:id/subcategories/:id'] = {
  description: 'DELETE /categories/:categoryId/subcategories/:id — Admin only.',
};

// ── Banners ──────────────────────────────────────────────────────────────────
SPECS['GET banners'] = {
  description:
    'GET /banners — Paginated home banners (public).' +
    queryTable([
      ['page', O, ''], ['limit', O, ''], ['search', O, 'Search title'],
      ['is_active', O, 'true | false'],
      ['redirect_type', O, 'category | product | offer | brand | url'],
      ['sort_by', O, 'id | title | priority | is_active | created_at'],
      ['sort_order', O, 'asc | desc'],
    ]),
};
SPECS['GET banners/:id'] = {
  description: 'GET /banners/:id — Single banner detail.',
};
SPECS['POST banners'] = {
  description:
    'POST /banners — Admin. multipart/form-data.' +
    fieldTable([
      ['title', R, 'text', '2-200 chars'],
      ['image', R, FILE, 'Banner image'],
      ['redirect_type', O, 'enum', 'category | product | offer | brand | url'],
      ['redirect_id', O, 'integer', 'Target entity ID for redirect'],
      ['priority', O, 'integer', 'Display order — lower = higher priority'],
      ['is_active', O, 'boolean', 'Default true'],
    ]),
  descriptionOnly: true,
};
SPECS['PUT banners/:id'] = {
  description:
    'PUT /banners/:id — Admin. All fields optional.' +
    fieldTable([
      ['title', O, 'text', '2-200 chars'],
      ['image', O, FILE, 'Replace banner image'],
      ['redirect_type', O, 'enum', 'category | product | offer | brand | url'],
      ['redirect_id', O, 'integer', ''],
      ['priority', O, 'integer', ''],
      ['is_active', O, 'boolean', ''],
    ]),
  descriptionOnly: true,
};
SPECS['DELETE banners/:id'] = {
  description: 'DELETE /banners/:id — Admin only.',
};

// ── Products detail & mutations ──────────────────────────────────────────────
SPECS['GET products/:id'] = {
  description:
    'GET /products/:id — Product detail. Buyers only see **approved** products (404 otherwise). Owner/admin can view any status.\n\nOptional Bearer token adds `is_wishlist`.\n\nIncludes `approval` block (status, remarks, review_version, timestamps).',
  descriptionOnly: true,
};
SPECS['POST products|create'] = {
  matchName: 'Create Product',
  description:
    'POST /products — Seller/admin. multipart/form-data. Creates with `approval_status=in_review` (not public until admin approves). `seller_id` is taken from JWT (not from body).' +
    fieldTable([
      ['name', R, 'text', '2-200 chars'],
      ['category_id', R, 'integer', ''],
      ['subcategory_id', R, 'integer', ''],
      ['brand_id', R, 'integer', ''],
      ['short_description', R, 'text', '10-500 chars'],
      ['thumbnail', R, FILE, 'Main product image'],
      ['image', O, FILE, 'Gallery images — repeat field'],
      ['video', O, FILE, 'Product videos'],
      ['price', R, 'number', 'Unit price ≥ 0'],
      ['currency', R, 'text', 'e.g. INR'],
      ['moq', R, 'integer', 'Min order qty ≥ 1'],
      ['unit', R, 'text', 'pcs | kg etc'],
      ['material', R, 'text', 'Max 150 chars'],
      ['country_of_origin', R, 'text', ''],
      ['product_condition', R, 'enum', 'NEW | USED | REFURBISHED'],
      ['stock_status', R, 'enum', 'IN_STOCK | OUT_OF_STOCK | LIMITED | MADE_TO_ORDER'],
      ['show_price', R, 'boolean', 'true | false'],
      ['accept_inquiry', R, 'boolean', 'true | false'],
      ['is_active', R, 'boolean', 'Seller active flag (separate from approval)'],
      ['description', O, 'text', 'Max 5000 chars'],
      ['warranty', O, 'text', ''],
      ['stock_quantity', O, 'integer', ''],
      ['hsn_code', O, 'text', ''],
      ['gst_percentage', O, 'number', '0-100'],
      ['search_tags', O, 'string/array', 'Comma-separated or JSON array'],
      ['specifications', O, 'JSON', 'Array of {label, value}'],
      ['slug', O, 'text', ''],
      ['is_trending', O, 'boolean', ''],
      ['rating', O, 'number', '0-5'],
    ]),
  descriptionOnly: true,
};
SPECS['PUT products/:id'] = {
  description:
    'PUT /products/:id — Seller (own) or admin. Rejected products cannot be updated. `seller_id` is taken from JWT / existing owner (not from body).\n\n' +
    '**Approval:**\n' +
    '- `revision_required` → successful update auto-resubmits to `in_review` (bumps `review_version`).\n' +
    '- Material edits / media on **approved** products auto-send back to `in_review`.\n' +
    '- Soft edits on approved (e.g. stock, is_active) keep `approved`.\n\n' +
    'Gallery limit: existing + new ≤ 10.' +
    fieldTable([
      ['name', O, 'text', '2-200 chars'],
      ['category_id', O, 'integer', ''],
      ['subcategory_id', O, 'integer', ''],
      ['brand_id', O, 'integer', ''],
    ]),
  descriptionOnly: true,
};

SPECS['GET products/:id/reviews'] = {
  description:
    'GET /products/:id/reviews — Append-only review history (seller owner or admin).' +
    queryTable([['page', O, ''], ['limit', O, '']]),
};
SPECS['GET products/admin/reviews'] = {
  description:
    'GET /products/admin/reviews — Admin moderation queue. Uses standard `sort_by` / `sort_order` (same as product list). Default: `submitted_at` desc.' +
    queryTable([
      ['approval_status', O, 'in_review (default) | revision_required | approved | rejected | all'],
      ['search', O, 'Product name/id, seller, category, brand'],
      ['category_id', O, ''],
      ['brand_id', O, ''],
      ['seller_id', O, ''],
      [
        'sort_by',
        O,
        'id | name | slug | price | moq | rating | is_trending | created_at | updated_at | submitted_at | reviewed_at | seller_name',
      ],
      ['sort_order', O, 'asc | desc'],
      ['is_active', O, 'true | false'],
      ['page', O, ''],
      ['limit', O, ''],
    ]),
};
SPECS['POST products/admin/approve'] = {
  description:
    'POST /products/admin/approve — Admin. Always send `product_ids` as an array (one ID or many, max 100). Status → approved.\n\n' +
    'Response: `{ succeeded, failed, total }` (partial success allowed).\n\n' +
    'Example single: `{ "product_ids": [{{product_id}}], "remarks": "..." }`\n' +
    'Example many: `{ "product_ids": [12, 15, 18], "remarks": "..." }`.' +
    fieldTable([
      ['product_ids', R, 'integer[]', 'e.g. [12] or [12, 15, 18] — use {{product_id}} in Postman'],
      ['remarks', O, 'string', 'Optional 10-2000 chars'],
    ]),
  descriptionOnly: true,
};
SPECS['POST products/admin/request-revision'] = {
  description:
    'POST /products/admin/request-revision — Admin. Always send `product_ids` as an array (one or many). Status → revision_required. Remarks required (shared).\n\n' +
    'Example: `{ "product_ids": [{{product_id}}], "remarks": "Please fix images and MOQ." }`.' +
    fieldTable([
      ['product_ids', R, 'integer[]', 'e.g. [12] or [12, 15]'],
      ['remarks', R, 'string', 'Min 10 chars — what seller must fix'],
    ]),
  descriptionOnly: true,
};
SPECS['POST products/admin/reject'] = {
  description:
    'POST /products/admin/reject — Admin. Always send `product_ids` as an array (one or many). Status → rejected (terminal). Remarks required.\n\n' +
    'Example: `{ "product_ids": [{{product_id}}], "remarks": "Policy violation." }`.' +
    fieldTable([
      ['product_ids', R, 'integer[]', 'e.g. [12] or [12, 15]'],
      ['remarks', R, 'string', 'Min 10 chars'],
    ]),
  descriptionOnly: true,
};

SPECS['DELETE products/:id'] = {
  description: 'DELETE /products/:id — Seller (own) or admin. Soft-deletes product.',
};

// ── Wishlist extras ──────────────────────────────────────────────────────────
SPECS['GET wishlist/check/:id'] = {
  description:
    'GET /wishlist/check/:product_id — Returns `{ is_wishlisted: true|false }` for authenticated buyer.',
};
SPECS['DELETE wishlist/:id'] = {
  description: 'DELETE /wishlist/:product_id — Remove product from wishlist (buyer).',
};

// ── Sellers ──────────────────────────────────────────────────────────────────
SPECS['GET sellers/:id'] = {
  description: 'GET /sellers/:id — Seller public profile with company details and stats.',
};
SPECS['GET sellers/verified'] = {
  description:
    'GET /sellers/verified — List verified sellers only. Optional Bearer: authenticated sellers do not see themselves.',
};

// ── Brands detail ──────────────────────────────────────────────────────────────
SPECS['GET brands/:id'] = {
  description: 'GET /brands/:id — Brand detail with logo and product count.',
};
SPECS['PUT brands/:id'] = {
  description:
    'PUT /brands/:id — Admin. multipart/form-data. All fields optional.' +
    fieldTable([
      ['name', O, 'text', '2-100 chars'],
      ['description', O, 'text', '10-2000 chars'],
      ['country', O, 'text', '2-100 chars'],
      ['website', O, 'text', 'Max 500 chars'],
      ['logo', O, FILE, 'Replace logo'],
      ['is_popular', O, 'boolean', ''],
      ['is_featured', O, 'boolean', ''],
      ['is_active', O, 'boolean', ''],
    ]),
  descriptionOnly: true,
};
SPECS['DELETE brands/:id'] = {
  description: 'DELETE /brands/:id — Admin only.',
};

// ── Offers detail ──────────────────────────────────────────────────────────────
SPECS['GET offers/:id'] = {
  description: 'GET /offers/:id — Single offer detail.',
};
SPECS['PUT offers/:id'] = {
  description:
    'PUT /offers/:id — Admin. multipart/form-data. All fields optional.' +
    fieldTable([
      ['title', O, 'text', '2-200 chars'],
      ['discount', O, 'number', 'Discount value'],
      ['expiry_date', O, 'ISO8601', 'Offer expiry'],
      ['banner', O, FILE, 'Replace banner image'],
      ['is_active', O, 'boolean', ''],
    ]),
  descriptionOnly: true,
};
SPECS['DELETE offers/:id'] = {
  description: 'DELETE /offers/:id — Admin only.',
};

// ── RFQ reads & actions ──────────────────────────────────────────────────────
SPECS['GET rfqs/latest'] = {
  description:
    'GET /rfqs/latest — Latest published RFQs for home page. Optional Bearer hides own RFQs (`buyer_id` from JWT). Includes buyer `company` object.' +
    queryTable([
      ['page', O, ''], ['limit', O, ''], ['search', O, 'Title, RFQ number, company name, etc'],
      ['sort_by', O, 'created_at | quotation_deadline | expected_price | title'],
      ['sort_order', O, 'asc | desc (default created_at desc)'],
    ]),
};
SPECS['GET rfqs/:id'] = {
  description:
    'GET /rfqs/:id — **Auth required** (buyer or seller). Includes `company`, `buyer.company`, and `assigned_sellers` (invited sellers with basic profile for PRIVATE RFQs).\n\n' +
    '**Access:** Owner & admin always. **PUBLIC** — any authenticated buyer/seller. **PRIVATE** — owner or sellers listed in `seller_ids` / `rfq_sellers`.\n\n' +
    'Assigned PRIVATE RFQs also appear in seller feed (`GET /rfqs/seller/feed`).',
  auth: true,
};
SPECS['GET rfqs/my'] = {
  description:
    'GET /rfqs/my — Buyer own RFQs (paginated). Includes `company` on each item.' +
    queryTable([
      ['page', O, ''], ['limit', O, ''], ['search', O, ''],
      ['category_id', O, ''], ['subcategory_id', O, ''],
      ['status', O, 'DRAFT | OPEN | PUBLISHED | CLOSED | AWARDED | CANCELLED etc'],
      ['sort_by', O, 'created_at | quotation_deadline | expected_price | total_quotations | title'],
      ['sort_order', O, 'asc | desc'],
    ]),
};
SPECS['POST rfqs/:id/publish'] = {
  description:
    'POST /rfqs/:id/publish — Buyer publishes DRAFT RFQ → OPEN/PUBLISHED.\n\n**Body:** None. **Path:** `:id` — RFQ ID.',
};
SPECS['PUT rfqs/:id'] = {
  description:
    'PUT /rfqs/:id — Update DRAFT or OPEN RFQ. All fields optional.' +
    fieldTable([
      ['title', O, 'string', '2-200 chars'],
      ['category_id', O, 'integer', ''],
      ['subcategory_id', O, 'integer', ''],
      ['description', O, 'string', 'Min 10 chars'],
      ['quantity', O, 'integer', 'Min 1'],
      ['unit', O, 'string', 'Max 50 chars'],
      ['quotation_deadline', O, 'ISO8601', ''],
      ['address_line_1', O, 'string', '3-255 chars'],
      ['address_line_2', O, 'string', ''],
      ['city', O, 'string', ''],
      ['state', O, 'string', ''],
      ['country', O, 'string', ''],
      ['pincode', O, 'string', '6-digit Indian'],
      ['product_id', O, 'integer', ''],
      ['expected_price', O, 'number', ''],
      ['budget', O, 'number', ''],
      ['currency', O, 'string', ''],
      ['required_before', O, 'ISO8601', ''],
      ['payment_terms', O, 'string', 'Max 200 chars'],
      ['visibility', O, 'enum', 'PUBLIC | PRIVATE'],
      ['seller_ids', O, 'integer[]', 'For PRIVATE visibility'],
    ]),
  bodyRaw: {
    title: 'Updated RFQ title',
    quantity: 600,
    quotation_deadline: '2026-09-01T00:00:00.000Z',
  },
};
SPECS['DELETE rfqs/:id'] = {
  description: 'DELETE /rfqs/:id — Buyer only. Allowed when status is **DRAFT** only.',
};
SPECS['POST rfqs/:id/cancel'] = {
  description: 'POST /rfqs/:id/cancel — Buyer cancels RFQ. Status → **CANCELLED**. No body.',
};
SPECS['POST rfqs/:id/close'] = {
  description: 'POST /rfqs/:id/close — Buyer closes RFQ without awarding. Status → **CLOSED**. No body.',
};
SPECS['GET rfqs/:id/quotations'] = {
  description:
    'GET /rfqs/:id/quotations — Buyer views quotations for their RFQ (paginated). Each item includes seller `company`.' +
    queryTable([
      ['page', O, ''], ['limit', O, ''], ['search', O, 'Seller name, company, quotation number'],
      ['status', O, 'SUBMITTED | UPDATED | ACCEPTED | REJECTED | WITHDRAWN | EXPIRED'],
      ['sort_by', O, 'id | price | total_amount | delivery_days | created_at'],
      ['sort_order', O, 'asc | desc'],
    ]),
};
SPECS['GET rfqs/:id/quotations/compare'] = {
  description:
    'GET /rfqs/:id/quotations/compare — Side-by-side comparison sorted by total_amount ascending.',
};
SPECS['GET rfqs/seller/feed'] = {
  description:
    'GET /rfqs/seller/feed — Seller RFQ feed.\n\n' +
    'Includes **PUBLIC** RFQs plus **PRIVATE** RFQs assigned to the authenticated seller (`rfq_sellers`).\n\n' +
    'Hides RFQs created by the authenticated user (`buyer_id` from JWT).\n\n' +
    'Each item includes `visibility` and `invite_status` (when assigned).' +
    queryTable([
      ['page', O, ''], ['limit', O, ''], ['search', O, 'Search title'],
      ['category_id', O, ''], ['subcategory_id', O, ''],
      ['city', O, ''], ['state', O, ''], ['country', O, ''],
      ['sort_by', O, 'created_at | quotation_deadline | expected_price'],
      ['sort_order', O, 'asc | desc'],
    ]),
};
SPECS['GET rfqs/seller/:id'] = {
  description:
    'GET /rfqs/seller/:id — Seller view of RFQ detail (for quoting).\n\n' +
    'Also returns:\n' +
    '- `my_quotation` — this seller’s quotation on the RFQ, or `null`\n' +
    '- `buyer_remark` — latest remark the buyer left on that quotation (revision request), or `null` if none\n' +
    '- `my_quotation.buyer_remark` — same value nested on the quotation object',
};
SPECS['GET rfqs/seller/quotations'] = {
  description:
    'GET /rfqs/seller/quotations — Quotations submitted by authenticated seller (paginated).' +
    queryTable([
      ['page', O, ''], ['limit', O, ''], ['search', O, 'RFQ title, RFQ number, quotation number'],
      ['status', O, 'Quotation status filter'],
      ['sort_by', O, 'id | price | total_amount | delivery_days | created_at'],
      ['sort_order', O, 'asc | desc'],
    ]),
};
SPECS['GET rfqs/seller/quotations/:id'] = {
  description: 'GET /rfqs/seller/quotations/:quotationId — Single quotation owned by seller.',
};

SPECS['POST inquiries'] = {
  description:
    'POST /inquiries — Buyer sends a product inquiry to the product seller. Status=`pending`. Auto-creates chat with product card + message.' +
    fieldTable([
      ['product_id', R, 'integer', 'Product to inquire about'],
      ['quantity', R, 'integer', 'Requested quantity ≥ 1'],
      ['message', R, 'string', 'Inquiry message 10–2000 chars'],
      ['unit', O, 'string', 'Defaults to product unit'],
      ['expected_price', O, 'number', 'Buyer target unit price'],
      ['currency', O, 'string', 'Default INR'],
      ['required_before', O, 'string', 'ISO8601 delivery need-by'],
    ]),
  bodyRaw: {
    product_id: 1,
    quantity: 100,
    unit: 'pcs',
    message: 'Looking for bulk pricing and delivery timeline for this product.',
    expected_price: 450,
    currency: 'INR',
  },
};
SPECS['GET inquiries/my'] = {
  description:
    'GET /inquiries/my — Buyer inquiry inbox. Each item includes nested `quotation` (or `null`).' +
    queryTable([
      ['page', O, ''], ['limit', O, ''], ['search', O, ''],
      ['status', O, 'pending | quoted | rejected | accepted | cancelled | closed'],
      ['product_id', O, ''],
      ['sort_by', O, 'id | created_at | updated_at | status | quantity | expected_price'],
      ['sort_order', O, 'asc | desc'],
    ]),
};
SPECS['GET inquiries/seller'] = {
  description:
    'GET /inquiries/seller — Seller inquiry inbox (Reply chat / Send quote / Reject). Each item includes nested `quotation` (or `null`).',
};
SPECS['GET inquiries/seller/quotations'] = {
  description: 'GET /inquiries/seller/quotations — Seller quotes on inquiries.',
};
SPECS['GET inquiries/:id'] = {
  description: 'GET /inquiries/:id — Detail + quotation + conversation_id.',
};
SPECS['PUT inquiries/:id'] = {
  description: 'PUT /inquiries/:id — Buyer update while pending.',
};
SPECS['POST inquiries/:id/cancel'] = {
  description: 'POST /inquiries/:id/cancel — Buyer cancels inquiry.',
};
SPECS['POST inquiries/:id/reject'] = {
  description:
    'POST /inquiries/:id/reject — Seller rejects inquiry.' +
    fieldTable([['reason', O, 'string', 'Optional rejection reason']]),
  bodyRaw: { reason: 'Unable to fulfill quantity at this time' },
};
SPECS['POST inquiries/:id/quotations'] = {
  description:
    'POST /inquiries/:id/quotations — Seller send quote (status → quoted).' +
    fieldTable([
      ['price', R, 'number', 'Unit price'],
      ['quantity', O, 'integer', ''],
      ['unit', O, 'string', ''],
      ['gst_percentage', O, 'number', ''],
      ['transportation_charge', O, 'number', ''],
      ['delivery_days', O, 'integer', ''],
      ['payment_terms', O, 'string', ''],
      ['validity_days', O, 'integer', ''],
      ['remarks', O, 'string', ''],
    ]),
  bodyRaw: { price: 420, quantity: 100, unit: 'pcs', gst_percentage: 18, delivery_days: 7 },
};
SPECS['POST inquiries/:id/chat'] = {
  description: 'POST /inquiries/:id/chat — Get/start inquiry chat thread.',
};
SPECS['PUT inquiries/quotations/:id'] = {
  description: 'PUT /inquiries/quotations/:quotationId — Seller update quote.',
};
SPECS['POST inquiries/quotations/:id/withdraw'] = {
  description: 'POST /inquiries/quotations/:quotationId/withdraw — Seller withdraws quote.',
};
SPECS['POST inquiries/quotations/:id/accept'] = {
  description: 'POST /inquiries/quotations/:quotationId/accept — Buyer accepts quote.',
};
SPECS['POST inquiries/quotations/:id/reject'] = {
  description: 'POST /inquiries/quotations/:quotationId/reject — Buyer rejects quote.',
};

SPECS['POST rfqs/:id/quotations'] = {
  description:
    'POST /rfqs/:id/quotations — Seller submit quotation.' +
    fieldTable([
      ['price', R, 'number', 'Unit price — positive'],
      ['quantity', O, 'integer', 'Defaults to RFQ quantity'],
      ['unit', O, 'string', 'Defaults to RFQ unit'],
      ['gst_percentage', O, 'number', 'GST %'],
      ['transportation_charge', O, 'number', ''],
      ['delivery_days', O, 'integer', ''],
      ['payment_terms', O, 'string', 'Max 200 chars'],
      ['validity_days', O, 'integer', 'Quotation validity in days'],
      ['remarks', O, 'string', 'Additional notes'],
    ]),
  bodyRaw: {
    price: 450,
    quantity: 500,
    unit: 'pcs',
    gst_percentage: 18,
    transportation_charge: 5000,
    delivery_days: 7,
    payment_terms: '30 days credit',
    validity_days: 15,
    remarks: 'Best quality with ISI certification',
  },
};
SPECS['GET rfqs/quotations/:id'] = {
  description: 'GET /rfqs/quotations/:quotationId — Quotation detail (buyer/seller/admin).',
};
SPECS['PUT rfqs/quotations/:id'] = {
  description:
    'PUT /rfqs/quotations/:quotationId — Seller update quotation (SUBMITTED/UPDATED status).' +
    fieldTable([
      ['price', O, 'number', ''],
      ['quantity', O, 'integer', ''],
      ['unit', O, 'string', ''],
      ['gst_percentage', O, 'number', ''],
      ['transportation_charge', O, 'number', ''],
      ['delivery_days', O, 'integer', ''],
      ['payment_terms', O, 'string', ''],
      ['validity_days', O, 'integer', ''],
      ['remarks', O, 'string', ''],
    ]),
  bodyRaw: { price: 440, remarks: 'Updated after internal review' },
};
SPECS['POST rfqs/quotations/:id/withdraw'] = {
  description: 'POST /rfqs/quotations/:quotationId/withdraw — Seller withdraws quotation. No body.',
};
SPECS['POST rfqs/quotations/:id/accept'] = {
  description:
    'POST /rfqs/quotations/:quotationId/accept — Buyer accepts quotation. Awards RFQ. No body.',
};
SPECS['POST rfqs/quotations/:id/reject'] = {
  description: 'POST /rfqs/quotations/:quotationId/reject — Buyer rejects quotation. No body.',
};
SPECS['GET rfqs/admin/list'] = {
  description:
    'GET /rfqs/admin/list — Admin paginated RFQ list. Includes buyer `company`.' +
    queryTable([['page', O, ''], ['limit', O, ''], ['status', O, ''], ['search', O, ''], ['sort_by', O, ''], ['sort_order', O, '']]),
};
SPECS['GET rfqs/admin/:id'] = {
  description: 'GET /rfqs/admin/:id — Admin RFQ detail with audit trail and buyer `company`.',
};
SPECS['PATCH rfqs/admin/:id/status'] = {
  description:
    'PATCH /rfqs/admin/:id/status — Admin force-update RFQ status.' +
    fieldTable([
      ['status', R, 'enum', 'DRAFT | OPEN | PUBLISHED | QUOTATION_RECEIVED | NEGOTIATION | AWARDED | COMPLETED | EXPIRED | CANCELLED | CLOSED'],
    ]),
  bodyRaw: { status: 'CLOSED' },
};
SPECS['GET rfqs/admin/quotations'] = {
  description:
    'GET /rfqs/admin/quotations — Admin list all quotations (paginated).' +
    queryTable([
      ['page', O, ''], ['limit', O, ''], ['search', O, 'RFQ title/number, seller, company, quotation number'],
      ['status', O, ''], ['rfq_id', O, ''], ['seller_id', O, ''],
      ['sort_by', O, 'id | price | total_amount | delivery_days | created_at'],
      ['sort_order', O, 'asc | desc'],
    ]),
};
SPECS['GET rfqs/admin/dashboard/summary'] = {
  description: 'GET /rfqs/admin/dashboard/summary — Admin RFQ dashboard counts (open, awarded, etc.).',
};

// ── Chat (matchName for message variants) ────────────────────────────────────
SPECS['GET chats/rfqs/:id/conversations'] = {
  description:
    'GET /chats/rfqs/:rfqId/conversations — Buyer lists all chat threads for an RFQ.' +
    queryTable([['page', O, ''], ['limit', O, ''], ['search', O, ''], ['sort_by', O, 'last_message_at | created_at'], ['sort_order', O, '']]),
};
SPECS['GET chats/conversations/:id'] = {
  description: 'GET /chats/conversations/:id — Conversation detail with RFQ and participant info.',
};
SPECS['GET chats/conversations/:id/messages'] = {
  description:
    'GET /chats/conversations/:id/messages — Message history.' +
    queryTable([
      ['page', O, ''], ['limit', O, ''],
      ['before_id', O, 'Cursor — messages before ID'],
      ['after_id', O, 'Cursor — messages after ID'],
      ['order', O, 'asc | desc'],
    ]),
};
SPECS['POST chats/conversations/:id/messages|text'] = {
  matchName: 'Send TEXT Message',
  description:
    'POST /chats/conversations/:id/messages — Send TEXT message.' +
    fieldTable([
      ['message_type', R, 'enum', 'TEXT'],
      ['content', R, 'string', 'Message text — max 5000 chars'],
      ['reply_to_message_id', O, 'integer', 'Reply to message ID'],
    ]),
  bodyRaw: { message_type: 'TEXT', content: 'Hello, can you share best price for 500 units?' },
};
SPECS['POST chats/conversations/:id/messages|product'] = {
  matchName: 'Send PRODUCT Message',
  description:
    'POST /chats/conversations/:id/messages — Share product card.' +
    fieldTable([
      ['message_type', R, 'enum', 'PRODUCT'],
      ['product_id', R, 'integer', 'Product ID to share'],
      ['content', O, 'string', 'Optional caption'],
      ['reply_to_message_id', O, 'integer', ''],
    ]),
  bodyRaw: { message_type: 'PRODUCT', product_id: '{{product_id}}', content: 'Please check this product' },
};
SPECS['POST chats/conversations/:id/messages|quotation'] = {
  matchName: 'Send QUOTATION Message',
  description:
    'POST /chats/conversations/:id/messages — Share quotation card.' +
    fieldTable([
      ['message_type', R, 'enum', 'QUOTATION'],
      ['quotation_id', R, 'integer', 'Quotation ID to share'],
      ['content', O, 'string', 'Optional caption'],
      ['reply_to_message_id', O, 'integer', ''],
    ]),
  bodyRaw: { message_type: 'QUOTATION', quotation_id: '{{quotation_id}}', content: 'Here is our revised quote' },
};
SPECS['POST chats/conversations/:id/messages/media|image'] = {
  matchName: 'Send IMAGE (multipart)',
  description:
    'POST /chats/conversations/:id/messages/media — Upload image.' +
    fieldTable([
      ['message_type', R, 'text', 'IMAGE'],
      ['file', R, FILE, 'Image file (jpg, png, webp)'],
      ['content', O, 'text', 'Caption — max 500 chars'],
    ]),
  descriptionOnly: true,
};
SPECS['POST chats/conversations/:id/messages/media|document'] = {
  matchName: 'Send DOCUMENT (multipart)',
  description:
    'POST /chats/conversations/:id/messages/media — Upload document.' +
    fieldTable([
      ['message_type', R, 'text', 'DOCUMENT'],
      ['file', R, FILE, 'PDF or document file'],
      ['content', O, 'text', 'Caption — max 500 chars'],
    ]),
  descriptionOnly: true,
};

// ── Services & News lists ────────────────────────────────────────────────────
SPECS['GET services'] = {
  description:
    'GET /services — Paginated services list.' +
    queryTable([
      ['page', O, ''], ['limit', O, ''], ['search', O, ''],
      ['is_active', O, 'true | false'],
      ['sort_by', O, 'id | name | is_active | created_at'],
      ['sort_order', O, 'asc | desc'],
    ]),
};
SPECS['PUT services/:id'] = {
  description:
    'PUT /services/:id — Admin. multipart/form-data. All fields optional.' +
    fieldTable([
      ['name', O, 'text', '2-100 chars'],
      ['description', O, 'text', ''],
      ['icon', O, FILE, 'Replace icon'],
      ['is_active', O, 'boolean', ''],
    ]),
  descriptionOnly: true,
};
SPECS['DELETE services/:id'] = {
  description: 'DELETE /services/:id — Admin only.',
};
SPECS['GET news'] = {
  description:
    'GET /news — Paginated news articles.' +
    queryTable([
      ['page', O, ''], ['limit', O, ''], ['search', O, ''],
      ['is_active', O, 'true | false'],
      ['sort_by', O, 'id | title | published_at | is_active | created_at'],
      ['sort_order', O, 'asc | desc'],
    ]),
};
SPECS['PUT news/:id'] = {
  description:
    'PUT /news/:id — Admin. multipart/form-data. All fields optional.' +
    fieldTable([
      ['title', O, 'text', '2-200 chars'],
      ['content', O, 'text', 'Article HTML/text'],
      ['thumbnail', O, FILE, 'Cover image'],
      ['published_at', O, 'ISO8601', ''],
      ['is_active', O, 'boolean', ''],
    ]),
  descriptionOnly: true,
};
SPECS['DELETE news/:id'] = {
  description: 'DELETE /news/:id — Admin only.',
};

// ── Auth profile delete ────────────────────────────────────────────────────────
SPECS['DELETE auth/profile'] = {
  description:
    'DELETE /auth/profile — Soft-delete account and revoke all sessions.\n\n**Auth:** Bearer `{{access_token}}`. **Body:** None.',
};

module.exports = { SPECS, R, O, FILE };
