const locationModel = require('../models/locationModel');
const { AppError } = require('../utils/response');

// ==========================================
// Location reference data
// ==========================================

const parseListFilters = (query) => ({
  page: query.page,
  limit: query.limit,
  search: query.search?.trim() || undefined,
  code: query.code?.trim() || undefined,
  is_active:
    query.is_active === 'true' ? true : query.is_active === 'false' ? false : undefined,
  sort_by: query.sort_by,
  sort_order: query.sort_order,
});

const getCountries = async (query) => locationModel.listCountries(parseListFilters(query));

const getStatesByCountryId = async (countryId, query) => {
  const country = await locationModel.findCountryById(countryId);
  if (!country) throw new AppError('Country not found', 404);

  return locationModel.listStatesByCountryId(countryId, parseListFilters(query));
};

const getCitiesByStateId = async (stateId, query) => {
  if (stateId) {
    const state = await locationModel.findStateById(stateId);
    if (!state) throw new AppError('State not found', 404);
  }

  return locationModel.listCitiesByStateId(stateId || null, parseListFilters(query));
};

module.exports = {
  getCountries,
  getStatesByCountryId,
  getCitiesByStateId,
};
