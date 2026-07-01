const express = require('express');
const newsController = require('../controllers/newsController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const { idParam, newsCreateRules, newsUpdateRules, paginationQuery } = require('../middleware/resourceValidation');

const router = express.Router();

router.get('/', paginationQuery, validate, newsController.getNewsList);
router.get('/:id', idParam, validate, newsController.getNewsDetails);

// Admin-only write/delete endpoints
router.post('/', authenticate, authorize('admin'), newsCreateRules, validate, newsController.createNews);
router.put('/:id', authenticate, authorize('admin'), idParam, newsUpdateRules, validate, newsController.updateNews);
router.delete('/:id', authenticate, authorize('admin'), idParam, validate, newsController.deleteNews);

module.exports = router;
