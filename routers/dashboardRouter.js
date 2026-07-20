/**
 * Dashboard routes — aggregated seller / admin home metrics.
 *
 * GET /dashboard/seller                         seller KPI summary
 * GET /dashboard/seller/top-performing-products  paginated top products by inquiries
 * GET /dashboard/admin                          platform-wide admin panel metrics / charts
 */
const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const { sellerTopPerformingProductsQuery } = require('../middleware/resourceValidation');

const router = express.Router();

const sellerRoles = authorize('seller', 'buyer_seller');
const adminRoles = authorize('admin', 'super_admin', 'supporter');

router.get('/seller', authenticate, sellerRoles, dashboardController.getSellerDashboard);
router.get(
  '/seller/top-performing-products',
  authenticate,
  sellerRoles,
  sellerTopPerformingProductsQuery,
  validate,
  dashboardController.listTopPerformingProducts,
);
router.get('/admin', authenticate, adminRoles, dashboardController.getAdminDashboard);

module.exports = router;
