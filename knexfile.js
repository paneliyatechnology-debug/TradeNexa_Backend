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

function getConnectionConfig() {
  let url =
    process.env.DATABASE_URL ||
    process.env.MYSQL_URL ||
    process.env.MYSQL_PRIVATE_URL ||
    process.env.MYSQL_PUBLIC_URL;

  if (url && typeof url === 'string' && !url.startsWith('${{') && !url.startsWith('VALUE') && url.trim() !== '') {
    try {
      const parsed = new URL(url.replace(/^mysql2:\/\//, 'mysql://'));
      const host = parsed.hostname;
      const port = parseInt(parsed.port, 10) || 3306;
      const user = decodeURIComponent(parsed.username || 'root');
      const password = decodeURIComponent(parsed.password || '');
      const database = (parsed.pathname || '').replace(/^\//, '') || 'tradenexa';

      console.log(`[Knex] Connecting via URL -> Host: ${host}, Port: ${port}, DB: ${database}, User: ${user}`);

      return {
        host,
        port,
        user,
        password,
        database,
        charset: 'utf8mb4',
      };
    } catch (e) {
      console.log('[Knex] Passing connection URL directly to knex.');
      return url;
    }
  }

  const host = process.env.MYSQLHOST || process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.MYSQLPORT || process.env.DB_PORT, 10) || 3306;
  const user = process.env.MYSQLUSER || process.env.DB_USER || 'root';
  const password =
    process.env.MYSQLPASSWORD !== undefined
      ? process.env.MYSQLPASSWORD
      : process.env.DB_PASSWORD || '';
  const database = process.env.MYSQLDATABASE || process.env.DB_NAME || 'tradenexa';

  console.log(`[Knex] Connecting to MySQL at ${host}:${port}, database: ${database}, user: ${user}`);

  return {
    host,
    port,
    user,
    password,
    database,
    charset: 'utf8mb4',
  };
}

const baseConfig = {
  client: 'mysql2',
  connection: getConnectionConfig(),
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
