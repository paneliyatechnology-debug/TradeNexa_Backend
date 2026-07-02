/**
 * Server entry point.
 *
 * Verifies database connectivity, then starts the HTTP listener.
 */
require('dotenv').config();

const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./database/knex');

// ==========================================
// Server bootstrap
// ==========================================

/**
 * Connect to the database and start the Express server.
 */
const start = async () => {
  try {
    await db.raw('SELECT 1');
    app.listen(config.port, () => {
      logger.info(`${config.app.name} running on port ${config.port}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

start();
