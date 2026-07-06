/**
 * News routes.
 *
 * Public read endpoints with pagination and admin-only write operations.
 * Create/update support multipart thumbnail uploads.
 */
const express = require('express');
const newsController = require('../controllers/newsController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const { handleNewsCreateUpload, handleNewsUpdateUpload } = require('../middleware/upload');
const { idParam, newsCreateRules, newsUpdateRules, paginationQuery } = require('../middleware/resourceValidation');

const router = express.Router();

router.get('/', paginationQuery, validate, newsController.getNewsList);
router.get('/:id', idParam, validate, newsController.getNewsDetails);

router.post(
  '/',
  authenticate,
  authorize('admin'),
  handleNewsCreateUpload,
  newsCreateRules,
  validate,
  newsController.createNews,
);

router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  idParam,
  handleNewsUpdateUpload,
  newsUpdateRules,
  validate,
  newsController.updateNews,
);

router.delete('/:id', authenticate, authorize('admin'), idParam, validate, newsController.deleteNews);

module.exports = router;
