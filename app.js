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

// Railway / reverse proxies — required so rate limits use the real client IP
// (without this, all users share one bucket and hit 429 Too Many Requests).
app.set('trust proxy', 1);

// ==========================================
// Global middleware
// ==========================================

// Known frontend origins — always allowed regardless of CORS_ORIGIN env var.
const ALWAYS_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'https://www.tradenexa.co',
  'https://tradenexa.co',
  'https://tradenexabackend-dev.up.railway.app',
  'https://tradenexabackend-production.up.railway.app',
];

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser clients (Postman, mobile apps, server-to-server).
    if (!origin) {
      return callback(null, true);
    }

    const { corsOrigins } = config;

    // Wildcard config — reflect actual origin so credentials work.
    if (!corsOrigins || corsOrigins === '*' || corsOrigins === 'true') {
      return callback(null, origin);
    }

    // Always allow known frontend origins.
    if (ALWAYS_ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, origin);
    }

    // Allow private LAN IPs for mobile/LAN testing.
    if (/^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin)) {
      return callback(null, origin);
    }

    // Allow any configured additional origins (comma-separated in CORS_ORIGIN env var).
    const extra = Array.isArray(corsOrigins)
      ? corsOrigins
      : String(corsOrigins).split(',').map((o) => o.trim()).filter(Boolean);

    if (extra.includes(origin)) {
      return callback(null, origin);
    }

    // Reject unknown origins.
    return callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'x-language',
    'x-lang',
    'Accept-Language',
    'Accept',
  ],
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

app.use('/media', mediaRouter);
app.use(uploadConfig.publicPath, mediaRouter);
app.use('/api/media', mediaRouter);
app.use('/api/uploads', mediaRouter);

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
