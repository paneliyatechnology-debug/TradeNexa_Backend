/**
 * Socket.IO emit helpers for chat real-time events.
 *
 * Room naming: conversation:{id}, user:{id}
 */
const { CHAT_SOCKET_EVENT } = require('../constants/chat');

let io = null;

const setIo = (socketIo) => {
  io = socketIo;
};

const conversationRoom = (conversationId) => `conversation:${conversationId}`;
const userRoom = (userId) => `user:${userId}`;

const emitToConversation = (conversationId, event, payload) => {
  if (!io) return;
  io.to(conversationRoom(conversationId)).emit(event, payload);
};

const emitToUser = (userId, event, payload) => {
  if (!io) return;
  io.to(userRoom(userId)).emit(event, payload);
};

/** Notify participants of a new message (canonical receive_message + legacy message:new). */
const emitNewMessage = (conversation, message) => {
  const payload = {
    conversation_id: conversation.id,
    message,
  };

  emitToConversation(conversation.id, CHAT_SOCKET_EVENT.RECEIVE_MESSAGE, payload);
  emitToConversation(conversation.id, CHAT_SOCKET_EVENT.MESSAGE_NEW, payload);

  const recipients = [conversation.buyer_id, conversation.seller_id];
  recipients.forEach((uid) => {
    emitToUser(uid, CHAT_SOCKET_EVENT.CONVERSATION_UPDATED, {
      conversation_id: conversation.id,
      last_message: message,
      last_message_at: message.created_at,
      last_message_sender_id: message.sender_id,
      last_context_type: conversation.last_context_type || null,
      last_context_id: conversation.last_context_id || null,
    });
  });

  // Always send FCM after socket emit (lazy require avoids circular init issues)
  setImmediate(() => {
    try {
      const pushNotificationService = require('./pushNotificationService');
      pushNotificationService
        .sendChatMessagePush(conversation, message)
        .catch((error) => {
          const logger = require('../utils/logger');
          logger.warn('Chat push promise rejected', { error: error.message });
        });
    } catch (error) {
      const logger = require('../utils/logger');
      logger.warn('Chat push failed to start', { error: error.message });
    }
  });
};

const emitConversationUpdated = (conversationId, actorId = null, extras = {}) => {
  emitToConversation(conversationId, CHAT_SOCKET_EVENT.CONVERSATION_UPDATED, {
    conversation_id: conversationId,
    actor_id: actorId,
    ...extras,
  });
};

/** Read receipts — new messages_read + legacy message:read. */
const emitMessagesRead = (conversation, payload) => {
  const body = {
    conversation_id: conversation.id,
    ...payload,
  };
  emitToConversation(conversation.id, CHAT_SOCKET_EVENT.MESSAGES_READ, body);
  emitToConversation(conversation.id, CHAT_SOCKET_EVENT.MESSAGE_READ_ACK, body);

  // Notify the other participant's personal room so sender updates ticks immediately
  const otherId =
    Number(payload.reader_id) === Number(conversation.buyer_id)
      ? conversation.seller_id
      : conversation.buyer_id;
  if (otherId) {
    emitToUser(otherId, CHAT_SOCKET_EVENT.MESSAGES_READ, body);
  }
};

/** @deprecated Use emitMessagesRead */
const emitMessageRead = emitMessagesRead;

const emitTyping = (conversationId, payload) => {
  emitToConversation(conversationId, CHAT_SOCKET_EVENT.TYPING_INDICATOR, {
    conversation_id: conversationId,
    ...payload,
  });
};

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
  emitMessagesRead,
  emitMessageRead,
  emitTyping,
  emitPresenceUpdate,
};
