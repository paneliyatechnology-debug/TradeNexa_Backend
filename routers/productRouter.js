/**
 * Product routes.
 *
 * Public read endpoints (list, trending, related) and role-based write operations.
 * Create/update support multipart thumbnail uploads.
 */
const express = require('express');
const productController = require('../controllers/productController');
const { authenticate, authorize, validate } = require('../middleware/auth');
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
} = require('../middleware/resourceValidation');

const router = express.Router();

// ==========================================
// Public read routes
// ==========================================

router.get('/', productListQuery, validate, productController.getProducts);
router.get('/trending', productTrendingQuery, validate, productController.getTrendingProducts);
router.get('/related', productRelatedQuery, validate, productController.getRelatedProducts);
router.get('/:id', idParam, validate, productController.getProduct);

// ==========================================
// Write routes — seller, buyer_seller, admin
// ==========================================

router.post(
  '/',
  authenticate,
  authorize('seller', 'buyer_seller', 'admin'),
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
  authorize('seller', 'buyer_seller', 'admin'),
  idParam,
  handleProductUpdateUpload,
  validateProductGalleryMediaCount('update'),
  rejectEmptyFileFields([{ name: 'thumbnail', label: 'Thumbnail' }]),
  productUpdateRules,
  validate,
  productController.updateProduct,
);

router.delete(
  '/:id/media',
  authenticate,
  authorize('seller', 'buyer_seller', 'admin'),
  idParam,
  productDeleteMediaRules,
  validate,
  productController.deleteProductMedia,
);

router.delete(
  '/:id',
  authenticate,
  authorize('seller', 'buyer_seller', 'admin'),
  idParam,
  validate,
  productController.deleteProduct,
);

module.exports = router;
