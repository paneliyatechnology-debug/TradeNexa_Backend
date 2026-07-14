/**
 * Chat module routes — buyer↔seller conversations under /chats.
 *
 * One conversation per buyer/seller pair. RFQ and inquiry flows continue
 * the same thread and update last_context instead of creating new rooms.
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
const inquiryIdParam = [
  param('inquiryId').isInt({ min: 1 }).withMessage('Inquiry ID must be a positive integer'),
];

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

/** @deprecated Prefer pair inbox; kept for RFQ multi-seller filters. */
router.get(
  '/rfqs/:rfqId/conversations',
  authenticate,
  authorize('buyer', 'buyer_seller', 'admin'),
  rfqIdParam,
  chatConversationListQuery,
  validate,
  chatController.getRfqConversations,
);

/** Resolves to the shared buyer↔seller thread linked to this inquiry. */
router.get(
  '/inquiries/:inquiryId/conversations',
  authenticate,
  chatRoles,
  inquiryIdParam,
  chatConversationListQuery,
  validate,
  chatController.getInquiryConversations,
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
