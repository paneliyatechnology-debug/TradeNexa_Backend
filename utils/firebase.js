/**
 * Firebase phone authentication integration.
 *
 * Initializes the Firebase Admin SDK and provides OTP send/verify/resend via the REST API.
 */
const admin = require('firebase-admin');
const config = require('../config');
const logger = require('./logger');
const { AppError } = require('./response');

let firebaseApp = null;

// ==========================================
// Initialization
// ==========================================

/**
 * Initialize the Firebase Admin app (singleton).
 * Returns null when credentials are not configured.
 * @returns {import('firebase-admin').app.App|null}
 */
const init = () => {
  if (firebaseApp) return firebaseApp;
  if (!config.firebase.projectId || !config.firebase.clientEmail || !config.firebase.privateKey) {
    logger.warn('Firebase credentials not configured');
    return null;
  }
  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: config.firebase.privateKey,
      }),
    });
    return firebaseApp;
  } catch (error) {
    logger.error('Firebase init failed', { error: error.message });
    return null;
  }
};

// ==========================================
// Phone number formatting
// ==========================================

/**
 * Normalize a mobile number to E.164 format for Firebase.
 * @param {string} mobile - Raw mobile number
 * @returns {string}
 */
const formatPhone = (mobile) => {
  const cleaned = mobile.replace(/\D/g, '');
  if (cleaned.length === 10) return `+91${cleaned}`;
  if (cleaned.startsWith('91')) return `+${cleaned}`;
  return `+${cleaned}`;
};

// ==========================================
// OTP operations
// ==========================================

/**
 * Send an OTP verification code via Firebase Identity Toolkit.
 * @param {string} mobileNumber - Target mobile number
 * @param {string|null} [recaptchaToken] - Optional reCAPTCHA token
 * @returns {Promise<{ firebaseVerificationId: string }>}
 */
const sendOtp = async (mobileNumber, recaptchaToken = null) => {
  if (!config.firebase.apiKey) throw new AppError('Firebase API key not configured', 400);

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${config.firebase.apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phoneNumber: formatPhone(mobileNumber),
      ...(recaptchaToken && { recaptchaToken }),
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new AppError(data.error?.message || 'Failed to send OTP', 400);
  }

  return { firebaseVerificationId: data.sessionInfo };
};

/**
 * Verify an OTP code against a Firebase verification session.
 * @param {string} firebaseVerificationId - Session ID from sendOtp
 * @param {string} otp - Verification code entered by the user
 * @returns {Promise<Object>}
 */
const verifyOtp = async (firebaseVerificationId, otp) => {
  if (!config.firebase.apiKey) throw new AppError('Firebase API key not configured', 400);

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${config.firebase.apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionInfo: firebaseVerificationId, code: otp }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new AppError(data.error?.message || 'Invalid OTP', 400);
  }

  return data;
};

/**
 * Resend an OTP using an existing Firebase verification session.
 * @param {string} firebaseVerificationId - Current session ID
 * @param {string|null} [recaptchaToken] - Optional reCAPTCHA token
 * @returns {Promise<{ firebaseVerificationId: string }>}
 */
const resendOtp = async (firebaseVerificationId, recaptchaToken = null) => {
  if (!config.firebase.apiKey) throw new AppError('Firebase API key not configured', 400);

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${config.firebase.apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionInfo: firebaseVerificationId,
      ...(recaptchaToken && { recaptchaToken }),
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new AppError(data.error?.message || 'Failed to resend OTP', 400);
  }

  return { firebaseVerificationId: data.sessionInfo };
};

// ==========================================
// FCM push messaging
// ==========================================

/**
 * @returns {import('firebase-admin').messaging.Messaging|null}
 */
const getMessaging = () => {
  const app = init();
  if (!app) return null;
  return admin.messaging();
};

/**
 * Send an FCM message to a single device token.
 * Uses a minimal payload first for reliability (avoids webpush invalid-argument).
 * @param {string} token
 * @param {{ notification?: Object, data?: Object, android?: Object, apns?: Object, webpush?: Object }} payload
 * @returns {Promise<{ success: boolean, messageId?: string, errorCode?: string, errorMessage?: string }>}
 */
