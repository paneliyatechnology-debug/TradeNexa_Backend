const { v4: uuidv4 } = require('uuid');
const db = require('../database/knex');
const { resolveMediaUrl } = require('../utils/media');
const { hashToken, compareToken } = require('../utils/jwt');
const { ROLE_CODES } = require('../constants');

// ==========================================
// User Operations
// ==========================================

/**
 * Find user by their primary database ID.
 * @param {number} id - User primary ID
 * @returns {Promise<Object>}
 */
const findUserById = (id) => db('users').where({ id }).whereNull('deleted_at').first();

/**
 * Find user by their mobile number.
 * @param {string} mobile - Mobile number with country code prefix
 * @returns {Promise<Object>}
 */
const findUserByMobile = (mobile) =>
  db('users').where({ mobile_number: mobile }).whereNull('deleted_at').first();

/**
 * Find user by their email address.
 * @param {string} email - Email address
 * @returns {Promise<Object>}
 */
const findUserByEmail = (email) => {
  if (!email) return null;
  return db('users').where({ email }).whereNull('deleted_at').first();
};

/**
 * Find user by email including role details.
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
const findUserWithRoleByEmail = (email) => {
  if (!email) return null;
  return db('users')
    .join('roles', 'users.role_id', 'roles.id')
    .where('users.email', email)
    .whereNull('users.deleted_at')
    .select('users.*', 'roles.code as role_code', 'roles.name as role_name')
    .first();
};

/**
 * Find user by ID including role details.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
const findUserWithRoleById = (id) =>
  db('users')
    .join('roles', 'users.role_id', 'roles.id')
    .where('users.id', id)
    .whereNull('users.deleted_at')
    .select('users.*', 'roles.code as role_code', 'roles.name as role_name')
    .first();

/**
 * Insert a new user record.
 * @param {Object} data - User creation data
 * @param {Object} [trx] - Optional transaction object
 * @returns {Promise<Object>}
 */
const createUser = async (data, trx = null) => {
  const q = trx ? trx('users') : db('users');
  const [id] = await q.insert(data);
  return trx ? trx('users').where({ id }).first() : findUserById(id);
};

/**
 * Update an existing user record.
 * @param {number} id - User ID
 * @param {Object} data - Update payload
 * @returns {Promise<Object>}
 */
const updateUser = async (id, data) => {
  await db('users').where({ id }).update(data);
  return findUserById(id);
};

/**
 * Get the roles assigned to a user by joining directly to the roles table.
 * @param {number} userId - User ID
 * @returns {Promise<Array>}
 */
const getUserRoles = (userId) =>
  db('users')
    .join('roles', 'users.role_id', 'roles.id')
    .where('users.id', userId)
    .select('roles.code', 'roles.name');

/**
 * Get languages assigned to the user.
 * @param {number} userId - User ID
 * @returns {Promise<Array>}
 */
const getUserLanguages = (userId) =>
  db('users')
    .join('languages', 'users.language_id', 'languages.id')
    .where('users.id', userId)
    .select('languages.code', 'languages.name');

/**
 * Retrieve the complete user profile including company details, roles, language, and address.
 * @param {number} userId - User ID
 * @returns {Promise<Object>}
 */
const getFullProfile = async (userId) => {
  const user = await findUserById(userId);
  if (!user) return null;

  const profile = await db('company_details').where({ user_id: userId }).first();
  const roles = await getUserRoles(userId);
  const languages = await getUserLanguages(userId);
  const address = await db('addresses').where({ user_id: userId, is_primary: true }).first();

  let businessType = null;
  if (user.business_type_id) {
    businessType = await db('business_types')
      .join('roles', 'business_types.role_id', 'roles.id')
      .where('business_types.id', user.business_type_id)
      .select('business_types.id', 'business_types.name', 'business_types.code', 'roles.code as role_code')
      .first();
  }

  let city = null,
    state = null,
    country = null;
  if (address) {
    if (address.city_id) city = await db('cities').where({ id: address.city_id }).first();
    if (address.state_id) state = await db('states').where({ id: address.state_id }).first();
    if (address.country_id)
      country = await db('countries').where({ id: address.country_id }).first();
  }

  return {
    ...user,
    profile,
    roles,
    languages,
    businessType,
    address: address ? { ...address, city, state, country } : null,
  };
};

/**
 * Format the full profile object for client responses.
 * @param {Object} data - Full profile dataset
 * @returns {Object}
 */
