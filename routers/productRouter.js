/**
 * Product routes.
 *
 * Public read endpoints (list, trending, recommended, latest) and role-based write operations.
 * Create/update support multipart thumbnail uploads.
 */
const express = require('express');
const productController = require('../controllers/productController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const {
  handleProductCreateUpload,
  handleProductUpdateUpload,
} = require('../middleware/upload');
const {
  idParam,
  productCreateRules,
  productUpdateRules,
  productListQuery,
  productTrendingQuery,
  productRecommendedQuery,
} = require('../middleware/resourceValidation');

const router = express.Router();

// ==========================================
// Public read routes
// ==========================================

router.get('/', productListQuery, validate, productController.getProducts);
router.get('/trending', productTrendingQuery, validate, productController.getTrendingProducts);
router.get('/recommended', productRecommendedQuery, validate, productController.getRecommendedProducts);
router.get('/latest', productTrendingQuery, validate, productController.getLatestProducts);
router.get('/:id', idParam, validate, productController.getProduct);

// ==========================================
// Write routes — seller, buyer_seller, admin
// ==========================================

router.post(
  '/',
  authenticate,
  authorize('seller', 'buyer_seller', 'admin'),
  handleProductCreateUpload,
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
  productUpdateRules,
  validate,
  productController.updateProduct,
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
