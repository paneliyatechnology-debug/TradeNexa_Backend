/**
 * Global Express error handler.
 *
 * Maps operational AppErrors and MySQL constraint violations to consistent JSON responses.
 */
const logger = require('../utils/logger');

/**
 * Express error-handling middleware (4-argument signature).
 * @param {Error} err - Thrown or passed error
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} _next - Express next (unused)
 */
const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors || [];

  // ==========================================
  // MySQL duplicate entry (ER_DUP_ENTRY)
  // ==========================================

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
    } else if (sqlMsg.includes('wishlist_user_id_product_id_unique')) {
      message = 'Product already exists in wishlist';
    } else if (sqlMsg.includes('unique')) {
      const match = sqlMsg.match(/key '([^']+)'/);
      if (match && match[1]) {
        const parts = match[1].split('.');
        const keyName = parts[parts.length - 1];
        message = `${keyName.replace(/_/g, ' ').replace('unique', '').trim()} already exists`;
      }
    }
  }

  // ==========================================
  // MySQL foreign key constraints
  // ==========================================

  // Insert/update references a non-existent row
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.errno === 1452) {
    statusCode = 400;
    message = 'Invalid reference ID. Associated record does not exist.';
  }

  // Delete/update blocked because row is referenced elsewhere
  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
    statusCode = 409;
    message = 'Cannot delete or modify record. It is referenced by other items.';
  }

  // ==========================================
  // Server errors — log and sanitize in production
  // ==========================================

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
