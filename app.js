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
const mediaRouter = require('./routers/mediaRouter');
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

const corsOptions = {
  origin(origin, callback) {
    const { corsOrigins } = config;

    // Allow non-browser clients (Postman, mobile apps, server-to-server).
    if (!origin) {
      return callback(null, true);
    }

    if (corsOrigins === '*') {
      return callback(null, true);
    }

    if (Array.isArray(corsOrigins) && corsOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
app.use(compression());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// Media proxy (private S3 bucket) & static files
// ==========================================

if (s3Service.isEnabled()) {
  app.use('/media', mediaRouter);
} else {
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
