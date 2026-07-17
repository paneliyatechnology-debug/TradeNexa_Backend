/**
 * Dashboard routes — aggregated buyer / seller / admin home metrics.
 *
 * GET /dashboard/buyer    buyer RFQ / inquiry / wishlist / charts
 * GET /dashboard/seller   seller products / inquiries / RFQ quotes / charts
 * GET /dashboard/admin    platform-wide admin panel metrics / charts
 */
const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const buyerRoles = authorize('buyer', 'buyer_seller');
const sellerRoles = authorize('seller', 'buyer_seller');
const adminRoles = authorize('admin', 'super_admin', 'supporter');

router.get('/buyer', authenticate, buyerRoles, dashboardController.getBuyerDashboard);
router.get('/seller', authenticate, sellerRoles, dashboardController.getSellerDashboard);
router.get('/admin', authenticate, adminRoles, dashboardController.getAdminDashboard);

module.exports = router;
