/**
 * Chat module controller — buyer↔seller conversations (one thread per pair).
 */
const chatService = require('../services/chatService');
const userModel = require('../models/userModel');
const { storeUploadedFile } = require('../utils/media');
const { uploadPaths } = require('../constants/uploadPaths');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

// ==========================================
// Inbox & summary
// ==========================================

/**
 * GET /chats/conversations
 * One conversation per buyer/seller pair with last_context.
 */
const getMyConversations = async (req, res, next) => {
  try {
    const data = await chatService.listMyConversations(req.user.id, req.query);
    return success(res, 'Conversations retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

const getUnreadSummary = async (req, res, next) => {
  try {
    const data = await chatService.getUnreadSummary(req.user.id);
    return success(res, 'Unread summary retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// Conversation lifecycle
// ==========================================

/**
 * POST /chats/conversations
 * Continue the shared buyer↔seller thread for an RFQ or inquiry (never duplicates).
 */
const startConversation = async (req, res, next) => {
  try {
    const { rfq_id: rfqId, inquiry_id: inquiryId, seller_id: sellerId } = req.body;
    const userId = req.user.id;

    if (inquiryId) {
      const conversation = await chatService.startInquiryConversation({
        inquiryId: parseInt(inquiryId, 10),
        userId,
      });
      return success(res, 'Conversation ready', conversation, 200);
    }

    const roles = await userModel.getUserRoles(userId);
    const roleCodes = roles.map((r) => r.code);

    let resolvedSellerId = sellerId ? parseInt(sellerId, 10) : null;

    if (roleCodes.includes('buyer') || roleCodes.includes('admin')) {
      if (!resolvedSellerId) {
        return next(new AppError('seller_id is required when buyer starts a conversation', 400));
      }
    } else if (roleCodes.includes('seller') || roleCodes.includes('buyer_seller')) {
      resolvedSellerId = userId;
    } else {
      return next(new AppError('Forbidden: Access denied', HTTP_STATUS.FORBIDDEN));
    }

    const conversation = await chatService.startConversation({
      rfqId: parseInt(rfqId, 10),
      sellerId: resolvedSellerId,
      userId,
    });

    return success(res, 'Conversation ready', conversation, 200);
  } catch (err) {
    next(err);
  }
};

const getRfqConversations = async (req, res, next) => {
  try {
    const data = await chatService.listRfqConversations(req.params.rfqId, req.user.id, req.query);
    return success(res, 'RFQ conversations retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

const getInquiryConversations = async (req, res, next) => {
  try {
    const data = await chatService.listInquiryConversations(
      req.params.inquiryId,
      req.user.id,
      req.query,
    );
    return success(res, 'Inquiry conversations retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /chats/conversations/:id
 * Chat screen: conversation + latest context + messages (marks read by default).
 * Pass ?messages=false for metadata-only detail.
 */
const getConversation = async (req, res, next) => {
  try {
    const includeMessages = req.query.messages !== 'false';
    if (includeMessages) {
      const data = await chatService.getConversationScreen(req.params.id, req.user.id, req.query);
      return success(res, 'Conversation retrieved successfully', data);
    }

    const conversation = await chatService.getConversationDetail(req.params.id, req.user.id);
    return success(res, 'Conversation retrieved successfully', {
      conversation,
      context: conversation.context,
      messages: null,
    });
  } catch (err) {
    next(err);
  }
};

// ==========================================
// Messages
// ==========================================

const getMessages = async (req, res, next) => {
  try {
    const data = await chatService.listMessages(req.params.id, req.user.id, req.query);
    return success(res, 'Messages retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

const sendMessage = async (req, res, next) => {
  try {
    const message = await chatService.sendMessage(req.params.id, req.user.id, req.body);
    return success(res, 'Message sent successfully', message, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

const sendMediaMessage = async (req, res, next) => {
  try {
    if (!req.files?.file?.[0]) {
      return next(new AppError('File is required', HTTP_STATUS.BAD_REQUEST));
    }

    const filePath = await storeUploadedFile(req.files, 'file', uploadPaths.chat(req.params.id));
    const uploaded = req.files.file[0];

    const message = await chatService.sendMediaMessage(req.params.id, req.user.id, {
      messageType: req.body.message_type,
      content: req.body.content || null,
      fileMeta: {
        file_path: filePath,
        file_name: uploaded.originalname,
        file_size: uploaded.size,
        mime_type: uploaded.mimetype,
      },
    });

    return success(res, 'Media message sent successfully', message, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

const markRead = async (req, res, next) => {
  try {
    const lastReadMessageId = req.body.last_read_message_id
      ? parseInt(req.body.last_read_message_id, 10)
      : null;
    const conversation = await chatService.markConversationRead(
      req.params.id,
      req.user.id,
      lastReadMessageId,
    );
    return success(res, 'Messages marked as read', conversation);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMyConversations,
  getRfqConversations,
  getInquiryConversations,
  getUnreadSummary,
  startConversation,
  getConversation,
  getMessages,
  sendMessage,
  sendMediaMessage,
  markRead,
};
