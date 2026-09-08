/**
 * Knex database configuration.
 *
 * MySQL connection settings for development and production environments.
 * On Railway, use mysql.railway.internal (injected via Railway env vars).
 */
require('dotenv').config();

// ==========================================
// Shared connection config
// ==========================================

const baseConfig = {
  client: 'mysql2',
  connection: process.env.MYSQL_URL || process.env.DATABASE_URL || {
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT, 10) || 3306,
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'tradenexa',
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