const formatUser = (data) => {
  if (!data) return null;
  const { profile, roles, languages, businessType, address, ...user } = data;
  const roleCode = roles?.[0]?.code || null;

  const base = {
    uuid: user.uuid,
    full_name: user.full_name,
    mobile_number: user.mobile_number,
    email: user.email,
    role_id: user.role_id,
    role: roleCode,
    business_type_id: user.business_type_id,
    business_type: businessType
      ? { id: businessType.id, name: businessType.name, code: businessType.code }
      : null,
    language_id: user.language_id,
    language: languages?.[0]?.code || null,
    is_verified: user.is_verified,
    is_active: user.is_active,
    is_completed_profile: !!user.is_completed_profile,
    last_login: user.last_login,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };

  const buyerFields = {
    profile_image: resolveMediaUrl(user.profile_image),
    company_name: profile?.company_name || null,
    industry: profile?.industry || null,
    gst_number: profile?.gst_number || null,
    address: address
      ? {
          address_line_1: address.address_line_1,
          address_line_2: address.address_line_2,
          city: address.city?.name || null,
          state: address.state?.name || null,
          country: address.country?.name || null,
          pincode: address.pincode,
        }
      : null,
  };

  const sellerFields = {
    company_logo: resolveMediaUrl(profile?.company_logo),
    company_banner: resolveMediaUrl(profile?.company_banner),
    company_name: profile?.company_name || null,
    gst_number: profile?.gst_number || null,
    pan_number: profile?.pan_number || null,
    cin: profile?.cin || null,
    iec: profile?.iec || null,
    business_description: profile?.business_description || null,
  };

  if (roleCode === ROLE_CODES.BUYER) return { ...base, ...buyerFields };
  if (roleCode === ROLE_CODES.SELLER) return { ...base, ...sellerFields };
  if (roleCode === ROLE_CODES.BUYER_SELLER) return { ...base, ...buyerFields, ...sellerFields };

  return {
    ...base,
    company_name: profile?.company_name || null,
    gst_number: profile?.gst_number || null,
    profile_image: resolveMediaUrl(user.profile_image),
  };
};

/**
 * Format admin panel user for API responses (never exposes password).
 * @param {Object} user - User row with optional role_code and role_name
 * @returns {Object|null}
 */
const formatAdminUser = (user) => {
  if (!user) return null;

  return {
    id: user.id,
    uuid: user.uuid,
    full_name: user.full_name,
    email: user.email,
    mobile_number: user.mobile_number,
    role_id: user.role_id,
    role: user.role_code ? { code: user.role_code, name: user.role_name } : null,
    is_verified: !!user.is_verified,
    is_active: !!user.is_active,
    is_completed_profile: !!user.is_completed_profile,
    last_login: user.last_login,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
};

// ==========================================
// OTP Logs
// ==========================================

/**
 * Log an OTP request.
 * @param {Object} data - OTP metadata
 * @returns {Promise<void>}
 */
const createOtpLog = (data) => db('otp_logs').insert(data);

/**
 * Retrieve OTP details by its Firebase verification ID.
 * @param {string} id - Firebase verification ID
 * @returns {Promise<Object>}
 */
const findOtpByVerificationId = (id) =>
  db('otp_logs').where({ firebase_verification_id: id }).first();

/**
 * Mark an OTP session as verified.
 * @param {number} id - OTP record ID
 * @returns {Promise<void>}
 */
const markOtpVerified = (id) =>
  db('otp_logs').where({ id }).update({ status: 'verified', verified_at: db.fn.now() });

/**
 * Mark an OTP session as expired.
 * @param {number} id - OTP record ID
 * @returns {Promise<void>}
 */
const markOtpExpired = (id) => db('otp_logs').where({ id }).update({ status: 'expired' });

/**
 * Regenerate an OTP session with a new ID and expiry time.
 * @param {number} id - OTP record ID
 * @param {string} verificationId - New Firebase ID
 * @param {Date} expiresAt - Expiry timestamp
 * @returns {Promise<void>}
 */
const updateOtpVerificationId = (id, verificationId, expiresAt) =>
  db('otp_logs').where({ id }).update({
    firebase_verification_id: verificationId,
    status: 'pending',
    expires_at: expiresAt,
  });

// ==========================================
// Refresh Tokens
// ==========================================

/**
 * Save a new refresh token hash for a user.
 * @param {number} userId - User ID
 * @param {string} token - Raw refresh token string
 * @param {Date} expiresAt - Expiry timestamp
 * @returns {Promise<void>}
 */
const saveRefreshToken = async (userId, token, expiresAt) => {
  const tokenHash = await hashToken(token);
  return db('refresh_tokens').insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    is_revoked: false,
  });
};

/**
 * Validate and find a user's active, non-revoked refresh token.
 * @param {number} userId - User ID
 * @param {string} token - Raw refresh token
 * @returns {Promise<Object|null>}
 */
const findValidRefreshToken = async (userId, token) => {
  const tokens = await db('refresh_tokens')
    .where({ user_id: userId, is_revoked: false })
    .where('expires_at', '>', db.fn.now());

  for (const record of tokens) {
    if (await compareToken(token, record.token_hash)) return record;
  }
  return null;
};

/**
 * Revoke a refresh token by ID.
 * @param {number} id - Token record ID
 * @returns {Promise<void>}
 */
const revokeRefreshToken = (id) => db('refresh_tokens').where({ id }).update({ is_revoked: true });

/**
 * Revoke all active refresh tokens for a user.
 * @param {number} userId - User ID
 * @returns {Promise<void>}
 */
const revokeAllRefreshTokens = (userId) =>
  db('refresh_tokens').where({ user_id: userId, is_revoked: false }).update({ is_revoked: true });

