const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { resolveMediaUrl } = require('../utils/media');
const { applyListSort } = require('../utils/listQuery');

const SELLER_SORT_FIELDS = {
  id: 'users.id',
  company_name: 'company_details.company_name',
  rating: 'company_details.rating',
  response_rate: 'company_details.response_rate',
  years_in_business: 'company_details.years_in_business',
  created_at: 'users.created_at',
};

// ==========================================
// Query helpers
// ==========================================

/** Base query for seller/buyer_seller users with company and address joins. */
const getSellerQuery = () =>
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
 * Format a seller row for API responses.
 * Resolves logo URL and normalizes boolean/numeric fields.
 * @param {Object} row - Raw seller query row
 * @returns {Object}
 */
const formatSellerRow = (row) => ({
  ...row,
  user_id: row.id ?? null,
  logo: resolveMediaUrl(row.logo),
  verified: !!row.verified,
  is_active: row.is_active !== undefined ? !!row.is_active : undefined,
  rating: parseFloat(row.rating || 0),
  response_rate: parseFloat(row.response_rate || 0),
  profile_views_count:
    row.profile_views_count !== undefined ? parseInt(row.profile_views_count || 0, 10) : undefined,
  distance: row.distance !== undefined ? parseFloat(row.distance || 0) : undefined,
});

// ==========================================
// List & read queries
// ==========================================

/**
 * Find a single seller by user ID.
 * @param {number} id - Seller (user) ID
 * @returns {Promise<Object|null>}
 */
const findSellerById = async (id) => {
  const result = await getSellerQuery()
    .where('users.id', id)
    .select(
      'users.id',
      'company_details.company_name',
      db.raw('COALESCE(company_details.company_logo, users.profile_image) as logo'),
      'users.is_verified as verified',
      'company_details.rating',
      'company_details.response_rate',
      'company_details.years_in_business',
      'company_details.profile_views_count',
      'addresses.latitude',
      'addresses.longitude',
      'cities.name as city',
      'states.name as state',
      'users.is_active',
    )
    .first();

  return result ? formatSellerRow(result) : null;
};

/**
 * Paginated list of sellers with optional search and status filters.
 * @param {Object} [filters] - Query filters (search, is_verified, is_active, page, limit)
 * @returns {Promise<Object>}
 */
const findSellers = async (filters = {}) => {
  const q = getSellerQuery()
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

  if (filters.search) {
    q.where('company_details.company_name', 'like', `%${filters.search}%`);
  }
  if (filters.is_verified !== undefined) {
    q.where('users.is_verified', filters.is_verified);
  }
  if (filters.is_active !== undefined) {
    q.where('users.is_active', filters.is_active);
  }
  if (filters.exclude_seller_id) {
    q.whereNot('users.id', filters.exclude_seller_id);
  }

  applyListSort(q, filters, SELLER_SORT_FIELDS);

  const paginated = await paginate(q, filters.page, filters.limit);
  paginated.results = paginated.results.map(formatSellerRow);
  return paginated;
};

/**
 * Paginated list of sellers within a geographic radius (Haversine formula).
 * @param {number|string} latitude - Reference latitude
 * @param {number|string} longitude - Reference longitude
 * @param {number} [maxDistance=50] - Maximum distance in km
 * @param {Object} [filters] - Pagination filters (page, limit)
 * @returns {Promise<Object>}
 */
const findNearbySellers = async (latitude, longitude, maxDistance = 50, filters = {}) => {
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const maxDist = parseFloat(maxDistance) || 50;
  const distanceSql = `(6371 * acos(cos(radians(${lat})) * cos(radians(addresses.latitude)) * cos(radians(addresses.longitude) - radians(${lng})) + sin(radians(${lat})) * sin(radians(addresses.latitude))))`;

  const q = getSellerQuery()
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
    .orderBy('distance', 'asc')
    .orderBy('users.id', 'desc');

  if (filters.exclude_seller_id) {
    q.whereNot('users.id', filters.exclude_seller_id);
  }

  const paginated = await paginate(q, filters.page, filters.limit);
  paginated.results = paginated.results.map(formatSellerRow);
  return paginated;
};

/**
 * Record a profile view: insert event log + increment lifetime counter.
 * Enables daily growth charts via seller_profile_views.viewed_at.
 * No-op when company_details is missing.
 * @param {number} sellerId
 * @param {number|null} [viewerUserId]
 * @returns {Promise<number>} Updated lifetime count
 */
const incrementProfileViews = async (sellerId, viewerUserId = null) => {
  const existing = await db('company_details').where({ user_id: sellerId }).first();
  if (!existing) return 0;

  await db.transaction(async (trx) => {
    await trx('seller_profile_views').insert({
      seller_id: sellerId,
      viewer_user_id: viewerUserId || null,
      viewed_at: trx.fn.now(),
    });
    await trx('company_details').where({ user_id: sellerId }).increment('profile_views_count', 1);
  });

  const row = await db('company_details').where({ user_id: sellerId }).select('profile_views_count').first();
  return parseInt(row?.profile_views_count || 0, 10);
};

/**
 * Read profile views count for a seller.
 * @param {number} sellerId
 * @returns {Promise<number>}
 */
const getProfileViewsCount = async (sellerId) => {
  const row = await db('company_details').where({ user_id: sellerId }).select('profile_views_count').first();
  return parseInt(row?.profile_views_count || 0, 10);
};

module.exports = {
  findSellerById,
  findSellers,
  findNearbySellers,
  incrementProfileViews,
  getProfileViewsCount,
};
