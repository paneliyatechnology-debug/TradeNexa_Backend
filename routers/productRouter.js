/**
 * Product routes.
 *
 * Public read endpoints (list, trending, related) and role-based write operations.
 * Create/update support multipart thumbnail uploads.
 * Approval workflow: seller submit + admin review (product_ids[] for one or many).
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
  productApproveRules,
  productRevisionOrRejectRules,
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
// Admin review (static paths before :id)
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

/**
 * Approve — always send product_ids as an array (single or multiple).
 * POST /products/admin/approve  body: { product_ids: [1] } or { product_ids: [1,2,3] }
 */
router.post(
  '/admin/approve',
  authenticate,
  adminRoles,
  productApproveRules,
  validate,
  productController.approveProducts,
);

/** Request revision — product_ids[] + required remarks. */
router.post(
  '/admin/request-revision',
  authenticate,
  adminRoles,
  productRevisionOrRejectRules,
  validate,
  productController.requestProductRevision,
);

/** Reject — product_ids[] + required remarks (terminal). */
router.post(
  '/admin/reject',
  authenticate,
  adminRoles,
  productRevisionOrRejectRules,
  validate,
  productController.rejectProducts,
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
