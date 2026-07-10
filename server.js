/**
 * Server entry point.
 *
 * Verifies database connectivity, then starts the HTTP + Socket.IO listener.
 */
require('dotenv').config();

const http = require('http');
const app = require('./app');
const config = require('./config');
const logger = require('../utils/logger');
const s3Service = require('../services/s3Service');
const db = require('../database/knex');
const { initSocket } = require('./sockets');

// ==========================================
// Server bootstrap
// ==========================================

/**
 * Connect to the database and start the Express + Socket.IO server.
 */
const start = async () => {
  try {
    await db.raw('SELECT 1');
    const server = http.createServer(app);
    initSocket(server);

    server.listen(config.port, () => {
      logger.info(`${config.app.name} running on port ${config.port}`);
      logger.info(`Socket.IO available at path /socket.io`);
      if (s3Service.isEnabled()) {
        logger.info(`S3 storage enabled — media served via ${config.app.url}/media/`);
      }
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

start();
