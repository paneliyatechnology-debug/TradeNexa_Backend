/**
 * Chat module constants — message types, system events, presence, context, Socket.IO events.
 */

// ==========================================
// Message types
// ==========================================

const CHAT_MESSAGE_TYPE = {
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  DOCUMENT: 'DOCUMENT',
  PRODUCT: 'PRODUCT',
  QUOTATION: 'QUOTATION',
  SYSTEM: 'SYSTEM',
};

const CHAT_MESSAGE_TYPE_VALUES = Object.values(CHAT_MESSAGE_TYPE);

// ==========================================
// Conversation context (latest product / RFQ / enquiry)
// ==========================================

const CHAT_CONTEXT_TYPE = {
  PRODUCT: 'product',
  RFQ: 'rfq',
  ENQUIRY: 'enquiry',
};

const CHAT_CONTEXT_TYPE_VALUES = Object.values(CHAT_CONTEXT_TYPE);

// ==========================================
// System events (RFQ / inquiry workflow)
// ==========================================

const CHAT_SYSTEM_EVENT = {
  QUOTATION_SUBMITTED: 'QUOTATION_SUBMITTED',
  QUOTATION_UPDATED: 'QUOTATION_UPDATED',
  QUOTATION_REVISED: 'QUOTATION_REVISED',
  REVISION_REQUESTED: 'REVISION_REQUESTED',
  QUOTATION_ACCEPTED: 'QUOTATION_ACCEPTED',
  QUOTATION_REJECTED: 'QUOTATION_REJECTED',
  QUOTATION_WITHDRAWN: 'QUOTATION_WITHDRAWN',
  RFQ_AWARDED: 'RFQ_AWARDED',
  RFQ_CANCELLED: 'RFQ_CANCELLED',
  /** Seeded into the shared thread when RFQ chat is opened (parity with product card on inquiry). */
  RFQ_SHARED: 'RFQ_SHARED',
  INQUIRY_CREATED: 'INQUIRY_CREATED',
  INQUIRY_REJECTED: 'INQUIRY_REJECTED',
  INQUIRY_CANCELLED: 'INQUIRY_CANCELLED',
  INQUIRY_ACCEPTED: 'INQUIRY_ACCEPTED',
};

const CHAT_SYSTEM_EVENT_LABELS = {
  [CHAT_SYSTEM_EVENT.QUOTATION_SUBMITTED]: 'Quotation submitted',
  [CHAT_SYSTEM_EVENT.QUOTATION_UPDATED]: 'Quotation updated',
  [CHAT_SYSTEM_EVENT.QUOTATION_REVISED]: 'Quotation revised',
  [CHAT_SYSTEM_EVENT.REVISION_REQUESTED]: 'Buyer requested quotation revision',
  [CHAT_SYSTEM_EVENT.QUOTATION_ACCEPTED]: 'Quotation accepted',
  [CHAT_SYSTEM_EVENT.QUOTATION_REJECTED]: 'Quotation rejected',
  [CHAT_SYSTEM_EVENT.QUOTATION_WITHDRAWN]: 'Quotation withdrawn',
  [CHAT_SYSTEM_EVENT.RFQ_AWARDED]: 'RFQ awarded',
  [CHAT_SYSTEM_EVENT.RFQ_CANCELLED]: 'RFQ cancelled',
  [CHAT_SYSTEM_EVENT.RFQ_SHARED]: 'RFQ shared',
  [CHAT_SYSTEM_EVENT.INQUIRY_CREATED]: 'Inquiry created',
  [CHAT_SYSTEM_EVENT.INQUIRY_REJECTED]: 'Inquiry rejected by seller',
  [CHAT_SYSTEM_EVENT.INQUIRY_CANCELLED]: 'Inquiry cancelled by buyer',
  [CHAT_SYSTEM_EVENT.INQUIRY_ACCEPTED]: 'Inquiry quote accepted',
};

// ==========================================
// Presence
// ==========================================

const CHAT_PRESENCE_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
};

const CHAT_CONVERSATION_SORT_BY_VALUES = ['last_message_at', 'created_at', 'updated_at'];

// ==========================================
// Socket.IO events (IndiaMART-style + legacy aliases)
// ==========================================

const CHAT_SOCKET_EVENT = {
  // Client → server (canonical)
  SEND_MESSAGE: 'send_message',
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',
  MARK_MESSAGES_READ: 'mark_messages_read',
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  PRESENCE_PING: 'presence:ping',
  /** Client requests a fresh unread inbox snapshot */
  GET_UNREAD_SUMMARY: 'get_unread_summary',

  // Legacy aliases (backward compatible)
  TYPING_START_LEGACY: 'typing:start',
  TYPING_STOP_LEGACY: 'typing:stop',
  MESSAGE_READ_LEGACY: 'message:read',

  // Server → client
  RECEIVE_MESSAGE: 'receive_message',
  MESSAGES_READ: 'messages_read',
  MESSAGE_NEW: 'message:new',
  MESSAGE_READ_ACK: 'message:read',
  TYPING_INDICATOR: 'typing:indicator',
  PRESENCE_UPDATE: 'presence:update',
  CONVERSATION_UPDATED: 'conversation:updated',
  /** Full inbox unread snapshot: total + per-conversation unread, sorted by last_message_at DESC */
  UNREAD_SUMMARY: 'unread_summary',
  ERROR: 'chat:error',
};

// ==========================================
// Exports
// ==========================================

module.exports = {
  CHAT_MESSAGE_TYPE,
  CHAT_MESSAGE_TYPE_VALUES,
  CHAT_CONTEXT_TYPE,
  CHAT_CONTEXT_TYPE_VALUES,
  CHAT_SYSTEM_EVENT,
  CHAT_SYSTEM_EVENT_LABELS,
  CHAT_PRESENCE_STATUS,
  CHAT_CONVERSATION_SORT_BY_VALUES,
  CHAT_SOCKET_EVENT,
};
