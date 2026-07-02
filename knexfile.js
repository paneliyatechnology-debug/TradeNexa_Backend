/**
 * Knex database configuration.
 *
 * MySQL connection settings for development and production environments.
 */
require('dotenv').config();

// ==========================================
// Shared connection config
// ==========================================

const baseConfig = {
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'tradenexa',
    charset: 'utf8mb4',
  },
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './database/migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './database/seeds',
  },
};

// ==========================================
// Environment exports
// ==========================================

module.exports = {
  development: { ...baseConfig },
  production: { ...baseConfig },
};
