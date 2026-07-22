/**
 * In-app notification inbox routes — RFQ + inquiry related only.
 */
const express = require('express');
const notificationController = require('../controllers/notificationController');
const { authenticate, validate } = require('../middleware/auth');
const {
  idParam,
  notificationListQuery,
  notificationMarkManyReadRules,
} = require('../middleware/resourceValidation');

const router = express.Router();

router.use(authenticate);

router.get('/', notificationListQuery, validate, notificationController.listNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.post('/read', notificationMarkManyReadRules, validate, notificationController.markManyRead);
router.post('/read-all', notificationController.markAllRead);
router.patch('/:id/read', idParam, validate, notificationController.markRead);

module.exports = router;
