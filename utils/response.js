const { HTTP_STATUS } = require('../constants');

class AppError extends Error {
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
  }
}

const success = (res, message, data = {}, statusCode = HTTP_STATUS.OK) => {
  return res.status(statusCode).json({ success: true, message, data });
};

module.exports = { AppError, success };
