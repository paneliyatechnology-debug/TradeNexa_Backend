/**
 * Socket.IO server — JWT auth, chat rooms, typing, presence, send_message, read receipts.
 *
 * On connect (and after relevant changes) pushes dual-role badge snapshots:
 * - unread_summary → { total, as_buyer, as_seller, conversations[] }
 * - notification:unread_count → { total, buyer, seller, unread_count }
 *
 * Client can also request: get_unread_summary, notification:get_unread_count
 * Legacy aliases still supported for older clients.
 */
const { Server } = require('socket.io');
const { verifyAccess } = require('../utils/jwt');
const { TOKEN_TYPES } = require('../constants');
const userModel = require('../models/userModel');
const userPresenceModel = require('../models/userPresenceModel');
const chatService = require('../services/chatService');
const chatSocketEmitter = require('../services/chatSocketEmitter');
const notificationService = require('../services/notificationService');
const pushNotificationService = require('../services/pushNotificationService');
const { CHAT_PRESENCE_STATUS, CHAT_SOCKET_EVENT, CHAT_MESSAGE_TYPE } = require('../constants/chat');
const { NOTIFICATION_SOCKET_EVENT } = require('../constants/notification');
const config = require('../config');
const logger = require('../utils/logger');

const onlineUsers = new Map();
/** userId → Map(conversationId → Set(socketId)) — used to suppress chat push while viewing. */
const activeConversations = new Map();

const trackConversationJoin = (userId, conversationId, socketId) => {
  const uid = Number(userId);
  const cid = Number(conversationId);
  if (!uid || !cid || !socketId) return;

  if (!activeConversations.has(uid)) activeConversations.set(uid, new Map());
  const byConv = activeConversations.get(uid);
  if (!byConv.has(cid)) byConv.set(cid, new Set());
  byConv.get(cid).add(socketId);
};

const trackConversationLeave = (userId, conversationId, socketId) => {
  const uid = Number(userId);
  const cid = Number(conversationId);
  const byConv = activeConversations.get(uid);
  if (!byConv) return;

  const sockets = byConv.get(cid);
  if (!sockets) return;
  sockets.delete(socketId);
  if (!sockets.size) byConv.delete(cid);
  if (!byConv.size) activeConversations.delete(uid);
};

const clearSocketConversations = (userId, socketId) => {
  const uid = Number(userId);
  const byConv = activeConversations.get(uid);
  if (!byConv) return;

  for (const [cid, sockets] of byConv.entries()) {
    sockets.delete(socketId);
    if (!sockets.size) byConv.delete(cid);
  }
  if (!byConv.size) activeConversations.delete(uid);
};

const isUserActiveInConversation = (userId, conversationId) => {
  const byConv = activeConversations.get(Number(userId));
  if (!byConv) return false;
  const sockets = byConv.get(Number(conversationId));
  return Boolean(sockets?.size);
};

const extractToken = (socket) => {
  const authToken = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (authToken) return String(authToken).replace(/^Bearer\s+/i, '').trim();

  const header = socket.handshake.headers?.authorization;
  if (!header) return null;
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : String(header).trim();
};

const addOnlineSocket = (userId, socketId) => {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socketId);
};

const removeOnlineSocket = (userId, socketId) => {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return false;
  sockets.delete(socketId);
  if (!sockets.size) {
    onlineUsers.delete(userId);
    return false;
  }
  return true;
};

const isUserOnline = (userId) => onlineUsers.has(userId);

