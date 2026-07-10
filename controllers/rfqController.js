/**
 * RFQ module controller — buyer, seller, quotation, and admin operations.
 */
const rfqService = require('../services/rfqService');
const rfqModel = require('../models/rfqModel');
const quotationModel = require('../models/quotationModel');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS, ADMIN_PANEL_ROLE_CODES } = require('../constants');

const isAdmin = (user) => ADMIN_PANEL_ROLE_CODES.includes(user?.role);

const buildListFilters = (req) => ({
  search: req.query.search,
  status: req.query.status,
  category_id: req.query.category_id,
  subcategory_id: req.query.subcategory_id,
  city: req.query.city,
  state: req.query.state,
  country: req.query.country,
  buyer_id: req.query.buyer_id,
  min_budget: req.query.min_budget,
  max_budget: req.query.max_budget,
  min_expected_price: req.query.min_expected_price,
  max_expected_price: req.query.max_expected_price,
  date_from: req.query.date_from,
  date_to: req.query.date_to,
  page: req.query.page,
  limit: req.query.limit,
  sort_by: req.query.sort_by,
  sort_order: req.query.sort_order,
  is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
});

const buildQuotationListFilters = (req) => ({
  search: req.query.search,
  status: req.query.status,
  rfq_id: req.query.rfq_id,
  seller_id: req.query.seller_id,
  page: req.query.page,
  limit: req.query.limit,
  sort_by: req.query.sort_by,
  sort_order: req.query.sort_order,
});

// ==========================================
// Public & buyer RFQ
// ==========================================

