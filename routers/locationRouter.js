/**
 * Location reference routes — countries, states, cities for profile/address forms.
 */
const express = require('express');
const locationController = require('../controllers/locationController');
const { validate } = require('../middleware/auth');
const { locationStatesQuery, locationCitiesQuery } = require('../middleware/resourceValidation');

const router = express.Router();

router.get('/countries', locationController.getCountries);

router.get('/states', locationStatesQuery, validate, locationController.getStates);

router.get('/cities', locationCitiesQuery, validate, locationController.getCities);

module.exports = router;
