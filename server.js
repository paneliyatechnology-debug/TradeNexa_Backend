/**
 * Server entry point.
 *
 * Verifies database connectivity, then starts the HTTP + Socket.IO listener.
 */
require('dotenv').config();

const http = require('http');
const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const s3Service = require('./services/s3Service');
const db = require('./database/knex');
const { initSocket } = require('./sockets');

// ==========================================
// Server bootstrap
// ==========================================

/**
 * Connect to the database and start the Express + Socket.IO server.
 */
const start = async () => {
  try {
    console.log('[Server] Verifying database connection...');
    await db.raw('SELECT 1');
    console.log('[Server] Database connected successfully!');

    const server = http.createServer(app);
    initSocket(server);

    server.listen(config.port, '0.0.0.0', () => {
      console.log(`[Server] ${config.app.name} listening on port ${config.port} (0.0.0.0)`);
      logger.info(`${config.app.name} running on port ${config.port} (0.0.0.0)`);
      logger.info(`Socket.IO available at path /socket.io`);
      if (s3Service.isEnabled()) {
        logger.info(`S3 storage enabled — media served via ${config.app.url}/media/`);
      }
    });
  } catch (error) {
    console.error('[Server] Failed to start server:', error);
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

start();
