const locationService = require('../services/locationService');
const translationService = require('../services/translationTestService');
const { success } = require('../utils/response');

const extractRequestLanguage = (req) => {
  const queryLang = req.query?.lang || req.query?.language;
  if (queryLang && typeof queryLang === 'string') return queryLang.toLowerCase().trim();
  const headerLang = req.headers?.['x-language'] || req.headers?.['accept-language'];
  if (headerLang && typeof headerLang === 'string') {
    const firstCode = headerLang.split(',')[0].split('-')[0].trim().toLowerCase();
    if (firstCode && firstCode !== '*' && translationService.SUPPORTED_LANGUAGES[firstCode]) {
      return firstCode;
    }
  }
  return 'en';
};

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

/** GET /locations/cities?state_id= (optional — omit to list all cities) */
const getCities = async (req, res, next) => {
  try {
    const stateId = req.query.state_id ? Number(req.query.state_id) : null;
    const data = await locationService.getCitiesByStateId(stateId, req.query);
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
