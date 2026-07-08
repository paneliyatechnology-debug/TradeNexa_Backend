/**
 * Socket.IO emit helpers for chat real-time events.
 *
 * Used by chatService after REST writes and by sockets/index.js for typing/presence.
 * Room naming: conversation:{id}, user:{id}
 */
const { CHAT_SOCKET_EVENT } = require('../constants/chat');

let io = null;

// ==========================================
// Socket instance
// ==========================================

/** Attach the Socket.IO server instance (called once from sockets/index.js). */
const setIo = (socketIo) => {
  io = socketIo;
};

// ==========================================
// Room helpers
// ==========================================

/** Socket room name for a conversation thread. */
const conversationRoom = (conversationId) => `conversation:${conversationId}`;

/** Socket room name for a user's personal inbox updates. */
const userRoom = (userId) => `user:${userId}`;

// ==========================================
// Low-level emitters
// ==========================================

/** Emit an event to all sockets in a conversation room. */
const emitToConversation = (conversationId, event, payload) => {
  if (!io) return;
  io.to(conversationRoom(conversationId)).emit(event, payload);
};

/** Emit an event to a specific user's personal room. */
const emitToUser = (userId, event, payload) => {
  if (!io) return;
  io.to(userRoom(userId)).emit(event, payload);
};

// ==========================================
// Domain events
// ==========================================

/** Notify conversation participants of a new message (REST or SYSTEM). */
const emitNewMessage = (conversation, message) => {
  emitToConversation(conversation.id, CHAT_SOCKET_EVENT.MESSAGE_NEW, {
    conversation_id: conversation.id,
    message,
  });

  const recipients = [conversation.buyer_id, conversation.seller_id];
  recipients.forEach((userId) => {
    emitToUser(userId, CHAT_SOCKET_EVENT.CONVERSATION_UPDATED, {
      conversation_id: conversation.id,
      last_message: message,
    });
  });
};

/** Notify conversation room that metadata changed (preview, unread, etc.). */
const emitConversationUpdated = (conversationId, actorId = null) => {
  emitToConversation(conversationId, CHAT_SOCKET_EVENT.CONVERSATION_UPDATED, {
    conversation_id: conversationId,
    actor_id: actorId,
  });
};

/** Broadcast read receipt to conversation participants. */
const emitMessageRead = (conversation, payload) => {
  emitToConversation(conversation.id, CHAT_SOCKET_EVENT.MESSAGE_READ_ACK, {
    conversation_id: conversation.id,
    ...payload,
  });
};

/** Broadcast typing indicator to conversation participants. */
const emitTyping = (conversationId, payload) => {
  emitToConversation(conversationId, CHAT_SOCKET_EVENT.TYPING_INDICATOR, {
    conversation_id: conversationId,
    ...payload,
  });
};

/** Broadcast online/offline status change globally. */
const emitPresenceUpdate = (userId, presence) => {
  if (!io) return;
  io.emit(CHAT_SOCKET_EVENT.PRESENCE_UPDATE, {
    user_id: userId,
    ...presence,
  });
};

module.exports = {
  setIo,
  conversationRoom,
  userRoom,
  emitToConversation,
  emitToUser,
  emitNewMessage,
  emitConversationUpdated,
  emitMessageRead,
  emitTyping,
  emitPresenceUpdate,
};
