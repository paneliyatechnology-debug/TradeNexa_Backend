/**
 * Application configuration loaded from environment variables.
 */
require('dotenv').config();

// ==========================================
// Config export
// ==========================================

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  app: {
    name: process.env.APP_NAME || 'TradeNexa',
    url: process.env.APP_URL || 'http://localhost:3000',
  },
  /** Web / deep-link targets for push notification click actions. */
  frontend: {
    url: process.env.FRONTEND_URL || process.env.WEB_APP_URL || process.env.APP_URL || 'http://localhost:3000',
    chatPath: process.env.FRONTEND_CHAT_PATH || '/chats',
    pushIcon: process.env.FRONTEND_PUSH_ICON || '/icons/icon-192.png',
    pushBadge: process.env.FRONTEND_PUSH_BADGE || '/icons/badge-72.png',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    registrationExpiry: process.env.JWT_REGISTRATION_EXPIRY || '10m',
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    apiKey: process.env.FIREBASE_API_KEY,
  },
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  /** Parsed allowed CORS origins — comma-separated in CORS_ORIGIN, or * for all. */
  corsOrigins: (() => {
    const raw = (process.env.CORS_ORIGIN || '').trim();
    if (raw === '*') return '*';
    if (raw) {
      return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
    }
    if ((process.env.NODE_ENV || 'development') !== 'production') {
      return [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
      ];
    }
    return ['http://localhost:3000'];
  })(),
  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12,
  rateLimit: {
    /**
     * Global /api/v1 limiter. Set RATE_LIMIT_ENABLED=false to disable.
     * Defaults: enabled in production, disabled in development/test.
     */
    enabled:
      process.env.RATE_LIMIT_ENABLED != null
        ? process.env.RATE_LIMIT_ENABLED === 'true'
        : (process.env.NODE_ENV || 'development') === 'production',
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    /** Per-IP max requests in the window (default 5000 — enough for app + Postman). */
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 5000,
  },
};
