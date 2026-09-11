const notificationService = require('../services/notificationService');
const { success } = require('../utils/response');

/**
 * GET /notifications
 * Paginated in-app notification inbox (RFQ + inquiry related).
 * Optional `role=buyer|seller` for dual-role (buyer_seller) users.
 */
const listNotifications = async (req, res, next) => {
  try {
    const data = await notificationService.listNotifications(req.user.id, {
      page: req.query.page,
      limit: req.query.limit,
      is_read: req.query.is_read,
      type: req.query.type,
      role: req.query.role,
    });
    return success(res, 'Notifications fetched successfully.', data);
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

/**
 * POST /notifications/device-token
 * Register or update FCM device token for push notifications.
 */
const saveDeviceToken = async (req, res, next) => {
  try {
    const { device_token, device_type } = req.body;
    if (!device_token) {
      const { AppError } = require('../utils/response');
      return next(new AppError('device_token is required', 400));
    }
    const userModel = require('../models/userModel');
    const saved = await userModel.saveUserDevice(req.user.id, device_type || 'android', device_token);
    return success(res, 'Device token registered successfully', saved);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /notifications/test-push
 * Test push notification delivery directly to a token or registered devices.
 */
const sendTestPush = async (req, res, next) => {
  try {
    const { device_token, device_type, title, body } = req.body;
    const firebase = require('../utils/firebase');
    const userModel = require('../models/userModel');
    const chatSocketEmitter = require('../services/chatSocketEmitter');
    const notificationService = require('../services/notificationService');
    const { AppError } = require('../utils/response');

    const pushTitle = title || 'TradeNexa Push Test';
    const pushBody = body || 'This is a test notification from TradeNexa.';

    // 1. Trigger live in-app socket notification popup immediately
    chatSocketEmitter.emitToUser(req.user.id, 'notification:new', {
      notification: {
        id: Date.now(),
        user_id: req.user.id,
        type: 'INQUIRY_RECEIVED',
        title: pushTitle,
        body: pushBody,
        click_action: '/buyer/inquiries',
        created_at: new Date().toISOString(),
      },
    });
    notificationService.pushUnreadCount(req.user.id);

    // 2. If explicit device token passed, send FCM push to it
    if (device_token) {
      const result = await firebase.sendPushToToken(device_token, {
        notification: { title: pushTitle, body: pushBody },
        data: { type: 'TEST_PUSH', click_action: 'FLUTTER_NOTIFICATION_CLICK' },
      });
      return success(res, 'Test push executed', result);
    }

    // 3. Otherwise send FCM push to all registered devices for this user
    const devices = await userModel.findDevicesByUserId(req.user.id);
    let fcmResults = [];
    if (devices.length > 0) {
      fcmResults = await Promise.all(
        devices.map(async (d) => {
          const res = await firebase.sendPushToToken(d.device_token, {
            notification: { title: pushTitle, body: pushBody },
            data: { type: 'TEST_PUSH', click_action: 'FLUTTER_NOTIFICATION_CLICK' },
          });
          return { deviceId: d.id, deviceType: d.device_type, ...res };
        })
      );
    }

    return success(res, 'Test notification triggered (Socket popup + FCM push)', {
      socket_sent: true,
      registered_devices: devices.length,
      fcm_results: fcmResults,
    });
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
  saveDeviceToken,
  sendTestPush,
};
