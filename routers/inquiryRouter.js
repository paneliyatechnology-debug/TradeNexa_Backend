/**
 * Inquiry module routes — product inquiry CRUD, seller quote/reject, chat under /inquiries.
 *
 * Static paths (/seller, /quotations/…) are registered before /:id to avoid param conflicts.
 */
const express = require('express');
const inquiryController = require('../controllers/inquiryController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const {
  idParam,
  inquiryCreateRules,
  inquiryUpdateRules,
  inquiryListQuery,
  inquiryRejectRules,
  quotationCreateRules,
  quotationUpdateRules,
  quotationListQuery,
} = require('../middleware/resourceValidation');
const { param } = require('express-validator');

const router = express.Router();

const quotationIdParam = [
  param('quotationId').isInt({ min: 1 }).withMessage('Quotation ID must be a positive integer'),
];

const buyerRoles = authorize('buyer', 'buyer_seller', 'admin');
const sellerRoles = authorize('seller', 'buyer_seller', 'admin');
const buyerOrSellerRoles = authorize(
  'buyer',
  'seller',
  'buyer_seller',
  'admin',
  'super_admin',
  'supporter',
);

// ==========================================
// Seller inbox (static paths before :id)
// ==========================================

router.get(
  '/seller',
  authenticate,
  sellerRoles,
  inquiryListQuery,
  validate,
  inquiryController.getSellerInquiries,
);

router.get(
  '/seller/quotations',
  authenticate,
  sellerRoles,
  quotationListQuery,
  validate,
  inquiryController.getMyQuotations,
);

// ==========================================
// Quotation actions (by quotationId)
// ==========================================

router.post(
  '/quotations/:quotationId/accept',
  authenticate,
  buyerRoles,
  quotationIdParam,
  validate,
  inquiryController.acceptQuotation,
);

router.post(
  '/quotations/:quotationId/reject',
  authenticate,
  buyerRoles,
  quotationIdParam,
  validate,
  inquiryController.rejectQuotation,
);

router.put(
  '/quotations/:quotationId',
  authenticate,
  sellerRoles,
  quotationIdParam,
  quotationUpdateRules,
  validate,
  inquiryController.updateQuotation,
);

router.post(
  '/quotations/:quotationId/withdraw',
  authenticate,
  sellerRoles,
  quotationIdParam,
  validate,
  inquiryController.withdrawQuotation,
);

// ==========================================
// Buyer create / list
// ==========================================

router.get('/my', authenticate, buyerRoles, inquiryListQuery, validate, inquiryController.getMyInquiries);
router.post('/', authenticate, buyerRoles, inquiryCreateRules, validate, inquiryController.createInquiry);

// ==========================================
// Inquiry detail + lifecycle actions
// ==========================================

router.post(
  '/:id/cancel',
  authenticate,
  buyerRoles,
  idParam,
  validate,
  inquiryController.cancelInquiry,
);

router.post(
  '/:id/reject',
  authenticate,
  sellerRoles,
  idParam,
  inquiryRejectRules,
  validate,
  inquiryController.rejectInquiry,
);

router.post(
  '/:id/quotations',
  authenticate,
  sellerRoles,
  idParam,
  quotationCreateRules,
  validate,
  inquiryController.submitQuotation,
);

router.post(
  '/:id/chat',
  authenticate,
  buyerOrSellerRoles,
  idParam,
  validate,
  inquiryController.startChat,
);

router.get('/:id', authenticate, buyerOrSellerRoles, idParam, validate, inquiryController.getInquiry);
router.put(
  '/:id',
  authenticate,
  buyerRoles,
  idParam,
  inquiryUpdateRules,
  validate,
  inquiryController.updateInquiry,
);

module.exports = router;
