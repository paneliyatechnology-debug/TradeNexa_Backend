/**
 * Chat module routes — RFQ-linked buyer/seller conversations under /chats.
 */
const express = require('express');
const chatController = require('../controllers/chatController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const {
  idParam,
  chatStartConversationRules,
  chatMessageRules,
  chatMessageListQuery,
  chatConversationListQuery,
  chatMarkReadRules,
  chatMediaMessageRules,
} = require('../middleware/resourceValidation');
const { handleChatMediaUpload } = require('../middleware/upload');
const { param } = require('express-validator');

const router = express.Router();

const rfqIdParam = [param('rfqId').isInt({ min: 1 }).withMessage('RFQ ID must be a positive integer')];

/** Buyer, seller, dual-role, and admin may access chat endpoints. */
const chatRoles = authorize('buyer', 'seller', 'buyer_seller', 'admin');

// ==========================================
// Inbox & summary
// ==========================================

router.get(
  '/conversations',
  authenticate,
  chatRoles,
  chatConversationListQuery,
  validate,
  chatController.getMyConversations,
);

router.get('/unread-summary', authenticate, chatRoles, chatController.getUnreadSummary);

// ==========================================
// Conversation lifecycle
// ==========================================

router.post(
  '/conversations',
  authenticate,
  chatRoles,
  chatStartConversationRules,
  validate,
  chatController.startConversation,
);

router.get(
  '/rfqs/:rfqId/conversations',
  authenticate,
  authorize('buyer', 'buyer_seller', 'admin'),
  rfqIdParam,
  chatConversationListQuery,
  validate,
  chatController.getRfqConversations,
);

router.get('/conversations/:id', authenticate, chatRoles, idParam, validate, chatController.getConversation);

// ==========================================
// Messages
// ==========================================

router.get(
  '/conversations/:id/messages',
  authenticate,
  chatRoles,
  idParam,
  chatMessageListQuery,
  validate,
  chatController.getMessages,
);

router.post(
  '/conversations/:id/messages',
  authenticate,
  chatRoles,
  idParam,
  chatMessageRules,
  validate,
  chatController.sendMessage,
);

router.post(
  '/conversations/:id/messages/media',
  authenticate,
  chatRoles,
  idParam,
  handleChatMediaUpload,
  chatMediaMessageRules,
  validate,
  chatController.sendMediaMessage,
);

// ==========================================
// Read receipts
// ==========================================

router.post(
  '/conversations/:id/read',
  authenticate,
  chatRoles,
  idParam,
  chatMarkReadRules,
  validate,
  chatController.markRead,
);

module.exports = router;
