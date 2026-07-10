const db = require('../database/knex');

// ==========================================
// Reference data queries
// ==========================================

/** List active countries ordered by name. */
const listCountries = () =>
  db('countries').where({ is_active: true }).select('id', 'name', 'code').orderBy('name', 'asc');

/** List active states for a country. */
const listStatesByCountryId = (countryId) =>
  db('states')
    .where({ country_id: countryId, is_active: true })
    .select('id', 'country_id', 'name', 'code')
    .orderBy('name', 'asc');

/** List active cities for a state. */
const listCitiesByStateId = (stateId) =>
  db('cities')
    .where({ state_id: stateId, is_active: true })
    .select('id', 'state_id', 'name')
    .orderBy('name', 'asc');

const findCountryById = (countryId) =>
  db('countries').where({ id: countryId, is_active: true }).first();

const findStateById = (stateId) => db('states').where({ id: stateId, is_active: true }).first();

const findCityById = (cityId) => db('cities').where({ id: cityId, is_active: true }).first();

/**
 * Verify country → state → city hierarchy.
 * @returns {Promise<boolean>}
 */
const validateLocationIds = async (countryId, stateId, cityId) => {
  const country = await findCountryById(countryId);
  if (!country) return false;

  const state = await findStateById(stateId);
  if (!state || state.country_id !== country.id) return false;

  const city = await findCityById(cityId);
  if (!city || city.state_id !== state.id) return false;

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
