/**
 * Reusable FCM + in-app notification service.
 *
 * All modules (chat, inquiry, quotation, product, RFQ) should call:
 *
 *   await notificationService.send({
 *     receiverId,
 *     type: NOTIFICATION_TYPE.…,
 *     title,
 *     body,
 *     referenceId,
 *     data,
 *     senderId,
 *   });
 *
 * Behaviour:
 * - For RFQ / inquiry types: persist an inbox row, emit socket realtime updates
 * - Chat / product-moderation types: FCM only (not stored in inbox)
 * - Loads every registered device for the user (all phones / platforms)
 * - Skips FCM when no valid token exists (inbox row still created when applicable)
 * - Never throws to callers (failures are logged only)
 * - Removes permanently invalid registration tokens from `devices` after FCM rejects them
 *
 * Low-level FCM transport lives in utils/firebase.js.
 */
const userModel = require('../models/userModel');
const notificationModel = require('../models/notificationModel');
const chatSocketEmitter = require('./chatSocketEmitter');
const firebase = require('../utils/firebase');
const logger = require('../utils/logger');
const { AppError } = require('../utils/response');
const { HTTP_STATUS, DEVICE_TYPES, DEVICE_TYPE_VALUES } = require('../constants');
const {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_VALUES,
  IN_APP_NOTIFICATION_TYPE_SET,
  NOTIFICATION_CLICK_ACTION,
  NOTIFICATION_SOCKET_EVENT,
} = require('../constants/notification');

// ==========================================
// Helpers
// ==========================================

/**
 * Strip control characters and truncate text for FCM / inbox display limits.
 * @param {*} value
 * @param {number} [maxLen=250]
 * @returns {string}
 */
const sanitizeText = (value, maxLen = 250) => {
  const text = String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
};

/**
 * Build FCM `data` map (string values only). Drops reserved keys.
 * Reserved by FCM: from, message_type, google.*, gcm.*
 * @param {Object} [data]
 * @returns {Object<string, string>}
 */
const stringifyData = (data = {}) => {
  const RESERVED = new Set(['from', 'message_type']);
  const out = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const k = String(key);
    if (!k || RESERVED.has(k) || k.startsWith('google.') || k.startsWith('gcm.')) return;
    const str = String(value);
    if (!str) return;
    out[k] = str.length > 500 ? str.slice(0, 500) : str;
  });
  return out;
};

/**
 * Normalize device_type to android | ios | web.
 * @param {string|null|undefined} deviceType
 * @returns {string|null}
 */
const normalizeDeviceType = (deviceType) => {
  const type = String(deviceType || '')
    .toLowerCase()
    .trim();
  return DEVICE_TYPE_VALUES.includes(type) ? type : null;
};

/**
 * Reject obvious mock tokens (e.g. Android `dev_token_…`).
 * Real FCM tokens are typically 100+ characters.
 * @param {string} token
 * @returns {boolean}
 */
const looksLikeValidFcmToken = (token) => {
  const t = String(token || '').trim();
  if (t.length < 80) return false;
  if (/^dev[_-]?token/i.test(t)) return false;
  if (/^mock[-_]/i.test(t)) return false;
  if (/^test[-_]/i.test(t)) return false;
  return true;
};

/**
 * Build platform-specific FCM payload (parity across android / ios / web).
 * @param {string|null} deviceType
 * @param {{ title: string, body: string, data: Object, channelId?: string, badge?: number }} opts
 */
const buildPlatformPushPayload = (deviceType, { title, body, data, channelId, badge }) => {
  const type = normalizeDeviceType(deviceType);
  const safeTitle = sanitizeText(title, 100) || 'TradeNexa';
  const safeBody = sanitizeText(body, 250) || 'You have a new notification';
  const commonData = stringifyData({
    ...data,
    title: safeTitle,
    body: safeBody,
    platform: type || 'unknown',
  });
  const notification = { title: safeTitle, body: safeBody };
  const androidChannel = channelId || 'trade_nexa_notifications';

  if (type === DEVICE_TYPES.ANDROID) {
    return {
      notification,
      data: commonData,
      android: {
        priority: 'high',
        notification: {
          title: safeTitle,
          body: safeBody,
          channelId: androidChannel,
          sound: 'default',
          clickAction: commonData.click_action || NOTIFICATION_CLICK_ACTION.OPEN_CHAT,
          defaultSound: true,
        },
      },
    };
  }

  if (type === DEVICE_TYPES.IOS) {
    return {
      notification,
      data: commonData,
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'alert',
        },
        payload: {
          aps: {
            alert: { title: safeTitle, body: safeBody },
            sound: 'default',
            badge: Number.isFinite(badge) ? badge : 1,
          },
        },
      },
    };
  }

  return { notification, data: commonData };
};

