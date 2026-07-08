/**
 * Socket.IO server — JWT authentication, chat rooms, typing, presence, and read receipts.
 *
 * Mounted from server.js on the shared HTTP server at path /socket.io.
 * Clients authenticate via handshake.auth.token or Authorization header.
 */
const { Server } = require('socket.io');
const { verifyAccess } = require('../utils/jwt');
const { TOKEN_TYPES } = require('../constants');
const userModel = require('../models/userModel');
const userPresenceModel = require('../models/userPresenceModel');
const chatService = require('../services/chatService');
const chatSocketEmitter = require('../services/chatSocketEmitter');
const { CHAT_PRESENCE_STATUS, CHAT_SOCKET_EVENT } = require('../constants/chat');
const config = require('../config');
const logger = require('../utils/logger');

// ==========================================
// In-memory connection tracking
// ==========================================

/** userId → Set<socketId> — supports multiple tabs/devices per user. */
const onlineUsers = new Map();

/** Extract JWT from Socket.IO handshake (auth.token, query, or Authorization header). */
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

/** Remove socket; returns false when user has no remaining connections. */
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

// ==========================================
// Server bootstrap
// ==========================================

/**
 * Initialize Socket.IO on the HTTP server and register chat event handlers.
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
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

  // ==========================================
  // JWT authentication middleware
  // ==========================================

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

  // ==========================================
  // Connection lifecycle
  // ==========================================

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

    // ==========================================
    // Conversation room events
    // ==========================================

    socket.on(CHAT_SOCKET_EVENT.CONVERSATION_JOIN, async ({ conversation_id: conversationId }) => {
      try {
        if (!conversationId) return;
        await chatService.assertUserCanJoinConversation(conversationId, userId);
        socket.join(chatSocketEmitter.conversationRoom(conversationId));
      } catch (error) {
        socket.emit(CHAT_SOCKET_EVENT.ERROR, { message: error.message });
      }
    });

    socket.on(CHAT_SOCKET_EVENT.CONVERSATION_LEAVE, ({ conversation_id: conversationId }) => {
      if (!conversationId) return;
      socket.leave(chatSocketEmitter.conversationRoom(conversationId));
    });

    // ==========================================
    // Typing indicators
    // ==========================================

    socket.on(CHAT_SOCKET_EVENT.TYPING_START, async ({ conversation_id: conversationId }) => {
      try {
        await chatService.assertUserCanJoinConversation(conversationId, userId);
        chatSocketEmitter.emitTyping(conversationId, {
          user_id: userId,
          is_typing: true,
        });
      } catch (error) {
        socket.emit(CHAT_SOCKET_EVENT.ERROR, { message: error.message });
      }
    });

    socket.on(CHAT_SOCKET_EVENT.TYPING_STOP, async ({ conversation_id: conversationId }) => {
      try {
        await chatService.assertUserCanJoinConversation(conversationId, userId);
        chatSocketEmitter.emitTyping(conversationId, {
          user_id: userId,
          is_typing: false,
        });
      } catch (error) {
        socket.emit(CHAT_SOCKET_EVENT.ERROR, { message: error.message });
      }
    });

    // ==========================================
    // Read receipts
    // ==========================================

    socket.on(
      CHAT_SOCKET_EVENT.MESSAGE_READ,
      async ({ conversation_id: conversationId, last_read_message_id: lastReadMessageId }) => {
        try {
          await chatService.markConversationRead(conversationId, userId, lastReadMessageId || null);
        } catch (error) {
          socket.emit(CHAT_SOCKET_EVENT.ERROR, { message: error.message });
        }
      },
    );

    // ==========================================
    // Presence heartbeat
    // ==========================================

    socket.on(CHAT_SOCKET_EVENT.PRESENCE_PING, async () => {
      await userPresenceModel.upsertPresence(userId, CHAT_PRESENCE_STATUS.ONLINE);
      socket.emit(CHAT_SOCKET_EVENT.PRESENCE_UPDATE, {
        user_id: userId,
        status: CHAT_PRESENCE_STATUS.ONLINE,
      });
    });

    // ==========================================
    // Disconnect
    // ==========================================

    socket.on('disconnect', async () => {
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

module.exports = { initSocket, isUserOnline };
