/**
 * Push + in-app notification type constants and click-action helpers.
 *
 * Used by notificationService and all business modules (chat, inquiry,
 * quotation, product approval, RFQ). Keep keys stable — mobile/web clients
 * switch on `type` in the FCM data payload and in-app inbox rows.
 */

const { ROLE_CODES } = require('./index');

// ==========================================
// Notification types
// ==========================================

const NOTIFICATION_TYPE = {
  // Chat (FCM only — never stored in the in-app inbox)
  CHAT_MESSAGE: 'CHAT_MESSAGE',

  // Product inquiry
  INQUIRY_RECEIVED: 'INQUIRY_RECEIVED',
  INQUIRY_REPLY: 'INQUIRY_REPLY',
  INQUIRY_REJECTED: 'INQUIRY_REJECTED',

  // Product-inquiry quotations
  QUOTATION_RECEIVED: 'QUOTATION_RECEIVED',
  QUOTATION_UPDATED: 'QUOTATION_UPDATED',
  QUOTATION_ACCEPTED: 'QUOTATION_ACCEPTED',
  QUOTATION_REJECTED: 'QUOTATION_REJECTED',

  // Product moderation (admin → seller) — FCM only
  PRODUCT_APPROVED: 'PRODUCT_APPROVED',
  PRODUCT_REVISION_REQUIRED: 'PRODUCT_REVISION_REQUIRED',
  PRODUCT_REJECTED: 'PRODUCT_REJECTED',

  // RFQ
  RFQ_RECEIVED: 'RFQ_RECEIVED',
  RFQ_NEW_QUOTATION: 'RFQ_NEW_QUOTATION',
  RFQ_QUOTATION_UPDATED: 'RFQ_QUOTATION_UPDATED',
  RFQ_QUOTATION_ACCEPTED: 'RFQ_QUOTATION_ACCEPTED',
  RFQ_QUOTATION_REJECTED: 'RFQ_QUOTATION_REJECTED',
  RFQ_STATUS_UPDATED: 'RFQ_STATUS_UPDATED',
};

const NOTIFICATION_TYPE_VALUES = Object.values(NOTIFICATION_TYPE);

/**
 * Audience role codes for dual-role inbox filtering.
 * Stored on each notification as `role` = buyer | seller (never buyer_seller).
 * Filter APIs with `?role=buyer` or `?role=seller`.
 */
const NOTIFICATION_ROLE = {
  BUYER: ROLE_CODES.BUYER,
  SELLER: ROLE_CODES.SELLER,
};

const NOTIFICATION_ROLE_VALUES = Object.values(NOTIFICATION_ROLE);

/**
 * Default inbox audience role by type.
 * Override via `role` on send() when a type can go to either side
 * (e.g. RFQ_STATUS_UPDATED).
 */
const NOTIFICATION_TYPE_DEFAULT_ROLE = {
  [NOTIFICATION_TYPE.INQUIRY_RECEIVED]: NOTIFICATION_ROLE.SELLER,
  [NOTIFICATION_TYPE.INQUIRY_REPLY]: NOTIFICATION_ROLE.BUYER,
  [NOTIFICATION_TYPE.INQUIRY_REJECTED]: NOTIFICATION_ROLE.BUYER,
  [NOTIFICATION_TYPE.QUOTATION_RECEIVED]: NOTIFICATION_ROLE.BUYER,
  [NOTIFICATION_TYPE.QUOTATION_UPDATED]: NOTIFICATION_ROLE.BUYER,
  [NOTIFICATION_TYPE.QUOTATION_ACCEPTED]: NOTIFICATION_ROLE.SELLER,
  [NOTIFICATION_TYPE.QUOTATION_REJECTED]: NOTIFICATION_ROLE.SELLER,
  [NOTIFICATION_TYPE.RFQ_RECEIVED]: NOTIFICATION_ROLE.SELLER,
  [NOTIFICATION_TYPE.RFQ_NEW_QUOTATION]: NOTIFICATION_ROLE.BUYER,
  [NOTIFICATION_TYPE.RFQ_QUOTATION_UPDATED]: NOTIFICATION_ROLE.BUYER,
  [NOTIFICATION_TYPE.RFQ_QUOTATION_ACCEPTED]: NOTIFICATION_ROLE.SELLER,
  [NOTIFICATION_TYPE.RFQ_QUOTATION_REJECTED]: NOTIFICATION_ROLE.SELLER,
  // Ambiguous — callers should pass role explicitly
  [NOTIFICATION_TYPE.RFQ_STATUS_UPDATED]: NOTIFICATION_ROLE.SELLER,
};

