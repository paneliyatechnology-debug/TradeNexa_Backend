/**
 * Push + in-app notification type constants and click-action helpers.
 *
 * Used by notificationService and all business modules (chat, inquiry,
 * quotation, product approval, RFQ). Keep keys stable — mobile/web clients
 * switch on `type` in the FCM data payload and in-app inbox rows.
 */

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
  RFQ_NEW_QUOTATION: 'RFQ_NEW_QUOTATION',
  RFQ_QUOTATION_UPDATED: 'RFQ_QUOTATION_UPDATED',
  RFQ_QUOTATION_ACCEPTED: 'RFQ_QUOTATION_ACCEPTED',
  RFQ_QUOTATION_REJECTED: 'RFQ_QUOTATION_REJECTED',
  RFQ_STATUS_UPDATED: 'RFQ_STATUS_UPDATED',
};

const NOTIFICATION_TYPE_VALUES = Object.values(NOTIFICATION_TYPE);

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
  ERROR: 'notification:error',
};

module.exports = {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_VALUES,
  IN_APP_NOTIFICATION_TYPES,
  IN_APP_NOTIFICATION_TYPE_SET,
  NOTIFICATION_CLICK_ACTION,
  NOTIFICATION_SOCKET_EVENT,
};