const initSocket = (httpServer) => {
  const corsOrigins = config.corsOrigins === '*' ? '*' : config.corsOrigins;

  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });

  chatSocketEmitter.setIo(io);
  // Optional: track which conversation a socket is viewing (for future push suppress UX)
  pushNotificationService.setActiveConversationChecker(isUserActiveInConversation);

  io.use(async (socket, next) => {
    try {
      const token = extractToken(socket);
      if (!token) return next(new Error('Authentication required'));

      const decoded = verifyAccess(token);
      if (decoded.type !== TOKEN_TYPES.ACCESS) return next(new Error('Invalid token type'));

      const user = await userModel.findUserById(decoded.userId);
      if (!user?.is_active) return next(new Error('User not found or inactive'));

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user.id;
    socket.join(chatSocketEmitter.userRoom(userId));

    const wasOffline = !isUserOnline(userId);
    addOnlineSocket(userId, socket.id);

    if (wasOffline) {
      await userPresenceModel.upsertPresence(userId, CHAT_PRESENCE_STATUS.ONLINE);
      chatSocketEmitter.emitPresenceUpdate(userId, {
        status: CHAT_PRESENCE_STATUS.ONLINE,
        last_seen_at: null,
      });
    }

    // Push dual-role badge snapshots on connect (buyer + seller together):
    // - unread_summary → { total, as_buyer, as_seller, conversations[] }
    // - notification:unread_count → { total, buyer, seller, unread_count }
    chatService.pushUnreadSummary(userId);
    notificationService.pushUnreadCount(userId);

    // ==========================================
    // Conversation rooms
    // ==========================================

    socket.on(CHAT_SOCKET_EVENT.CONVERSATION_JOIN, async ({ conversation_id: conversationId }) => {
      try {
        if (!conversationId) return;
        await chatService.assertUserCanJoinConversation(conversationId, userId);
        socket.join(chatSocketEmitter.conversationRoom(conversationId));
        trackConversationJoin(userId, conversationId, socket.id);
      } catch (error) {
        socket.emit(CHAT_SOCKET_EVENT.ERROR, { message: error.message });
      }
    });

    socket.on(CHAT_SOCKET_EVENT.CONVERSATION_LEAVE, ({ conversation_id: conversationId }) => {
      if (!conversationId) return;
      socket.leave(chatSocketEmitter.conversationRoom(conversationId));
      trackConversationLeave(userId, conversationId, socket.id);
    });

    // ==========================================
    // Unread inbox snapshot (on demand)
    // ==========================================

    socket.on(CHAT_SOCKET_EVENT.GET_UNREAD_SUMMARY, async () => {
      try {
        const data = await chatService.getUnreadInbox(userId);
        socket.emit(CHAT_SOCKET_EVENT.UNREAD_SUMMARY, data);
      } catch (error) {
        socket.emit(CHAT_SOCKET_EVENT.ERROR, { message: error.message });
      }
    });

    // ==========================================
    // In-app notifications (RFQ + inquiry)
    // ==========================================

    socket.on(NOTIFICATION_SOCKET_EVENT.GET_UNREAD_COUNT, async () => {
      try {
        const data = await notificationService.getUnreadCount(userId);
        socket.emit(NOTIFICATION_SOCKET_EVENT.UNREAD_COUNT, data);
      } catch (error) {
        socket.emit(NOTIFICATION_SOCKET_EVENT.ERROR, { message: error.message });
      }
    });

    socket.on(NOTIFICATION_SOCKET_EVENT.MARK_READ, async (payload = {}) => {
      try {
        const notificationId = payload.notification_id || payload.id;
        if (!notificationId) {
          socket.emit(NOTIFICATION_SOCKET_EVENT.ERROR, {
            message: 'notification_id is required',
          });
          return;
        }
        const notification = await notificationService.markNotificationRead(
          userId,
          Number(notificationId),
        );
        socket.emit(NOTIFICATION_SOCKET_EVENT.UPDATED, { notification });
      } catch (error) {
        socket.emit(NOTIFICATION_SOCKET_EVENT.ERROR, { message: error.message });
      }
    });

    socket.on(NOTIFICATION_SOCKET_EVENT.MARK_ALL_READ, async () => {
      try {
        const data = await notificationService.markAllNotificationsRead(userId);
        socket.emit(NOTIFICATION_SOCKET_EVENT.UPDATED, { ...data, all: true });
      } catch (error) {
        socket.emit(NOTIFICATION_SOCKET_EVENT.ERROR, { message: error.message });
      }
    });

    // ==========================================
    // Send message (socket)
    // ==========================================

    const handleSendMessage = async (payload = {}) => {
      try {
        const conversationId = payload.conversation_id;
        if (!conversationId) {
          socket.emit(CHAT_SOCKET_EVENT.ERROR, { message: 'conversation_id is required' });
          return;
        }

        await chatService.assertUserCanJoinConversation(conversationId, userId);
        // Persist + broadcast (receive_message / message:new) via chatService
        await chatService.sendMessage(conversationId, userId, {
          message_type: payload.message_type || CHAT_MESSAGE_TYPE.TEXT,
          content: payload.content || payload.message,
          product_id: payload.product_id,
          quotation_id: payload.quotation_id,
          reply_to_message_id: payload.reply_to_message_id,
        });
      } catch (error) {
        socket.emit(CHAT_SOCKET_EVENT.ERROR, { message: error.message });
      }
    };

    socket.on(CHAT_SOCKET_EVENT.SEND_MESSAGE, handleSendMessage);

    // ==========================================
    // Typing
    // ==========================================

    const handleTypingStart = async ({ conversation_id: conversationId } = {}) => {
      try {
        if (!conversationId) return;
        await chatService.assertUserCanJoinConversation(conversationId, userId);
        chatSocketEmitter.emitTyping(conversationId, {
          user_id: userId,
          is_typing: true,
        });
      } catch (error) {
        socket.emit(CHAT_SOCKET_EVENT.ERROR, { message: error.message });
      }
    };

    const handleTypingStop = async ({ conversation_id: conversationId } = {}) => {
      try {
        if (!conversationId) return;
        await chatService.assertUserCanJoinConversation(conversationId, userId);
        chatSocketEmitter.emitTyping(conversationId, {
          user_id: userId,
          is_typing: false,
        });
      } catch (error) {
        socket.emit(CHAT_SOCKET_EVENT.ERROR, { message: error.message });
      }
    };

    socket.on(CHAT_SOCKET_EVENT.TYPING_START, handleTypingStart);
    socket.on(CHAT_SOCKET_EVENT.TYPING_STOP, handleTypingStop);
    socket.on(CHAT_SOCKET_EVENT.TYPING_START_LEGACY, handleTypingStart);
    socket.on(CHAT_SOCKET_EVENT.TYPING_STOP_LEGACY, handleTypingStop);

    // ==========================================
    // Mark messages read
    // ==========================================

    const handleMarkRead = async (payload = {}) => {
      try {
        const conversationId = payload.conversation_id;
        if (!conversationId) {
          socket.emit(CHAT_SOCKET_EVENT.ERROR, { message: 'conversation_id is required' });
          return;
        }
        await chatService.markConversationRead(
          conversationId,
          userId,
          payload.last_read_message_id || null,
        );
      } catch (error) {
        socket.emit(CHAT_SOCKET_EVENT.ERROR, { message: error.message });
      }
    };

    socket.on(CHAT_SOCKET_EVENT.MARK_MESSAGES_READ, handleMarkRead);
    socket.on(CHAT_SOCKET_EVENT.MESSAGE_READ_LEGACY, handleMarkRead);

    // ==========================================
    // Presence
    // ==========================================

    socket.on(CHAT_SOCKET_EVENT.PRESENCE_PING, async () => {
      await userPresenceModel.upsertPresence(userId, CHAT_PRESENCE_STATUS.ONLINE);
      socket.emit(CHAT_SOCKET_EVENT.PRESENCE_UPDATE, {
        user_id: userId,
        status: CHAT_PRESENCE_STATUS.ONLINE,
      });
    });

    socket.on('disconnect', async () => {
      clearSocketConversations(userId, socket.id);
      const stillOnline = removeOnlineSocket(userId, socket.id);
      if (!stillOnline) {
        const presence = await userPresenceModel.upsertPresence(userId, CHAT_PRESENCE_STATUS.OFFLINE);
        chatSocketEmitter.emitPresenceUpdate(userId, {
          status: CHAT_PRESENCE_STATUS.OFFLINE,
          last_seen_at: presence?.last_seen_at || new Date(),
        });
      }
    });
  });

  logger.info('Socket.IO chat server initialized');
  return io;
};

module.exports = { initSocket, isUserOnline, isUserActiveInConversation };
