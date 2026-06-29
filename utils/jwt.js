const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const config = require('../config');
const { TOKEN_TYPES } = require('../constants');

const signAccess = (payload) =>
  jwt.sign({ ...payload, type: TOKEN_TYPES.ACCESS }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiry,
  });

const signRefresh = (payload) =>
  jwt.sign({ ...payload, type: TOKEN_TYPES.REFRESH }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiry,
  });

const signRegistration = (payload) =>
  jwt.sign({ ...payload, type: TOKEN_TYPES.REGISTRATION }, config.jwt.accessSecret, {
    expiresIn: config.jwt.registrationExpiry,
  });

const verifyAccess = (token) => jwt.verify(token, config.jwt.accessSecret);
const verifyRefresh = (token) => jwt.verify(token, config.jwt.refreshSecret);

const hashToken = (token) => bcrypt.hash(token, config.bcryptSaltRounds);
const compareToken = (token, hash) => bcrypt.compare(token, hash);

const buildPayload = (user) => ({
  userId: user.id,
  uuid: user.uuid,
  mobileNumber: user.mobile_number,
});

const generateAuthTokens = (user) => {
  const payload = buildPayload(user);
  return { accessToken: signAccess(payload), refreshToken: signRefresh(payload) };
};

module.exports = {
  signAccess,
  signRefresh,
  signRegistration,
  verifyAccess,
  verifyRefresh,
  hashToken,
  compareToken,
  generateAuthTokens,
};
