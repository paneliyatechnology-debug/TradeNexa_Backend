const db = require('../database/knex');
const { paginate } = require('../utils/pagination');

// Base query helper to join users, roles, company_details, primary address, cities, states
const getSupplierQuery = () => {
  return db('users')
    .join('roles', 'users.role_id', '=', 'roles.id')
    .leftJoin('company_details', 'users.id', '=', 'company_details.user_id')
    .leftJoin('addresses', function () {
      this.on('users.id', '=', 'addresses.user_id').andOn('addresses.is_primary', '=', db.raw('?', [true]));
    })
    .leftJoin('cities', 'addresses.city_id', '=', 'cities.id')
    .leftJoin('states', 'addresses.state_id', '=', 'states.id')
    .whereIn('roles.code', ['seller', 'buyer_seller'])
    .whereNull('users.deleted_at');
};

const findSupplierById = async (id) => {
  const result = await getSupplierQuery()
    .where('users.id', id)
    .select(
      'users.id',
      'company_details.company_name',
      'company_details.profile_image as logo',
      'users.is_verified as verified',
      'company_details.rating',
      'company_details.response_rate',
      'company_details.years_in_business',
      'addresses.latitude',
      'addresses.longitude',
      'cities.name as city',
      'states.name as state',
      'users.is_active'
    )
    .first();

  if (result) {
    result.verified = !!result.verified;
    result.is_active = !!result.is_active;
    result.rating = parseFloat(result.rating || 0);
    result.response_rate = parseFloat(result.response_rate || 0);
  }
  return result;
};

const findSuppliers = async (filters = {}) => {
  const q = getSupplierQuery()
    .select(
      'users.id',
      'company_details.company_name',
      'company_details.profile_image as logo',
      'users.is_verified as verified',
      'company_details.rating',
      'company_details.response_rate',
      'company_details.years_in_business',
      'cities.name as city',
      'states.name as state'
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

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  
  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map(r => ({
    ...r,
    verified: !!r.verified,
    rating: parseFloat(r.rating || 0),
    response_rate: parseFloat(r.response_rate || 0)
  }));
  return paginated;
};

const findNearbySuppliers = async (latitude, longitude, maxDistance = 50, filters = {}) => {
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const maxDist = parseFloat(maxDistance) || 50;

  // Haversine formula distance SQL using addresses coordinates
  const distanceSql = `(6371 * acos(cos(radians(${lat})) * cos(radians(addresses.latitude)) * cos(radians(addresses.longitude) - radians(${lng})) + sin(radians(${lat})) * sin(radians(addresses.latitude))))`;

  const q = getSupplierQuery()
    .whereRaw(`${distanceSql} <= ?`, [maxDist])
    .select(
      'users.id',
      'company_details.company_name',
      'company_details.profile_image as logo',
      'users.is_verified as verified',
      'company_details.rating',
      'company_details.response_rate',
      'company_details.years_in_business',
      'cities.name as city',
      'states.name as state',
      db.raw(`round(${distanceSql}, 2) as distance`)
    )
    .orderBy('distance', 'asc');

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;

  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map(r => ({
    ...r,
    verified: !!r.verified,
    distance: parseFloat(r.distance || 0),
    rating: parseFloat(r.rating || 0)
  }));
  return paginated;
};

module.exports = {
  findSupplierById,
  findSuppliers,
  findNearbySuppliers,
};