const createRfq = async (req, res, next) => {
  try {
    const rfq = await rfqService.createDraftRfq(req.body, req.user.id);
    return success(res, 'RFQ created successfully', rfq, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

const publishRfq = async (req, res, next) => {
  try {
    const rfq = await rfqService.publishRfq(req.params.id, req.user.id);
    return success(res, 'RFQ published successfully', rfq);
  } catch (err) {
    next(err);
  }
};

const getRfq = async (req, res, next) => {
  try {
    const rfq = await rfqService.getRfqDetail(req.params.id);
    if (!rfq) return next(new AppError('RFQ not found', HTTP_STATUS.NOT_FOUND));
    return success(res, 'RFQ details retrieved successfully', rfq);
  } catch (err) {
    next(err);
  }
};

const getRfqs = async (req, res, next) => {
  try {
    const data = await rfqModel.findRfqs(buildListFilters(req));
    return success(res, 'RFQs list retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

const getMyRfqs = async (req, res, next) => {
  try {
    const data = await rfqService.getBuyerRfqs(req.user.id, buildListFilters(req));
    return success(res, 'My RFQs retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

const getLatestRfqs = async (req, res, next) => {
  try {
    const data = await rfqModel.findRfqs({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      is_active: true,
      statuses: ['PUBLISHED', 'QUOTATION_RECEIVED', 'OPEN'],
      sort_by: req.query.sort_by || 'created_at',
      sort_order: req.query.sort_order || 'desc',
    });
    const formatted = data.results.map((r) => ({
      id: r.id,
      rfq_number: r.rfq_number,
      title: r.title,
      category: r.category,
      city: r.city,
      created_at: r.created_at,
      company: r.company ?? null,
    }));
    return success(res, 'Latest RFQs retrieved successfully', { ...data, results: formatted });
  } catch (err) {
    next(err);
  }
};

const updateRfq = async (req, res, next) => {
  try {
    const rfq = await rfqService.updateRfq(req.params.id, req.body, req.user.id, isAdmin(req.user));
    return success(res, 'RFQ updated successfully', rfq);
  } catch (err) {
    next(err);
  }
};

const deleteRfq = async (req, res, next) => {
  try {
    await rfqService.deleteDraftRfq(req.params.id, req.user.id, isAdmin(req.user));
    return success(res, 'RFQ deleted successfully');
  } catch (err) {
    next(err);
  }
};

const cancelRfq = async (req, res, next) => {
  try {
    const rfq = await rfqService.cancelRfq(req.params.id, req.user.id, isAdmin(req.user));
    return success(res, 'RFQ cancelled successfully', rfq);
  } catch (err) {
    next(err);
  }
};

const closeRfq = async (req, res, next) => {
  try {
    const rfq = await rfqService.closeRfq(req.params.id, req.user.id, isAdmin(req.user));
    return success(res, 'RFQ closed successfully', rfq);
  } catch (err) {
    next(err);
  }
};

const getRfqQuotations = async (req, res, next) => {
  try {
    const rfq = await rfqModel.findRfqById(req.params.id, { raw: true });
    if (!rfq) return next(new AppError('RFQ not found', HTTP_STATUS.NOT_FOUND));
    if (!isAdmin(req.user) && rfqService.getBuyerId(rfq) !== req.user.id) {
      return next(new AppError('Forbidden: Access denied', HTTP_STATUS.FORBIDDEN));
    }
    const quotations = await quotationModel.findByRfqId(req.params.id, buildQuotationListFilters(req));
    return success(res, 'RFQ quotations retrieved successfully', quotations);
  } catch (err) {
    next(err);
  }
};

const compareRfqQuotations = async (req, res, next) => {
  try {
    const rfq = await rfqModel.findRfqById(req.params.id, { raw: true });
    if (!rfq) return next(new AppError('RFQ not found', HTTP_STATUS.NOT_FOUND));
    if (!isAdmin(req.user) && rfqService.getBuyerId(rfq) !== req.user.id) {
      return next(new AppError('Forbidden: Access denied', HTTP_STATUS.FORBIDDEN));
    }
    const data = await quotationModel.compareByRfqId(req.params.id);
    return success(res, 'Quotation comparison retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// Seller RFQ & quotations
// ==========================================

const getSellerRfqs = async (req, res, next) => {
  try {
    const data = await rfqModel.findSellerFeed(req.user.id, buildListFilters(req));
    return success(res, 'Seller RFQ feed retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

const getSellerRfq = async (req, res, next) => {
  try {
    const rfq = await rfqService.getSellerRfqDetail(req.params.id, req.user.id);
    return success(res, 'RFQ details retrieved successfully', rfq);
  } catch (err) {
    next(err);
  }
};

const getMyQuotations = async (req, res, next) => {
  try {
    const data = await quotationModel.findSellerQuotations(req.user.id, buildQuotationListFilters(req));
    return success(res, 'Seller quotations retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

const getMyQuotation = async (req, res, next) => {
  try {
    const quotation = await quotationModel.findById(req.params.quotationId);
    if (!quotation) return next(new AppError('Quotation not found', HTTP_STATUS.NOT_FOUND));
    if (quotation.seller_id !== req.user.id) {
      return next(new AppError('Forbidden: Access denied', HTTP_STATUS.FORBIDDEN));
    }
    return success(res, 'Quotation details retrieved successfully', quotation);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// Quotation actions
// ==========================================

const submitQuotation = async (req, res, next) => {
  try {
    const quotation = await rfqService.submitQuotation(req.params.id, req.body, req.user.id);
    return success(res, 'Quotation submitted successfully', quotation, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

const getQuotation = async (req, res, next) => {
  try {
    const quotation = await quotationModel.findById(req.params.quotationId);
    if (!quotation) return next(new AppError('Quotation not found', HTTP_STATUS.NOT_FOUND));
    return success(res, 'Quotation details retrieved successfully', quotation);
  } catch (err) {
    next(err);
  }
};

const updateQuotation = async (req, res, next) => {
  try {
    const quotation = await rfqService.updateQuotation(req.params.quotationId, req.body, req.user.id);
    return success(res, 'Quotation updated successfully', quotation);
  } catch (err) {
    next(err);
  }
};

const withdrawQuotation = async (req, res, next) => {
  try {
    const quotation = await rfqService.withdrawQuotation(req.params.quotationId, req.user.id);
    return success(res, 'Quotation withdrawn successfully', quotation);
  } catch (err) {
    next(err);
  }
};

const acceptQuotation = async (req, res, next) => {
  try {
    const quotation = await rfqService.acceptQuotation(req.params.quotationId, req.user.id, isAdmin(req.user));
    return success(res, 'Quotation accepted successfully', quotation);
  } catch (err) {
    next(err);
  }
};

const rejectQuotation = async (req, res, next) => {
  try {
    const quotation = await rfqService.rejectQuotation(req.params.quotationId, req.user.id, isAdmin(req.user));
    return success(res, 'Quotation rejected successfully', quotation);
  } catch (err) {
    next(err);
  }
};

const requestRevision = async (req, res, next) => {
  try {
    const quotation = await rfqService.requestRevision(req.params.quotationId, req.user.id, req.body.remarks);
    return success(res, 'Revision requested successfully', quotation);
  } catch (err) {
    next(err);
  }
};

const reviseQuotation = async (req, res, next) => {
  try {
    const quotation = await rfqService.reviseQuotation(req.params.quotationId, req.body, req.user.id);
    return success(res, 'Revised quotation submitted successfully', quotation);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// Admin
// ==========================================

const getAdminRfqs = async (req, res, next) => {
  try {
    const data = await rfqModel.findRfqs(buildListFilters(req));
    return success(res, 'Admin RFQs retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

const getAdminRfq = async (req, res, next) => {
  try {
    const rfq = await rfqService.getRfqDetail(req.params.id, { includeQuotations: true });
    if (!rfq) return next(new AppError('RFQ not found', HTTP_STATUS.NOT_FOUND));
    return success(res, 'Admin RFQ details retrieved successfully', rfq);
  } catch (err) {
    next(err);
  }
};

const updateAdminRfqStatus = async (req, res, next) => {
  try {
    const rfq = await rfqService.adminUpdateStatus(req.params.id, req.body.status, req.user.id);
    return success(res, 'RFQ status updated successfully', rfq);
  } catch (err) {
    next(err);
  }
};

const getAdminQuotations = async (req, res, next) => {
  try {
    const data = await quotationModel.findAllQuotations(buildQuotationListFilters(req));
    return success(res, 'Admin quotations retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

const getRfqSummary = async (req, res, next) => {
  try {
    const data = await rfqModel.getAdminSummary();
    return success(res, 'RFQ dashboard summary retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createRfq,
  publishRfq,
  getRfq,
  getRfqs,
  getMyRfqs,
  getLatestRfqs,
  updateRfq,
  deleteRfq,
  cancelRfq,
  closeRfq,
  getRfqQuotations,
  compareRfqQuotations,
  getSellerRfqs,
  getSellerRfq,
  /** @deprecated */ getSupplierRfqs: getSellerRfqs,
  /** @deprecated */ getSupplierRfq: getSellerRfq,
  getMyQuotations,
  getMyQuotation,
  submitQuotation,
  getQuotation,
  updateQuotation,
  withdrawQuotation,
  acceptQuotation,
  rejectQuotation,
  requestRevision,
  reviseQuotation,
  getAdminRfqs,
  getAdminRfq,
  updateAdminRfqStatus,
  getAdminQuotations,
  getRfqSummary,
};
