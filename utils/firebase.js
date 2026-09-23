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
 * Maps raw Firebase Identity Toolkit error messages to clear, secure user-facing messages.
 * @param {string} rawError - Raw error message from Firebase Identity Toolkit
 * @returns {string}
 */
const mapFirebaseError = (rawError = '') => {
  if (rawError.includes('MISSING_CLIENT_IDENTIFIER')) {
    return 'Verification token missing. Please complete reCAPTCHA verification to receive OTP.';
  }
  if (rawError.includes('CAPTCHA_CHECK_FAILED') || rawError.includes('MALFORMED')) {
    return 'reCAPTCHA verification failed or has expired. Please try again.';
  }
  if (rawError.includes('INVALID_APP_CREDENTIAL')) {
    return 'Invalid application credential. Please ensure the correct Firebase Web API Key is configured on Railway.';
  }
  if (rawError.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
    return 'Too many attempts from this device. Please try again later.';
  }
  if (rawError.includes('QUOTA_EXCEEDED')) {
    return 'SMS quota exceeded for this period. Please try again later.';
  }
  if (rawError.includes('OPERATION_NOT_ALLOWED')) {
    return 'Phone authentication is not enabled for this Firebase project.';
  }
  if (rawError.includes('INVALID_PHONE_NUMBER')) {
    return 'Invalid mobile number format. Please provide a valid 10-digit mobile number.';
  }
  if (rawError.includes('INVALID_CODE')) {
    return 'Invalid OTP code. Please enter the correct verification code.';
  }
  if (rawError.includes('SESSION_EXPIRED')) {
    return 'OTP session expired. Please request a new verification code.';
  }
  return rawError || 'Authentication request failed. Please try again.';
};

/**
 * Initialize the Firebase Admin app (singleton).
 * Returns null when credentials are not configured.
 * @returns {import('firebase-admin').app.App|null}
 */
const init = () => {
  if (firebaseApp) return firebaseApp;

  const hasProjectId = Boolean(config.firebase.projectId);
  const hasClientEmail = Boolean(config.firebase.clientEmail);
  const hasPrivateKey = Boolean(config.firebase.privateKey);

  logger.info('[Firebase] Initializing Admin SDK', {
    projectId: config.firebase.projectId || 'unconfigured',
    hasCredentials: hasProjectId && hasClientEmail && hasPrivateKey,
    hasApiKey: Boolean(config.firebase.apiKey),
  });

  if (!hasProjectId || !hasClientEmail || !hasPrivateKey) {
    logger.warn('[Firebase] Firebase Admin credentials not fully configured');
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
    logger.info('[Firebase] Admin SDK initialized successfully', {
      projectId: config.firebase.projectId,
    });
    return firebaseApp;
  } catch (error) {
    logger.error('[Firebase] Admin SDK init failed', {
      projectId: config.firebase.projectId,
      error: error.message,
    });
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
 * Dispatches real SMS through Google Firebase.
 * @param {string} mobileNumber - Target mobile number
 * @param {string|null} [recaptchaToken] - Optional reCAPTCHA token (required for non-test numbers)
 * @returns {Promise<{ firebaseVerificationId: string }>}
 */
const sendOtp = async (mobileNumber, recaptchaToken = null) => {
  const hasApiKey = Boolean(config.firebase.apiKey);
  const hasRecaptchaToken = Boolean(recaptchaToken && recaptchaToken.trim());

  logger.info('[Firebase Production] sendOtp initiated', {
    projectId: config.firebase.projectId,
    hasApiKey,
    hasRecaptchaToken,
  });

  if (!config.firebase.apiKey) {
    throw new AppError('Firebase API key not configured on server', 500);
  }

  try {
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
      const rawError = data.error?.message || 'Failed to send OTP';
      const errorCode = rawError.split(' ')[0].replace(':', '').trim();

      logger.warn('[Firebase Production] sendOtp rejected by Google', {
        projectId: config.firebase.projectId,
        status: response.status,
        errorCode,
      });

      const mappedMessage = mapFirebaseError(rawError);
      throw new AppError(mappedMessage, 400);
    }

    logger.info('[Firebase Production] Real SMS OTP dispatched successfully by Google', {
      projectId: config.firebase.projectId,
    });

    return { firebaseVerificationId: data.sessionInfo };
  } catch (err) {
    logger.error('[Firebase Production] sendOtp network/operational error:', { error: err.message });
    throw err;
  }
};

/**
 * Verify an OTP code against a Firebase verification session.
 * Validates the real SMS OTP code directly with Google Identity Toolkit.
 * @param {string} firebaseVerificationId - Session ID from sendOtp
 * @param {string} otp - Verification code entered by the user
 * @returns {Promise<Object>}
 */
const verifyOtp = async (firebaseVerificationId, otp) => {
  if (!config.firebase.apiKey) {
    throw new AppError('Firebase API key not configured on server', 500);
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${config.firebase.apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionInfo: firebaseVerificationId, code: String(otp) }),
  });

  const data = await response.json();
  if (!response.ok) {
    const rawError = data.error?.message || 'Invalid OTP';
    const errorCode = rawError.split(' ')[0].replace(':', '').trim();

    logger.warn('[Firebase Production] verifyOtp rejected by Google', {
      projectId: config.firebase.projectId,
      status: response.status,
      errorCode,
    });

    const mappedMessage = mapFirebaseError(rawError);
    throw new AppError(mappedMessage, 400);
  }

  logger.info('[Firebase Production] Real SMS OTP verified successfully with Google', {
    projectId: config.firebase.projectId,
  });

  return data;
};

