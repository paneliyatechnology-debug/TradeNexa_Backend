const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { resolveMediaUrl } = require('../utils/media');

// ==========================================
// Query helpers
// ==========================================

/** Base query for seller/buyer_seller users with company and address joins. */
const getSupplierQuery = () =>
  db('users')
    .join('roles', 'users.role_id', '=', 'roles.id')
    .leftJoin('company_details', 'users.id', '=', 'company_details.user_id')
    .leftJoin('addresses', function () {
      this.on('users.id', '=', 'addresses.user_id').andOn('addresses.is_primary', '=', db.raw('?', [true]));
    })
    .leftJoin('cities', 'addresses.city_id', '=', 'cities.id')
    .leftJoin('states', 'addresses.state_id', '=', 'states.id')
    .whereIn('roles.code', ['seller', 'buyer_seller'])
    .whereNull('users.deleted_at');

/**
 * Format a supplier row for API responses.
 * Resolves logo URL and normalizes boolean/numeric fields.
 * @param {Object} row - Raw supplier query row
 * @returns {Object}
 */
const formatSupplierRow = (row) => ({
  ...row,
  logo: resolveMediaUrl(row.logo),
  verified: !!row.verified,
  is_active: row.is_active !== undefined ? !!row.is_active : undefined,
  rating: parseFloat(row.rating || 0),
  response_rate: parseFloat(row.response_rate || 0),
  distance: row.distance !== undefined ? parseFloat(row.distance || 0) : undefined,
});

// ==========================================
// List & read queries
// ==========================================

/**
 * Find a single supplier by user ID.
 * @param {number} id - Supplier (user) ID
 * @returns {Promise<Object|null>}
 */
const findSupplierById = async (id) => {
  const result = await getSupplierQuery()
    .where('users.id', id)
    .select(
      'users.id',
      'company_details.company_name',
      db.raw('COALESCE(company_details.company_logo, users.profile_image) as logo'),
      'users.is_verified as verified',
      'company_details.rating',
      'company_details.response_rate',
      'company_details.years_in_business',
      'addresses.latitude',
      'addresses.longitude',
      'cities.name as city',
      'states.name as state',
      'users.is_active',
    )
    .first();

  return result ? formatSupplierRow(result) : null;
};

/**
 * Paginated list of suppliers with optional search and status filters.
 * @param {Object} [filters] - Query filters (q, is_verified, is_active, page, limit)
 * @returns {Promise<Object>}
 */
const findSuppliers = async (filters = {}) => {
  const q = getSupplierQuery()
    .select(
      'users.id',
      'company_details.company_name',
      db.raw('COALESCE(company_details.company_logo, users.profile_image) as logo'),
      'users.is_verified as verified',
      'company_details.rating',
      'company_details.response_rate',
      'company_details.years_in_business',
      'cities.name as city',
      'states.name as state',
    );

  if (filters.q) {
    q.where('company_details.company_name', 'like', `%${filters.q}%`);
  }
  if (filters.is_verified !== undefined) {
    q.where('users.is_verified', filters.is_verified);
  }
  if (filters.is_active !== undefined) {
    q.where('users.is_active', filters.is_active);
  }

  q.orderBy('company_details.company_name', 'asc');

  const paginated = await paginate(q, filters.page, filters.limit);
  paginated.results = paginated.results.map(formatSupplierRow);
  return paginated;
};

/**
 * Paginated list of suppliers within a geographic radius (Haversine formula).
 * @param {number|string} latitude - Reference latitude
 * @param {number|string} longitude - Reference longitude
 * @param {number} [maxDistance=50] - Maximum distance in km
 * @param {Object} [filters] - Pagination filters (page, limit)
 * @returns {Promise<Object>}
 */
const findNearbySuppliers = async (latitude, longitude, maxDistance = 50, filters = {}) => {
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const maxDist = parseFloat(maxDistance) || 50;
  const distanceSql = `(6371 * acos(cos(radians(${lat})) * cos(radians(addresses.latitude)) * cos(radians(addresses.longitude) - radians(${lng})) + sin(radians(${lat})) * sin(radians(addresses.latitude))))`;

  const q = getSupplierQuery()
    .whereRaw(`${distanceSql} <= ?`, [maxDist])
    .select(
      'users.id',
      'company_details.company_name',
      db.raw('COALESCE(company_details.company_logo, users.profile_image) as logo'),
      'users.is_verified as verified',
      'company_details.rating',
      'company_details.response_rate',
      'company_details.years_in_business',
      'cities.name as city',
      'states.name as state',
      db.raw(`round(${distanceSql}, 2) as distance`),
    )
    .orderBy('distance', 'asc');

  const paginated = await paginate(q, filters.page, filters.limit);
  paginated.results = paginated.results.map(formatSupplierRow);
  return paginated;
};

module.exports = {
  findSupplierById,
  findSuppliers,
  findNearbySuppliers,
};
