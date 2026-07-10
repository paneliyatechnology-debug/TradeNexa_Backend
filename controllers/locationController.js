const locationService = require('../services/locationService');
const { success } = require('../utils/response');

// ==========================================
// Location reference handlers
// ==========================================

/** GET /locations/countries */
const getCountries = async (req, res, next) => {
  try {
    const data = await locationService.getCountries(req.query);
    return success(res, 'Countries retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/** GET /locations/states?country_id= */
const getStates = async (req, res, next) => {
  try {
    const data = await locationService.getStatesByCountryId(Number(req.query.country_id), req.query);
    return success(res, 'States retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/** GET /locations/cities?state_id= */
const getCities = async (req, res, next) => {
  try {
    const data = await locationService.getCitiesByStateId(Number(req.query.state_id), req.query);
    return success(res, 'Cities retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCountries,
  getStates,
  getCities,
};