const sendPushToToken = async (token, payload = {}) => {
  const messaging = getMessaging();
  if (!messaging) {
    logger.warn('FCM skipped: Firebase not configured');
    return { success: false, errorCode: 'firebase_not_configured' };
  }

  const cleanToken = String(token || '')
    .trim()
    .replace(/^"+|"+$/g, '')
    .replace(/\s+/g, '');
  if (!cleanToken) {
    return { success: false, errorCode: 'missing_token' };
  }

  const notification = payload.notification
    ? {
        title: String(payload.notification.title || 'New message').slice(0, 100),
        body: String(payload.notification.body || 'You have a new message').slice(0, 250),
      }
    : undefined;

  const data = payload.data
    ? Object.fromEntries(
        Object.entries(payload.data)
          .filter(([k, v]) => {
            if (v === undefined || v === null) return false;
            const key = String(k);
            if (key === 'from' || key === 'message_type') return false;
            if (key.startsWith('google.') || key.startsWith('gcm.')) return false;
            return true;
          })
          .map(([k, v]) => [String(k), String(v)]),
      )
    : undefined;

  // Attempt 1: notification + data only (works for android / ios / web tokens)
  const minimalMessage = {
    token: cleanToken,
    ...(notification ? { notification } : {}),
    ...(data && Object.keys(data).length ? { data } : {}),
  };

  try {
    const messageId = await messaging.send(minimalMessage);
    return { success: true, messageId };
  } catch (error) {
    const errorCode = error?.code || error?.errorInfo?.code || 'unknown';
    const errorMessage = error?.message || error?.errorInfo?.message || String(error);
    logger.warn('FCM minimal send failed', { errorCode, errorMessage, tokenLen: cleanToken.length });

    // Attempt 2: platform-specific extras (android / apns only — never webpush)
    const richMessage = {
      token: cleanToken,
      ...(notification ? { notification } : {}),
      ...(data && Object.keys(data).length ? { data } : {}),
    };
    if (payload.android) richMessage.android = payload.android;
    if (payload.apns) richMessage.apns = payload.apns;

    if (payload.android || payload.apns) {
      try {
        const messageId = await messaging.send(richMessage);
        logger.info('FCM send succeeded with platform extras', { messageId });
        return { success: true, messageId };
      } catch (richError) {
        const richCode = richError?.code || richError?.errorInfo?.code || 'unknown';
        const richMessageText =
          richError?.message || richError?.errorInfo?.message || String(richError);
        logger.warn('FCM rich send failed', {
          errorCode: richCode,
          errorMessage: richMessageText,
        });
        return { success: false, errorCode: richCode, errorMessage: richMessageText };
      }
    }

    // Attempt 3: data-only (service worker can display notification on web)
    if (data && Object.keys(data).length) {
      try {
        const messageId = await messaging.send({
          token: cleanToken,
          data: {
            ...data,
            title: notification?.title || data.title || 'New message',
            body: notification?.body || data.body || 'You have a new message',
          },
        });
        logger.info('FCM send succeeded as data-only', { messageId });
        return { success: true, messageId };
      } catch (dataError) {
        const dataCode = dataError?.code || dataError?.errorInfo?.code || 'unknown';
        const dataMessage = dataError?.message || dataError?.errorInfo?.message || String(dataError);
        logger.warn('FCM data-only send failed', {
          errorCode: dataCode,
          errorMessage: dataMessage,
        });
        return { success: false, errorCode: dataCode, errorMessage: dataMessage };
      }
    }

    return { success: false, errorCode, errorMessage };
  }
};

/** True when the FCM token should be removed from devices table. */
const isInvalidFcmTokenError = (errorCode) =>
  [
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
  ].includes(errorCode);

module.exports = {
  init,
  sendOtp,
  verifyOtp,
  resendOtp,
  getMessaging,
  sendPushToToken,
  isInvalidFcmTokenError,
};
