const locationService = require('../services/locationService');
const { success } = require('../utils/response');

// ==========================================
// Location reference handlers
// ==========================================

/** GET /locations/countries */
const getCountries = async (_req, res, next) => {
  try {
    const countries = await locationService.getCountries();
    return success(res, 'Countries retrieved successfully', countries);
  } catch (err) {
    next(err);
  }
};

/** GET /locations/states?country_id= */
const getStates = async (req, res, next) => {
  try {
    const states = await locationService.getStatesByCountryId(Number(req.query.country_id));
    return success(res, 'States retrieved successfully', states);
  } catch (err) {
    next(err);
  }
};

/** GET /locations/cities?state_id= */
const getCities = async (req, res, next) => {
  try {
    const cities = await locationService.getCitiesByStateId(Number(req.query.state_id));
    return success(res, 'Cities retrieved successfully', cities);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCountries,
  getStates,
  getCities,
};
