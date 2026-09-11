const notificationService = require('../services/notificationService');
const translationService = require('../services/translationTestService');
const { success } = require('../utils/response');

/**
 * Extracts language code from query ('lang' or 'language') or headers ('x-language' or 'accept-language').
 */
const extractRequestLanguage = (req) => {
  const queryLang = req.query?.lang || req.query?.language;
  if (queryLang && typeof queryLang === 'string') return queryLang.toLowerCase().trim();
  const headerLang = req.headers?.['x-language'] || req.headers?.['accept-language'];
  if (headerLang && typeof headerLang === 'string') {
    const firstCode = headerLang.split(',')[0].split('-')[0].trim().toLowerCase();
    if (firstCode && firstCode !== '*' && translationService.SUPPORTED_LANGUAGES[firstCode]) {
      return firstCode;
    }
  }
  return 'en';
};

/**
 * GET /notifications
 * Paginated in-app notification inbox (RFQ + inquiry related).
 * Optional `role=buyer|seller` for dual-role (buyer_seller) users.
 */
const listNotifications = async (req, res, next) => {
  try {
    const lang = extractRequestLanguage(req);
    const data = await notificationService.listNotifications(req.user.id, {
      page: req.query.page,
      limit: req.query.limit,
      is_read: req.query.is_read,
      type: req.query.type,
      role: req.query.role,
    });
    const finalData = await translationService.translateNotificationList(data, lang);
    return success(res, 'Notifications fetched successfully.', finalData);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /notifications/unread-count
 * Optional `role=buyer|seller` scopes the count.
 */
const getUnreadCount = async (req, res, next) => {
  try {
    const data = await notificationService.getUnreadCount(req.user.id, {
      role: req.query.role,
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
 * Mark unread notifications as read.
 * Optional query/body `role=buyer|seller` — for buyer_seller users, clears
 * only that marketplace side (other side stays unread).
 * Omitting role marks all unread notifications.
 */
const markAllRead = async (req, res, next) => {
  try {
    const role = req.query.role || req.body?.role || null;
    const data = await notificationService.markAllNotificationsRead(req.user.id, { role });
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
