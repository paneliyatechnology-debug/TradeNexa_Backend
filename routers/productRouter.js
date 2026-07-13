/**
 * Product routes.
 *
 * Public read endpoints (list, trending, related) and role-based write operations.
 * Create/update support multipart thumbnail uploads.
 * Approval workflow: seller submit + admin review / bulk actions.
 */
const express = require('express');
const productController = require('../controllers/productController');
const { authenticate, authorize, optionalAuthenticate, validate } = require('../middleware/auth');
const {
  handleProductCreateUpload,
  handleProductUpdateUpload,
  requireProductThumbnailOnCreate,
  validateProductGalleryMediaCount,
  rejectEmptyFileFields,
} = require('../middleware/upload');
const {
  idParam,
  productCreateRules,
  productUpdateRules,
  productDeleteMediaRules,
  productListQuery,
  productTrendingQuery,
  productRelatedQuery,
  productReviewRemarksRules,
  productRequiredRemarksRules,
  productBulkReviewRules,
  productBulkRevisionOrRejectRules,
  productAdminReviewQuery,
  paginationQuery,
} = require('../middleware/resourceValidation');

const router = express.Router();

const sellerRoles = authorize('seller', 'buyer_seller', 'admin', 'super_admin', 'supporter');
const adminRoles = authorize('admin', 'super_admin', 'supporter');

// ==========================================
// Public read routes (approved + active only)
// ==========================================

router.get('/', optionalAuthenticate, productListQuery, validate, productController.getProducts);
router.get('/trending', optionalAuthenticate, productTrendingQuery, validate, productController.getTrendingProducts);
router.get('/related', optionalAuthenticate, productRelatedQuery, validate, productController.getRelatedProducts);

/** Seller dashboard — all approval statuses for the authenticated seller. */
router.get('/my', authenticate, sellerRoles, productListQuery, validate, productController.getMyProducts);

// ==========================================
// Admin review queue (static paths before :id)
// ==========================================

/** Moderation queue with status filters / search / sort. */
router.get(
  '/admin/reviews',
  authenticate,
  adminRoles,
  productAdminReviewQuery,
  validate,
  productController.getAdminProductReviews,
);

router.post(
  '/admin/bulk-approve',
  authenticate,
  adminRoles,
  productBulkReviewRules,
  validate,
  productController.bulkApproveProducts,
);

router.post(
  '/admin/bulk-request-revision',
  authenticate,
  adminRoles,
  productBulkRevisionOrRejectRules,
  validate,
  productController.bulkRequestRevisionProducts,
);

router.post(
  '/admin/bulk-reject',
  authenticate,
  adminRoles,
  productBulkRevisionOrRejectRules,
  validate,
  productController.bulkRejectProducts,
);

/** Public detail — buyers get 404 unless approved; owner/admin can view any status. */
router.get('/:id', optionalAuthenticate, idParam, validate, productController.getProduct);

// ==========================================
// Write routes — seller create/update + approval actions
// ==========================================

/** Create starts as in_review (not buyer-visible until admin approves). */
router.post(
  '/',
  authenticate,
  sellerRoles,
  handleProductCreateUpload,
  requireProductThumbnailOnCreate,
  validateProductGalleryMediaCount('create'),
  productCreateRules,
  validate,
  productController.createProduct,
);

router.put(
  '/:id',
  authenticate,
  sellerRoles,
  idParam,
  handleProductUpdateUpload,
  validateProductGalleryMediaCount('update'),
  rejectEmptyFileFields([{ name: 'thumbnail', label: 'Thumbnail' }]),
  productUpdateRules,
  validate,
  productController.updateProduct,
);

/** Seller resubmit after revision_required → in_review. */
router.post(
  '/:id/submit',
  authenticate,
  sellerRoles,
  idParam,
  validate,
  productController.submitProductForReview,
);

/** Append-only review timeline for seller owner or admin. */
router.get(
  '/:id/reviews',
  authenticate,
  sellerRoles,
  idParam,
  paginationQuery,
  validate,
  productController.getProductReviews,
);

router.post(
  '/:id/approve',
  authenticate,
  adminRoles,
  idParam,
  productReviewRemarksRules,
  validate,
  productController.approveProduct,
);

router.post(
  '/:id/request-revision',
  authenticate,
  adminRoles,
  idParam,
  productRequiredRemarksRules,
  validate,
  productController.requestProductRevision,
);

router.post(
  '/:id/reject',
  authenticate,
  adminRoles,
  idParam,
  productRequiredRemarksRules,
  validate,
  productController.rejectProduct,
);

router.delete(
  '/:id/media',
  authenticate,
  sellerRoles,
  idParam,
  productDeleteMediaRules,
  validate,
  productController.deleteProductMedia,
);

router.delete(
  '/:id',
  authenticate,
  sellerRoles,
  idParam,
  validate,
  productController.deleteProduct,
);

module.exports = router;