/**
 * Find and revoke a specific refresh token.
 * @param {number} userId - User ID
 * @param {string} token - Raw refresh token value
 * @returns {Promise<Object|null>}
 */
const revokeRefreshTokenByValue = async (userId, token) => {
  const record = await findValidRefreshToken(userId, token);
  if (record) await revokeRefreshToken(record.id);
  return record;
};

// ==========================================
// Languages
// ==========================================

/**
 * Find active language by its code.
 * @param {string} code - Language code (e.g. 'en')
 * @returns {Promise<Object>}
 */
const findLanguageByCode = (code) => db('languages').where({ code, is_active: true }).first();

// ==========================================
// Profiles & Addresses
// ==========================================

/**
 * Fetch company details for a user.
 * @param {number} userId - User ID
 * @returns {Promise<Object|null>}
 */
const getCompanyDetails = (userId) => db('company_details').where({ user_id: userId }).first();

/**
 * Create or update company profile details for a user.
 * @param {number} userId - User ID
 * @param {Object} data - Company profile fields
 * @returns {Promise<Object>}
 */
const upsertProfile = async (userId, data) => {
  const existing = await db('company_details').where({ user_id: userId }).first();
  if (existing) {
    await db('company_details').where({ user_id: userId }).update(data);
    return db('company_details').where({ user_id: userId }).first();
  }
  await db('company_details').insert({ user_id: userId, ...data });
  return db('company_details').where({ user_id: userId }).first();
};

/**
 * Find IDs for a given city, state, and country.
 * @param {string} cityName - City name
 * @param {string} stateName - State name
 * @param {string} countryName - Country name
 * @returns {Promise<Object>}
 */
const findLocationIds = async (cityName, stateName, countryName) => {
  const country = await db('countries').where('name', 'like', `%${countryName}%`).first();
  const state = country
    ? await db('states')
        .where('name', 'like', `%${stateName}%`)
        .where({ country_id: country.id })
        .first()
    : null;
  const city = state
    ? await db('cities')
        .where('name', 'like', `%${cityName}%`)
        .where({ state_id: state.id })
        .first()
    : null;
  return { country_id: country?.id, state_id: state?.id, city_id: city?.id };
};

/**
 * Update primary address, creating one if not exists.
 * @param {number} userId - User ID
 * @param {Object} data - Updated address fields
 * @returns {Promise<void>}
 */
const updateAddress = async (userId, data) => {
  const existing = await db('addresses').where({ user_id: userId, is_primary: true }).first();
  if (existing) {
    return db('addresses').where({ id: existing.id }).update(data);
  }
  return db('addresses').insert({ ...data, user_id: userId, is_primary: true });
};

/**
 * Log a user login event.
 * @param {Object} data - Login log metadata
 * @returns {Promise<void>}
 */
const createLoginLog = (data) => db('login_logs').insert(data);

/**
 * Soft delete a user and perform cleanup of active sessions/devices.
 * @param {number} userId - User ID
 * @returns {Promise<void>}
 */
const softDeleteUser = async (userId) => {
  await db.transaction(async (trx) => {
    // 1. Soft delete the user: nullify mobile number, set inactive and deleted_at
    await trx('users').where({ id: userId }).update({
      mobile_number: null,
      is_active: false,
      deleted_at: trx.fn.now(),
      updated_by: userId,
    });

    // 2. Delete user's active device tokens
    await trx('devices').where({ user_id: userId }).del();

    // 3. Revoke all user refresh tokens
    await trx('refresh_tokens')
      .where({ user_id: userId, is_revoked: false })
      .update({ is_revoked: true });
  });
};

/**
 * Delete device registration for a user.
 * @param {number} userId - User ID
 * @returns {Promise<void>}
 */
const deleteUserDevice = (userId) => db('devices').where({ user_id: userId }).del();

/**
 * Save or replace the user's active device (one device per user).
 * @param {number} userId - User ID
 * @param {string} deviceType - android | ios | web
 * @param {string} deviceToken - Push notification token
 * @returns {Promise<void>}
 */
const saveUserDevice = async (userId, deviceType, deviceToken) => {
  if (!deviceToken) return;

  await db.transaction(async (trx) => {
    await trx('devices').where({ user_id: userId }).del();
    await trx('devices').insert({
      user_id: userId,
      device_type: deviceType || null,
      device_token: deviceToken,
      last_active: trx.fn.now(),
    });
  });
};

module.exports = {
  uuidv4,
  findUserById,
  findUserByMobile,
  findUserByEmail,
  findUserWithRoleByEmail,
  findUserWithRoleById,
  createUser,
  updateUser,
  getUserRoles,
  getFullProfile,
  formatUser,
  formatAdminUser,
  createOtpLog,
  findOtpByVerificationId,
  markOtpVerified,
  markOtpExpired,
  updateOtpVerificationId,
  saveRefreshToken,
  findValidRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  revokeRefreshTokenByValue,
  findLanguageByCode,
  getCompanyDetails,
  upsertProfile,
  findLocationIds,
  updateAddress,
  createLoginLog,
  softDeleteUser,
  deleteUserDevice,
  saveUserDevice,
  db,
};
