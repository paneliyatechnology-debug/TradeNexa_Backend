const express = require('express');
const productController = require('../controllers/productController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const { idParam, productCreateRules, productUpdateRules, productListQuery } = require('../middleware/resourceValidation');

const router = express.Router();

router.get('/', productListQuery, validate, productController.getProducts);
router.get('/trending', productController.getTrendingProducts);
router.get('/recommended', productController.getRecommendedProducts);
router.get('/latest', productController.getLatestProducts);
router.get('/:id', idParam, validate, productController.getProduct);

// Write/update/delete endpoints (Admin, Seller, Buyer+Seller roles)
router.post('/', authenticate, authorize('seller', 'buyer_seller', 'admin'), productCreateRules, validate, productController.createProduct);
router.put('/:id', authenticate, authorize('seller', 'buyer_seller', 'admin'), idParam, productUpdateRules, validate, productController.updateProduct);
router.delete('/:id', authenticate, authorize('seller', 'buyer_seller', 'admin'), idParam, validate, productController.deleteProduct);

module.exports = router;
