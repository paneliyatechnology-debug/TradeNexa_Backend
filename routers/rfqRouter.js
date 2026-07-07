/**
 * RFQ module routes — buyer, supplier, quotation, and admin under /rfqs.
 */
const express = require('express');
const rfqController = require('../controllers/rfqController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const {
  idParam,
  rfqCreateRules,
  rfqUpdateRules,
  rfqListQuery,
  quotationCreateRules,
  quotationUpdateRules,
  quotationRevisionRules,
  adminRfqStatusRules,
  paginationQuery,
} = require('../middleware/resourceValidation');
const { param } = require('express-validator');

const router = express.Router();

const quotationIdParam = [param('quotationId').isInt({ min: 1 }).withMessage('Quotation ID must be a positive integer')];

const buyerRoles = authorize('buyer', 'buyer_seller', 'admin');
const supplierRoles = authorize('seller', 'buyer_seller', 'admin');
const adminRoles = authorize('admin', 'super_admin', 'supporter');

// ==========================================
// Public routes
// ==========================================

router.get('/', rfqListQuery, validate, rfqController.getRfqs);
router.get('/latest', rfqController.getLatestRfqs);

// ==========================================
// Admin routes (static paths before :id)
// ==========================================

router.get('/admin/list', authenticate, adminRoles, rfqListQuery, validate, rfqController.getAdminRfqs);
router.get('/admin/dashboard/summary', authenticate, adminRoles, rfqController.getRfqSummary);
router.get('/admin/quotations', authenticate, adminRoles, paginationQuery, validate, rfqController.getAdminQuotations);
router.get('/admin/:id', authenticate, adminRoles, idParam, validate, rfqController.getAdminRfq);
router.patch('/admin/:id/status', authenticate, adminRoles, idParam, adminRfqStatusRules, validate, rfqController.updateAdminRfqStatus);

// ==========================================
// Supplier routes
// ==========================================

router.get('/supplier/feed', authenticate, supplierRoles, rfqListQuery, validate, rfqController.getSupplierRfqs);
router.get('/supplier/quotations', authenticate, supplierRoles, rfqListQuery, validate, rfqController.getMyQuotations);
router.get(
  '/supplier/quotations/:quotationId',
  authenticate,
  supplierRoles,
  quotationIdParam,
  validate,
  rfqController.getMyQuotation,
);
router.get('/supplier/:id', authenticate, supplierRoles, idParam, validate, rfqController.getSupplierRfq);

// ==========================================
// Quotation routes
// ==========================================

router.get('/quotations/:quotationId', authenticate, quotationIdParam, validate, rfqController.getQuotation);

router.post(
  '/quotations/:quotationId/accept',
  authenticate,
  buyerRoles,
  quotationIdParam,
  validate,
  rfqController.acceptQuotation,
);

router.post(
  '/quotations/:quotationId/reject',
  authenticate,
  buyerRoles,
  quotationIdParam,
  validate,
  rfqController.rejectQuotation,
);

router.put(
  '/quotations/:quotationId',
  authenticate,
  supplierRoles,
  quotationIdParam,
  quotationUpdateRules,
  validate,
  rfqController.updateQuotation,
);

router.post(
  '/quotations/:quotationId/withdraw',
  authenticate,
  supplierRoles,
  quotationIdParam,
  validate,
  rfqController.withdrawQuotation,
);

router.post(
  '/quotations/:quotationId/request-revision',
  authenticate,
  buyerRoles,
  quotationIdParam,
  quotationRevisionRules,
  validate,
  rfqController.requestRevision,
);

router.post(
  '/quotations/:quotationId/revise',
  authenticate,
  supplierRoles,
  quotationIdParam,
  quotationUpdateRules,
  validate,
  rfqController.reviseQuotation,
);

// ==========================================
// Buyer routes
// ==========================================

router.get('/my', authenticate, buyerRoles, rfqListQuery, validate, rfqController.getMyRfqs);
router.post('/', authenticate, buyerRoles, rfqCreateRules, validate, rfqController.createRfq);

router.post('/:id/publish', authenticate, buyerRoles, idParam, validate, rfqController.publishRfq);
router.post('/:id/cancel', authenticate, buyerRoles, idParam, validate, rfqController.cancelRfq);
router.post('/:id/close', authenticate, buyerRoles, idParam, validate, rfqController.closeRfq);

router.get('/:id/quotations/compare', authenticate, buyerRoles, idParam, validate, rfqController.compareRfqQuotations);
router.get('/:id/quotations', authenticate, buyerRoles, idParam, validate, rfqController.getRfqQuotations);

router.post(
  '/:id/quotations',
  authenticate,
  supplierRoles,
  idParam,
  quotationCreateRules,
  validate,
  rfqController.submitQuotation,
);

router.get('/:id', idParam, validate, rfqController.getRfq);
router.put('/:id', authenticate, idParam, rfqUpdateRules, validate, rfqController.updateRfq);
router.delete('/:id', authenticate, idParam, validate, rfqController.deleteRfq);

module.exports = router;
