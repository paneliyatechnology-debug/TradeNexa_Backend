/**
 * Winston logger configuration.
 *
 * Writes JSON logs to files; adds colorized console output in non-production environments.
 */
const winston = require('winston');
const path = require('path');

// ==========================================
// Logger instance
// ==========================================

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.File({ filename: path.join('logs', 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join('logs', 'app.log') }),
  ],
});

// ==========================================
// Development console transport
// ==========================================

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  );
}

module.exports = logger;
