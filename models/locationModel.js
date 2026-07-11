const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { applyListSort } = require('../utils/listQuery');

const COUNTRY_SORT_FIELDS = {
  id: 'countries.id',
  name: 'countries.name',
  code: 'countries.code',
  created_at: 'countries.created_at',
};

const STATE_SORT_FIELDS = {
  id: 'states.id',
  name: 'states.name',
  code: 'states.code',
  created_at: 'states.created_at',
};

const CITY_SORT_FIELDS = {
  id: 'cities.id',
  name: 'cities.name',
  created_at: 'cities.created_at',
};

const applySearch = (q, columns, search) => {
  if (!search) return;
  const term = `%${search}%`;
  q.where((builder) => {
    columns.forEach((column, index) => {
      if (index === 0) builder.where(column, 'like', term);
      else builder.orWhere(column, 'like', term);
    });
  });
};

const applyIsActiveFilter = (q, table, isActive) => {
  if (isActive === undefined) {
    q.where(`${table}.is_active`, true);
    return;
  }
  q.where(`${table}.is_active`, isActive);
};

const listCountries = async (filters = {}) => {
  const q = db('countries').select('id', 'name', 'code', 'is_active', 'created_at');

  applySearch(q, ['countries.name', 'countries.code'], filters.search);
  if (filters.code) q.where('countries.code', filters.code);
  applyIsActiveFilter(q, 'countries', filters.is_active);

  applyListSort(q, filters, COUNTRY_SORT_FIELDS, { defaultSortBy: 'name', defaultSortOrder: 'asc' });

  return paginate(q, filters.page, filters.limit);
};

const listStatesByCountryId = async (countryId, filters = {}) => {
  const q = db('states')
    .where({ country_id: countryId })
    .select('id', 'country_id', 'name', 'code', 'is_active', 'created_at');

  applySearch(q, ['states.name', 'states.code'], filters.search);
  if (filters.code) q.where('states.code', filters.code);
  applyIsActiveFilter(q, 'states', filters.is_active);

  applyListSort(q, filters, STATE_SORT_FIELDS, { defaultSortBy: 'name', defaultSortOrder: 'asc' });

  return paginate(q, filters.page, filters.limit);
};

const listCitiesByStateId = async (stateId, filters = {}) => {
  const q = db('cities')
    .leftJoin('states', 'cities.state_id', '=', 'states.id')
    .select(
      'cities.id',
      'cities.state_id',
      'states.name as state_name',
      'cities.name',
      'cities.is_active',
      'cities.created_at',
    );

  if (stateId) {
    q.where('cities.state_id', stateId);
  }

  applySearch(q, ['cities.name', 'states.name'], filters.search);
  applyIsActiveFilter(q, 'cities', filters.is_active);

  applyListSort(q, filters, CITY_SORT_FIELDS, { defaultSortBy: 'name', defaultSortOrder: 'asc' });

  return paginate(q, filters.page, filters.limit);
};

const findCountryById = (countryId) => db('countries').where({ id: countryId }).first();

const findStateById = (stateId) => db('states').where({ id: stateId }).first();

const findCityById = (cityId) => db('cities').where({ id: cityId }).first();

/**
 * Verify country → state → city hierarchy (active records only).
 * @returns {Promise<boolean>}
 */
const validateLocationIds = async (countryId, stateId, cityId) => {
  const country = await findCountryById(countryId);
  if (!country?.is_active) return false;

  const state = await findStateById(stateId);
  if (!state?.is_active || state.country_id !== country.id) return false;

  const city = await findCityById(cityId);
  if (!city?.is_active || city.state_id !== state.id) return false;

  return true;
};

module.exports = {
  listCountries,
  listStatesByCountryId,
  listCitiesByStateId,
  findCountryById,
  findStateById,
  findCityById,
  validateLocationIds,
};
