/**
 * Firebase Admin integration.
 *
 * - Phone OTP: Identity Toolkit REST (send / verify / resend)
 * - Push: FCM messaging for android | ios | web chat notifications
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
 * Lazy FCM messaging client (requires successful init()).
 * @returns {import('firebase-admin').messaging.Messaging|null}
 */
const getMessaging = () => {
  const app = init();
  if (!app) return null;
  return admin.messaging();
};

/**
 * Strip reserved / empty keys from an FCM data map (all values must be strings).
 * @param {Object|undefined} data
 * @returns {Object<string, string>|undefined}
 */
const sanitizeFcmData = (data) => {
  if (!data) return undefined;
  const out = Object.fromEntries(
    Object.entries(data)
      .filter(([k, v]) => {
        if (v === undefined || v === null) return false;
        const key = String(k);
        if (key === 'from' || key === 'message_type') return false;
        if (key.startsWith('google.') || key.startsWith('gcm.')) return false;
        return true;
      })
      .map(([k, v]) => [String(k), String(v)]),
  );
  return Object.keys(out).length ? out : undefined;
};

/**
 * Send one FCM message to a device registration token.
 *
 * Strategy:
 * - android / ios: try platform extras first (channel / APNs), then fall back to notification+data
 * - web: notification+data only, then data-only fallback
 *
 * @param {string} token - FCM registration token
 * @param {{ notification?: Object, data?: Object, android?: Object, apns?: Object }} payload
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

  const data = sanitizeFcmData(payload.data);

  const baseMessage = {
    token: cleanToken,
    ...(notification ? { notification } : {}),
    ...(data ? { data } : {}),
  };

  const hasNativeExtras = Boolean(payload.android || payload.apns);

  // ---------- Native (android / ios): prefer channel / APNs config ----------
  if (hasNativeExtras) {
    const richMessage = {
      ...baseMessage,
      ...(payload.android ? { android: payload.android } : {}),
      ...(payload.apns ? { apns: payload.apns } : {}),
    };

    try {
      const messageId = await messaging.send(richMessage);
      return { success: true, messageId };
    } catch (error) {
      const errorCode = error?.code || error?.errorInfo?.code || 'unknown';
      const errorMessage = error?.message || error?.errorInfo?.message || String(error);
      logger.warn('FCM native (android/ios) send failed — retrying minimal', {
        errorCode,
        errorMessage,
        tokenLen: cleanToken.length,
      });

      try {
        const messageId = await messaging.send(baseMessage);
        logger.info('FCM send succeeded on minimal fallback', { messageId });
        return { success: true, messageId };
      } catch (retryError) {
        const retryCode = retryError?.code || retryError?.errorInfo?.code || 'unknown';
        const retryMessage =
          retryError?.message || retryError?.errorInfo?.message || String(retryError);
        logger.warn('FCM minimal fallback failed', {
          errorCode: retryCode,
          errorMessage: retryMessage,
        });
        return { success: false, errorCode: retryCode, errorMessage: retryMessage };
      }
    }
  }

  // ---------- Web / generic: notification + data, then data-only ----------
  try {
    const messageId = await messaging.send(baseMessage);
    return { success: true, messageId };
  } catch (error) {
    const errorCode = error?.code || error?.errorInfo?.code || 'unknown';
    const errorMessage = error?.message || error?.errorInfo?.message || String(error);
    logger.warn('FCM minimal send failed', {
      errorCode,
      errorMessage,
      tokenLen: cleanToken.length,
    });

    if (data) {
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

/**
 * Whether FCM reported a permanently bad registration token (safe to delete from DB).
 * Do not treat messaging/invalid-argument as token death — that is usually a payload issue.
 * @param {string} errorCode
 * @returns {boolean}
 */
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