/**
 * Push current unread inbox count to the user's personal socket room.
 * @param {number|number[]} userIds
 */
const pushUnreadCount = (userIds) => {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  ids.filter(Boolean).forEach((uid) => {
    notificationModel
      .countUnread(uid)
      .then((unreadCount) => {
        chatSocketEmitter.emitToUser(uid, NOTIFICATION_SOCKET_EVENT.UNREAD_COUNT, {
          unread_count: unreadCount,
        });
      })
      .catch((err) => {
        logger.warn('[Notification] Failed to push unread_count', {
          userId: uid,
          error: err.message,
        });
      });
  });
};

/**
 * Persist an RFQ/inquiry notification and emit realtime events.
 * @returns {Promise<Object|null>}
 */
const persistInboxNotification = async ({
  userId,
  type,
  title,
  body,
  referenceId,
  senderId,
  clickAction,
  data,
}) => {
  if (!IN_APP_NOTIFICATION_TYPE_SET.has(type)) return null;

  const safeTitle = sanitizeText(title, 100) || 'TradeNexa';
  const safeBody = sanitizeText(body, 500) || 'You have a new notification';

  const notification = await notificationModel.create({
    userId,
    type,
    title: safeTitle,
    body: safeBody,
    referenceId: referenceId != null ? Number(referenceId) || null : null,
    senderId: senderId != null ? Number(senderId) || null : null,
    clickAction: clickAction || null,
    data: data && typeof data === 'object' ? data : null,
  });

  if (notification) {
    chatSocketEmitter.emitToUser(userId, NOTIFICATION_SOCKET_EVENT.NEW, { notification });
    pushUnreadCount(userId);
  }

  return notification;
};

// ==========================================
// Public API — send (FCM + optional inbox)
// ==========================================

/**
 * Send an FCM push to one user (all of their registered platforms).
 * For RFQ/inquiry types, also stores an in-app inbox row and emits sockets.
 * Never throws — safe to await after DB commits without try/catch.
 *
 * @param {Object} params
 * @param {number} params.receiverId - Target user id
 * @param {string} params.type - NOTIFICATION_TYPE.* value
 * @param {string} params.title
 * @param {string} params.body
 * @param {number|string|null} [params.referenceId] - Primary entity id (inquiry, product, …)
 * @param {Object} [params.data] - Extra stringifiable metadata for the client
 * @param {number|null} [params.senderId]
 * @param {string|null} [params.clickAction]
 * @param {string|null} [params.channelId] - Android notification channel (default trade_nexa_notifications)
 * @param {number|null} [params.badge] - iOS badge count
 * @returns {Promise<{ sent: number, skipped: boolean, reason?: string, notification?: Object|null }>}
 */
