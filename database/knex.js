const knex = require('knex');
const knexConfig = require('../knexfile');
const config = require('../config');

const db = knex(knexConfig[config.env] || knexConfig.development);

module.exports = db;
