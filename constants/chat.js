/**
 * Chat module constants — message types, RFQ system events, presence, and Socket.IO events.
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
// System events (RFQ workflow integration)
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
// Socket.IO events
// ==========================================

const CHAT_SOCKET_EVENT = {
  // Client → server
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  MESSAGE_READ: 'message:read',
  PRESENCE_PING: 'presence:ping',

  // Server → client
  MESSAGE_NEW: 'message:new',
  MESSAGE_READ_ACK: 'message:read',
  TYPING_INDICATOR: 'typing:indicator',
  PRESENCE_UPDATE: 'presence:update',
  CONVERSATION_UPDATED: 'conversation:updated',
  ERROR: 'chat:error',
};

// ==========================================
// Exports
// ==========================================

module.exports = {
  CHAT_MESSAGE_TYPE,
  CHAT_MESSAGE_TYPE_VALUES,
  CHAT_SYSTEM_EVENT,
  CHAT_SYSTEM_EVENT_LABELS,
  CHAT_PRESENCE_STATUS,
  CHAT_CONVERSATION_SORT_BY_VALUES,
  CHAT_SOCKET_EVENT,
};
