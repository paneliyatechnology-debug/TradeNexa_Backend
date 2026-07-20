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
 * Pass only the platform blocks that apply (android / apns / webpush).
 * @param {string} token
 * @param {{ notification?: Object, data?: Object, android?: Object, apns?: Object, webpush?: Object }} payload
 * @returns {Promise<{ success: boolean, messageId?: string, errorCode?: string }>}
 */
const sendPushToToken = async (token, payload = {}) => {
  const messaging = getMessaging();
  if (!messaging) {
    logger.warn('FCM skipped: Firebase not configured');
    return { success: false, errorCode: 'firebase_not_configured' };
  }
  if (!token) {
    return { success: false, errorCode: 'missing_token' };
  }

  try {
    const message = {
      token,
      notification: payload.notification || undefined,
      data: payload.data || undefined,
    };
    if (payload.android) message.android = payload.android;
    if (payload.apns) message.apns = payload.apns;
    if (payload.webpush) message.webpush = payload.webpush;

    const messageId = await messaging.send(message);
    return { success: true, messageId };
  } catch (error) {
    const errorCode = error?.code || error?.errorInfo?.code || 'unknown';
    logger.warn('FCM send failed', { errorCode, message: error.message });
    return { success: false, errorCode };
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
