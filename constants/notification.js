/**
 * Push notification type constants and click-action helpers.
 *
 * Used by notificationService and all business modules (chat, inquiry,
 * quotation, product approval, RFQ). Keep keys stable — mobile/web clients
 * switch on `type` in the FCM data payload.
 */

// ==========================================
// Notification types
// ==========================================

const NOTIFICATION_TYPE = {
  // Chat
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

  // Product moderation (admin → seller)
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

/** Default click_action values for native clients. */
const NOTIFICATION_CLICK_ACTION = {
  OPEN_CHAT: 'OPEN_CHAT',
  OPEN_INQUIRY: 'OPEN_INQUIRY',
  OPEN_QUOTATION: 'OPEN_QUOTATION',
  OPEN_PRODUCT: 'OPEN_PRODUCT',
  OPEN_RFQ: 'OPEN_RFQ',
};

module.exports = {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_VALUES,
  NOTIFICATION_CLICK_ACTION,
};
