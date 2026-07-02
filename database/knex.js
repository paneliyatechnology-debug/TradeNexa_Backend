/**
 * Knex database connection instance.
 * Shared across all models — configured via knexfile.js and NODE_ENV.
 */
const knex = require('knex');
const knexConfig = require('../knexfile');
const config = require('../config');

// ==========================================
// Database connection
// ==========================================

const db = knex(knexConfig[config.env] || knexConfig.development);

module.exports = db;