/**
 * Resolve audience role for an inbox notification (buyer | seller only).
 * @param {string} type
 * @param {string|null|undefined} explicitRole
 * @returns {'buyer'|'seller'|null}
 */
const resolveNotificationRoleCode = (type, explicitRole = null) => {
  if (explicitRole && NOTIFICATION_ROLE_VALUES.includes(explicitRole)) {
    return explicitRole;
  }
  return NOTIFICATION_TYPE_DEFAULT_ROLE[type] || null;
};

/** @deprecated Use resolveNotificationRoleCode */
const resolveNotificationRole = resolveNotificationRoleCode;

/**
 * Types persisted in the in-app notification list.
 * Excludes chat and product-moderation pushes.
 */
const IN_APP_NOTIFICATION_TYPES = [
  NOTIFICATION_TYPE.INQUIRY_RECEIVED,
  NOTIFICATION_TYPE.INQUIRY_REPLY,
  NOTIFICATION_TYPE.INQUIRY_REJECTED,
  NOTIFICATION_TYPE.QUOTATION_RECEIVED,
  NOTIFICATION_TYPE.QUOTATION_UPDATED,
  NOTIFICATION_TYPE.QUOTATION_ACCEPTED,
  NOTIFICATION_TYPE.QUOTATION_REJECTED,
  NOTIFICATION_TYPE.RFQ_RECEIVED,
  NOTIFICATION_TYPE.RFQ_NEW_QUOTATION,
  NOTIFICATION_TYPE.RFQ_QUOTATION_UPDATED,
  NOTIFICATION_TYPE.RFQ_QUOTATION_ACCEPTED,
  NOTIFICATION_TYPE.RFQ_QUOTATION_REJECTED,
  NOTIFICATION_TYPE.RFQ_STATUS_UPDATED,
];

const IN_APP_NOTIFICATION_TYPE_SET = new Set(IN_APP_NOTIFICATION_TYPES);

/** Default click_action values for native clients. */
const NOTIFICATION_CLICK_ACTION = {
  OPEN_CHAT: 'OPEN_CHAT',
  OPEN_INQUIRY: 'OPEN_INQUIRY',
  OPEN_QUOTATION: 'OPEN_QUOTATION',
  OPEN_PRODUCT: 'OPEN_PRODUCT',
  OPEN_RFQ: 'OPEN_RFQ',
};

/** Socket.IO events for the in-app notification inbox. */
const NOTIFICATION_SOCKET_EVENT = {
  // Client → server
  GET_UNREAD_COUNT: 'notification:get_unread_count',
  MARK_READ: 'notification:mark_read',
  MARK_ALL_READ: 'notification:mark_all_read',

  // Server → client
  NEW: 'notification:new',
  UNREAD_COUNT: 'notification:unread_count',
  UPDATED: 'notification:updated',
  /** Clear tray / inbox item on all open sessions after read on any device */
  DISMISS: 'notification:dismiss',
  ERROR: 'notification:error',
};

/**
 * FCM data-only `action` values — clients clear OS notifications on other devices.
 * Sent to every registered device_token for the user.
 */
const FCM_DATA_ACTION = {
  DISMISS_NOTIFICATION: 'DISMISS_NOTIFICATION',
  DISMISS_ALL_NOTIFICATIONS: 'DISMISS_ALL_NOTIFICATIONS',
};

module.exports = {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_VALUES,
  NOTIFICATION_ROLE,
  NOTIFICATION_ROLE_VALUES,
  NOTIFICATION_TYPE_DEFAULT_ROLE,
  resolveNotificationRoleCode,
  resolveNotificationRole,
  IN_APP_NOTIFICATION_TYPES,
  IN_APP_NOTIFICATION_TYPE_SET,
  NOTIFICATION_CLICK_ACTION,
  NOTIFICATION_SOCKET_EVENT,
  FCM_DATA_ACTION,
};
