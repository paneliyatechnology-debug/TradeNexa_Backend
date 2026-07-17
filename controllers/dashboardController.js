/**
 * Buyer / seller dashboard controllers.
 */
const dashboardService = require('../services/dashboardService');
const { success } = require('../utils/response');

/** GET /dashboard — role-aware summary (buyer, seller, or both). */
const getDashboard = async (req, res, next) => {
  try {
    const data = await dashboardService.getDashboardForUser(req.user.id, req.user.role);
    return success(res, 'Dashboard retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/** GET /dashboard/buyer — buyer-side metrics only. */
const getBuyerDashboard = async (req, res, next) => {
  try {
    const data = await dashboardService.getBuyerDashboard(req.user.id);
    return success(res, 'Buyer dashboard retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/** GET /dashboard/seller — seller-side metrics only. */
const getSellerDashboard = async (req, res, next) => {
  try {
    const data = await dashboardService.getSellerDashboard(req.user.id);
    return success(res, 'Seller dashboard retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDashboard,
  getBuyerDashboard,
  getSellerDashboard,
};
