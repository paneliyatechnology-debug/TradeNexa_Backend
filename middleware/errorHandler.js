const logger = require('../utils/logger');

const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors || [];

  // Handle MySQL Duplicate Entry Errors (e.g. Email/Mobile duplicate)
  if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
    statusCode = 409;
    message = 'Duplicate entry found';

    const sqlMsg = err.sqlMessage || '';
    if (sqlMsg.includes('users_email_unique') || sqlMsg.includes('users.email')) {
      message = 'Email already in use';
    } else if (sqlMsg.includes('users_mobile_number_unique') || sqlMsg.includes('users.mobile_number')) {
      message = 'Mobile number already in use';
    } else if (sqlMsg.includes('categories_name_unique') || sqlMsg.includes('categories.name')) {
      message = 'Category name already exists';
    } else if (sqlMsg.includes('categories_slug_unique') || sqlMsg.includes('categories.slug')) {
      message = 'Category name already exists';
    } else if (sqlMsg.includes('products_name_unique') || sqlMsg.includes('products.name')) {
      message = 'Product name already exists';
    } else if (sqlMsg.includes('products_slug_unique') || sqlMsg.includes('products.slug')) {
      message = 'Product name already exists';
    } else if (sqlMsg.includes('unique')) {
      const match = sqlMsg.match(/key '([^']+)'/);
      if (match && match[1]) {
        const parts = match[1].split('.');
        const keyName = parts[parts.length - 1];
        message = `${keyName.replace(/_/g, ' ').replace('unique', '').trim()} already exists`;
      }
    }
  }

  // Handle MySQL Foreign Key Constraints (Insert/Update references invalid row)
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.errno === 1452) {
    statusCode = 400;
    message = 'Invalid reference ID. Associated record does not exist.';
  }

  // Handle MySQL Foreign Key Constraints (Delete row referenced by others)
  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
    statusCode = 409;
    message = 'Cannot delete or modify record. It is referenced by other items.';
  }

  if (statusCode >= 500) {
    logger.error(message, { stack: err.stack, path: req.originalUrl });
    if (process.env.NODE_ENV === 'production') {
      message = 'Internal server error';
    }
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};

module.exports = errorHandler;
