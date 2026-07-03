/**
 * Express application setup.
 *
 * Configures middleware, static file serving, API routes, and the global error handler.
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const config = require('./config');
const uploadConfig = require('./config/upload');
const s3Service = require('./services/s3Service');
const routers = require('./routers');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const firebase = require('./utils/firebase');

// ==========================================
// Third-party service initialization
// ==========================================

firebase.init();

const app = express();

// ==========================================
// Global middleware
// ==========================================

app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// Static files (local dev only — production uses S3)
// ==========================================

if (!s3Service.isEnabled()) {
  app.use(uploadConfig.publicPath, express.static(uploadConfig.rootDir));
}

app.get('/health', (_req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

// ==========================================
// API routes
// ==========================================

app.use('/api/v1', apiLimiter, routers);

// ==========================================
// 404 & error handling
// ==========================================

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found', errors: [] });
});

app.use(errorHandler);

module.exports = app;