const send = async ({
  receiverId,
  type,
  title,
  body,
  referenceId = null,
  data = {},
  senderId = null,
  clickAction = null,
  channelId = null,
  badge = null,
}) => {
  try {
    const uid = Number(receiverId);
    if (!uid) {
      logger.warn('Push skipped: missing receiverId', { type });
      return { sent: 0, skipped: true, reason: 'missing_receiver' };
    }

    if (!type || !NOTIFICATION_TYPE_VALUES.includes(type)) {
      logger.warn('Push skipped: invalid notification type', { type, receiverId: uid });
      return { sent: 0, skipped: true, reason: 'invalid_type' };
    }

    // Do not notify the actor about their own action
    if (senderId != null && Number(senderId) === uid) {
      return { sent: 0, skipped: true, reason: 'self_recipient' };
    }

    // Persist RFQ/inquiry inbox row even when the user has no FCM device
    let stored = null;
    try {
      stored = await persistInboxNotification({
        userId: uid,
        type,
        title,
        body,
        referenceId,
        senderId,
        clickAction,
        data,
      });
    } catch (persistError) {
      logger.warn('In-app notification persist failed', {
        receiverId: uid,
        type,
        error: persistError.message,
      });
    }

    const devices = await userModel.findDevicesByUserId(uid);
    if (!devices.length) {
      logger.info('Push skipped: no device token', { receiverId: uid, type });
      return { sent: 0, skipped: true, reason: 'no_device', notification: stored };
    }

    const baseData = stringifyData({
      type,
      reference_id: referenceId,
      sender_id: senderId,
      click_action: clickAction || undefined,
      ...data,
    });

    let sent = 0;

    await Promise.all(
      devices.map(async (device) => {
        if (!looksLikeValidFcmToken(device.device_token)) {
          logger.warn('Push skipped: invalid FCM token shape', {
            receiverId: uid,
            deviceType: device.device_type,
            type,
            tokenLen: String(device.device_token || '').length,
          });
          return;
        }

        const payload = buildPlatformPushPayload(device.device_type, {
          title,
          body,
          data: baseData,
          channelId,
          badge,
        });

        const result = await firebase.sendPushToToken(device.device_token, payload);

        if (result.success) {
          sent += 1;
          logger.info('Push sent', {
            receiverId: uid,
            deviceType: device.device_type,
            type,
            referenceId,
            messageIdFcm: result.messageId,
          });
          return;
        }

        logger.warn('Push failed', {
          receiverId: uid,
          deviceType: device.device_type,
          type,
          referenceId,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        });

        if (firebase.isInvalidFcmTokenError(result.errorCode)) {
          await userModel.deleteDeviceByToken(device.device_token);
          logger.info('Removed invalid FCM device token', {
            receiverId: uid,
            deviceType: device.device_type,
            errorCode: result.errorCode,
          });
        }
      }),
    );

    return { sent, skipped: sent === 0, notification: stored };
  } catch (error) {
    logger.warn('Push notification failed', {
      receiverId,
      type,
      error: error.message,
    });
    return { sent: 0, skipped: true, reason: 'error' };
  }
};

/**
 * Send the same notification to many users (e.g. all RFQ invited sellers).
 * @param {number[]} receiverIds
 * @param {Object} payload - Same shape as send(), without receiverId
 */
const sendToMany = async (receiverIds, payload) => {
  const sender = payload?.senderId != null ? Number(payload.senderId) : null;
  const ids = [
    ...new Set(
      (receiverIds || [])
        .map(Number)
        .filter((id) => id && (sender == null || id !== sender)),
    ),
  ];
  await Promise.all(ids.map((receiverId) => send({ ...payload, receiverId })));
};

// ==========================================
// Public API — inbox (REST / sockets)
// ==========================================

/**
 * Paginated notification list for the authenticated user.
 */
const listNotifications = async (userId, filters = {}) =>
  notificationModel.listForUser(userId, filters);

/**
 * Unread inbox count for the authenticated user.
 */
const getUnreadCount = async (userId) => {
  const unreadCount = await notificationModel.countUnread(userId);
  return { unread_count: unreadCount };
};

/**
 * Mark one notification as read and push updated unread count.
 */
const markNotificationRead = async (userId, notificationId) => {
  const notification = await notificationModel.markRead(notificationId, userId);
  if (!notification) {
    throw new AppError('Notification not found', HTTP_STATUS.NOT_FOUND);
  }

  pushUnreadCount(userId);
  chatSocketEmitter.emitToUser(userId, NOTIFICATION_SOCKET_EVENT.UPDATED, { notification });

  return notification;
};

/**
 * Mark specific notifications as read.
 */
const markNotificationsRead = async (userId, ids = []) => {
  const updated = await notificationModel.markManyRead(userId, ids);
  pushUnreadCount(userId);
  return { updated };
};

/**
 * Mark all unread notifications as read.
 */
const markAllNotificationsRead = async (userId) => {
  const updated = await notificationModel.markAllRead(userId);
  pushUnreadCount(userId);
  return { updated };
};

module.exports = {
  send,
  sendToMany,
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markNotificationsRead,
  markAllNotificationsRead,
  pushUnreadCount,
  buildPlatformPushPayload,
  looksLikeValidFcmToken,
  sanitizeText,
  stringifyData,
  NOTIFICATION_TYPE,
  NOTIFICATION_CLICK_ACTION,
  NOTIFICATION_SOCKET_EVENT,
};
