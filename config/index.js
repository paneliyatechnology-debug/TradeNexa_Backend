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
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    registrationExpiry: process.env.JWT_REGISTRATION_EXPIRY || '10m',
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || "tradehub-b7b28",
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || "firebase-adminsdk-fbsvc@tradehub-b7b28.iam.gserviceaccount.com",
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDNye/MigXO3ga5\nwvt8JBetHQXxOoE8LSgifNNLvvbHJJSxhJTYdW948k7iCWiKLmI008NUHO3XpO+2\nvvotrsPjv1xerkcHO4mFfwK/DgJFP4+TKceUIzmCy3IO9pigyCzRnRKwXrcXKdh+\noTe++ywa25VpYF83y9quvfpC7NmYt4jJPLa21Fr6bJjWXdRi7fuqFYGpeoSJKJu0\nyDY56uT+Jz130JIbWOazVyJTbyo4bDBu8hZSFgfKAjbdVPur1vVyNyz/4OG1vYaR\nRecKdPoBCijaShkAugbJrHesTLVCksWqsHAaJGaf4um+KaUPKSHcjdRXFkszs0kj\nbhNjFJI5AgMBAAECggEAZOqK7JCg8YXi4XTTU9j1PWEWuWnZ13NDk8oH6kTPCvCO\n9JDSV2YbkMGu2l0HxX+ijEpuptB6+H27SjBUSlPCX2zHtOydC1hwg6U56QxLI79c\nPqxF4Yj2moP/PoRCa9JOXEq9T/1apwLP1qVjy4Wr5s3Y8vCeMSQIbRnf4LL6sE8r\niKQGx9PXtJyiLiOVLKwpOeocw/wNOEkVxMADpArBTHDOuoLHOGDZm0RDhaXCt7PS\nx6VzUHfTt7+IIO4jtXMnnXZj4lhb8PGUzjIeBoM4bAfwguEuIdfRQTyy3Q3hwUAh\neTVGIEPe8yKC/mI+hMBrDTUKoxLTqKVfWIz+Gru8QwKBgQDtVOzXQE2VD+VAzgdG\nDplgdOO8TVYyNVE7kmsGGcw0Et8UoAsZGihnA3dPYxIswsW7KwklfoUAygK3xPBI\nlPSRjPw68X1CImlGOe4rup80QrGdmjlxg0mhgytka1JqG/vservT7wY2irPVDAoY\nx5FMd97DO4NYloOZbDsxEkVVHwKBgQDd+ddyXktaoPv6C5DnqSYRif4hBsLJPfxH\nhKHnSMbZOyS0IilOhfRKnqhp2r0TRgEN2V+JJtxiOoG94kLxziPo/Y2NoABASyEh\nbsgoyPX5PRgqjuX4jQxCnfI0a5VWBs/LznixEtnZkbOH0oVnZjmbYiRhXQn5hTSw\nVWQxgdGVpwKBgQCVYzOBejRbc5n2ZLknW+EnWexPhs6O5Aix2sQLHwnubUKGFQdn\nUZPE4+WhztaN3jvgSIKFW1IU4RM84XXt+fTH+Vp7L66MhmSFk8lbNSkpGCH89ira\nTK14QLx7hSJnMB4vCEJacMYUZtIzdFSWrGfFHl7VvQw8IuHLHNlVVg7WOQKBgQCt\n/QxDh+eWpQJ8rp4pButg6gG4j10UcjKROEPTTrcWRIZzbydjdhnSd2PYfOyg88kV\nuuFoVn59vBA/7t68O/Dnyf4vGU+5FWplkzjuxv4OGzYa/aECXkRS3wyezAjkwjgU\nLsVpPjZllA/dkUShlH3o7ldHva5411FCOdxr9a56lwKBgQCZS6qQVEP/RK5P8Jxc\ni2mege51teYDNDvr/aoB/ytsPej7Pym8qIEL0PI1UFIwnHzSiWSYiYKgqNIjLQWD\nlBrQJ5pu++Cw2e8assrzClKRv5GqQDkr0OseBBT4R9Q2/SYYomePnshS2ZLwTRLD\nIxASZZ17g9dhzlWYgdExjts7VQ==\n-----END PRIVATE KEY-----\n",
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyA69_MjbZ22YnkFxPqLWOGSOfuJPB44Ni0",
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
        'http://localhost:3001',
        'http://localhost:3002',
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
