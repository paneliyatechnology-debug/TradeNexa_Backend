/**
 * Buyer / seller / admin dashboard controllers.
 */
const dashboardService = require('../services/dashboardService');
const { success } = require('../utils/response');

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

/** GET /dashboard/admin — platform-wide metrics for admin panel. */
const getAdminDashboard = async (req, res, next) => {
  try {
    const data = await dashboardService.getAdminDashboard();
    return success(res, 'Admin dashboard retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getBuyerDashboard,
  getSellerDashboard,
  getAdminDashboard,
};
