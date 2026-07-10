const locationModel = require('../models/locationModel');
const { AppError } = require('../utils/response');

// ==========================================
// Location reference data
// ==========================================

const getCountries = async () => locationModel.listCountries();

const getStatesByCountryId = async (countryId) => {
  const country = await locationModel.findCountryById(countryId);
  if (!country) throw new AppError('Country not found', 404);

  return locationModel.listStatesByCountryId(countryId);
};

const getCitiesByStateId = async (stateId) => {
  const state = await locationModel.findStateById(stateId);
  if (!state) throw new AppError('State not found', 404);

  return locationModel.listCitiesByStateId(stateId);
};

module.exports = {
  getCountries,
  getStatesByCountryId,
  getCitiesByStateId,
};
