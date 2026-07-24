const notificationService = require('../services/notificationService');
const { success } = require('../utils/response');

/**
 * GET /notifications
 * Paginated in-app notification inbox (RFQ + inquiry related).
 * Optional `role_id` (buyer/seller role id from GET /roles) for dual-role users.
 */
const listNotifications = async (req, res, next) => {
  try {
    const data = await notificationService.listNotifications(req.user.id, {
      page: req.query.page,
      limit: req.query.limit,
      is_read: req.query.is_read,
      type: req.query.type,
      role_id: req.query.role_id,
    });
    return success(res, 'Notifications fetched successfully.', data);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /notifications/unread-count
 * Optional `role_id` scopes the count.
 */
const getUnreadCount = async (req, res, next) => {
  try {
    const data = await notificationService.getUnreadCount(req.user.id, {
      role_id: req.query.role_id,
    });
    return success(res, 'Unread notification count fetched successfully.', data);
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /notifications/:id/read
 */
const markRead = async (req, res, next) => {
  try {
    const notificationId = parseInt(req.params.id, 10);
    const notification = await notificationService.markNotificationRead(req.user.id, notificationId);
    return success(res, 'Notification marked as read.', { notification });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /notifications/read
 * Body: { ids: number[] } — mark selected notifications read.
 */
const markManyRead = async (req, res, next) => {
  try {
    const data = await notificationService.markNotificationsRead(req.user.id, req.body.ids || []);
    return success(res, 'Notifications marked as read.', data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /notifications/read-all
 * Optional query/body `role_id` to clear one inbox only.
 */
const markAllRead = async (req, res, next) => {
  try {
    const roleId = req.query.role_id || req.body?.role_id || null;
    const data = await notificationService.markAllNotificationsRead(req.user.id, {
      role_id: roleId,
    });
    return success(res, 'All notifications marked as read.', data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listNotifications,
  getUnreadCount,
  markRead,
  markManyRead,
  markAllRead,
};
