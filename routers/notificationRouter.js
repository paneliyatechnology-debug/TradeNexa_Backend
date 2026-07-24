/**
 * In-app notification inbox routes — RFQ + inquiry related only.
 */
const express = require('express');
const notificationController = require('../controllers/notificationController');
const { authenticate, validate } = require('../middleware/auth');
const {
  idParam,
  notificationListQuery,
  notificationUnreadCountQuery,
  notificationMarkManyReadRules,
  notificationMarkAllReadRules,
} = require('../middleware/resourceValidation');

const router = express.Router();

router.use(authenticate);

router.get('/', notificationListQuery, validate, notificationController.listNotifications);
router.get(
  '/unread-count',
  notificationUnreadCountQuery,
  validate,
  notificationController.getUnreadCount,
);
router.post('/read', notificationMarkManyReadRules, validate, notificationController.markManyRead);
router.post(
  '/read-all',
  notificationMarkAllReadRules,
  validate,
  notificationController.markAllRead,
);
router.patch('/:id/read', idParam, validate, notificationController.markRead);

module.exports = router;
