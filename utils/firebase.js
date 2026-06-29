const admin = require('firebase-admin');
const config = require('../config');
const logger = require('./logger');
const { AppError } = require('./response');

let firebaseApp = null;

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

const formatPhone = (mobile) => {
  const cleaned = mobile.replace(/\D/g, '');
  if (cleaned.length === 10) return `+91${cleaned}`;
  if (cleaned.startsWith('91')) return `+${cleaned}`;
  return `+${cleaned}`;
};

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

module.exports = { init, sendOtp, verifyOtp, resendOtp };