/**
 * Verify a Firebase ID Token generated after client-side Phone Auth verification.
 * @param {string} idToken - Firebase JWT ID token from client userCredential.user.getIdToken()
 * @returns {Promise<import('firebase-admin').auth.DecodedIdToken>}
 */
const verifyIdToken = async (idToken) => {
  const app = init();
  if (!app) {
    throw new AppError('Firebase Admin not initialized on server', 500);
  }
  try {
    const decodedToken = await admin.auth(app).verifyIdToken(idToken);
    logger.info('[Firebase Production] ID Token verified successfully via Admin SDK', {
      uid: decodedToken.uid,
      phoneNumber: decodedToken.phone_number,
    });
    return decodedToken;
  } catch (err) {
    logger.warn('[Firebase Production] ID Token verification failed', { error: err.message });
    throw new AppError('Invalid or expired authentication token', 401);
  }
};

/**
 * Resend an OTP using an existing Firebase verification session.
 * @param {string} firebaseVerificationId - Current session ID
 * @param {string|null} [recaptchaToken] - Optional reCAPTCHA token
 * @returns {Promise<{ firebaseVerificationId: string }>}
 */
const resendOtp = async (firebaseVerificationId, recaptchaToken = null) => {
  if (!config.firebase.apiKey) {
    throw new AppError('Firebase API key not configured on server', 500);
  }

  try {
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
      const rawError = data.error?.message || 'Failed to resend OTP';
      const errorCode = rawError.split(' ')[0].replace(':', '').trim();

      logger.warn('[Firebase Production] resendOtp rejected by Google', {
        projectId: config.firebase.projectId,
        status: response.status,
        errorCode,
      });

      const mappedMessage = mapFirebaseError(rawError);
      throw new AppError(mappedMessage, 400);
    }

    logger.info('[Firebase Production] Real SMS OTP resent successfully by Google', {
      projectId: config.firebase.projectId,
    });

    return { firebaseVerificationId: data.sessionInfo };
  } catch (err) {
    logger.error('[Firebase Production] resendOtp error:', { error: err.message });
    throw err;
  }
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
  verifyIdToken,
  resendOtp,
  getMessaging,
  sendPushToToken,
  isInvalidFcmTokenError,
};
