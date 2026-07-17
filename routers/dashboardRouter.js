/**
 * Dashboard routes — aggregated buyer / seller home metrics.
 *
 * GET /dashboard/buyer    buyer RFQ / inquiry / wishlist / chat summary
 * GET /dashboard/seller   seller products / inquiries / RFQ quotes / chat summary
 */
const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const buyerRoles = authorize('buyer', 'buyer_seller');
const sellerRoles = authorize('seller', 'buyer_seller');

router.get('/buyer', authenticate, buyerRoles, dashboardController.getBuyerDashboard);
router.get('/seller', authenticate, sellerRoles, dashboardController.getSellerDashboard);

module.exports = router;
