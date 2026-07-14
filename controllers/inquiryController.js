/**
 * Inquiry module controller — buyer create/list, seller quote/reject, shared chat.
 *
 * Maps HTTP requests under /api/v1/inquiries to inquiryService.
 */
const inquiryService = require('../services/inquiryService');
const inquiryQuotationModel = require('../models/inquiryQuotationModel');
const { success } = require('../utils/response');

// ==========================================
// Buyer operations
// ==========================================

/**
 * POST /inquiries
 * Create a product inquiry (status = pending). Reuses buyer↔seller chat thread.
 */
const createInquiry = async (req, res, next) => {
  try {
    const data = await inquiryService.createInquiry(req.user.id, req.body);
    return success(res, 'Inquiry created successfully', data, 201);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /inquiries/my
 * Paginated list of inquiries created by the authenticated buyer.
 */
const getMyInquiries = async (req, res, next) => {
  try {
    const data = await inquiryService.listBuyerInquiries(req.user.id, req.query);
    return success(res, 'Inquiries retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /inquiries/:id
 * Detail for buyer or seller. Seller open sets viewed_at unless mark_viewed=false.
 */
const getInquiry = async (req, res, next) => {
  try {
    const markViewed = req.query.mark_viewed !== 'false';
    const data = await inquiryService.getInquiryForUser(req.params.id, req.user.id, {
      markViewed,
    });
    return success(res, 'Inquiry retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /inquiries/:id
 * Buyer update while status is pending (quantity, message, expected price, …).
 */
const updateInquiry = async (req, res, next) => {
  try {
    const data = await inquiryService.updateInquiry(req.params.id, req.user.id, req.body);
    return success(res, 'Inquiry updated successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /inquiries/:id/cancel
 * Buyer cancels an open inquiry.
 */
const cancelInquiry = async (req, res, next) => {
  try {
    const data = await inquiryService.cancelInquiry(req.params.id, req.user.id);
    return success(res, 'Inquiry cancelled successfully', data);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// Seller operations
// ==========================================

/**
 * GET /inquiries/seller
 * Seller inbox — product inquiries directed at this seller.
 */
const getSellerInquiries = async (req, res, next) => {
  try {
    const data = await inquiryService.listSellerInquiries(req.user.id, req.query);
    return success(res, 'Seller inquiries retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /inquiries/:id/reject
 * Seller declines the inquiry (optional reason in body).
 */
const rejectInquiry = async (req, res, next) => {
  try {
    const data = await inquiryService.rejectInquiry(
      req.params.id,
      req.user.id,
      req.body.reason || req.body.reject_reason || null,
    );
    return success(res, 'Inquiry rejected successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /inquiries/:id/chat
 * Get or continue the shared buyer↔seller conversation for this inquiry.
 */
const startChat = async (req, res, next) => {
  try {
    const data = await inquiryService.getOrStartChat(req.params.id, req.user.id);
    return success(res, 'Conversation ready', data);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// Quotation operations
// ==========================================

/**
 * POST /inquiries/:id/quotations
 * Seller submits a quote (inquiry status → quoted).
 */
const submitQuotation = async (req, res, next) => {
  try {
    const data = await inquiryService.submitQuotation(req.params.id, req.user.id, req.body);
    return success(res, 'Quotation submitted successfully', data, 201);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /inquiries/seller/quotations
 * Quotes this seller has submitted on inquiries.
 */
const getMyQuotations = async (req, res, next) => {
  try {
    const data = await inquiryQuotationModel.listBySeller(req.user.id, req.query);
    return success(res, 'Quotations retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /inquiries/quotations/:quotationId
 * Seller updates an editable quote (SUBMITTED / UPDATED).
 */
const updateQuotation = async (req, res, next) => {
  try {
    const data = await inquiryService.updateQuotation(req.params.quotationId, req.user.id, req.body);
    return success(res, 'Quotation updated successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /inquiries/quotations/:quotationId/withdraw
 * Seller withdraws a quote; inquiry returns to pending.
 */
const withdrawQuotation = async (req, res, next) => {
  try {
    const data = await inquiryService.withdrawQuotation(req.params.quotationId, req.user.id);
    return success(res, 'Quotation withdrawn successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /inquiries/quotations/:quotationId/accept
 * Buyer accepts the seller's quote (inquiry → accepted).
 */
const acceptQuotation = async (req, res, next) => {
  try {
    const data = await inquiryService.acceptQuotation(req.params.quotationId, req.user.id);
    return success(res, 'Quotation accepted successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /inquiries/quotations/:quotationId/reject
 * Buyer rejects the quote; inquiry returns to pending so seller can re-quote.
 */
const rejectQuotation = async (req, res, next) => {
  try {
    const data = await inquiryService.rejectQuotation(req.params.quotationId, req.user.id);
    return success(res, 'Quotation rejected successfully', data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createInquiry,
  getMyInquiries,
  getSellerInquiries,
  getInquiry,
  updateInquiry,
  cancelInquiry,
  rejectInquiry,
  submitQuotation,
  getMyQuotations,
  updateQuotation,
  withdrawQuotation,
  acceptQuotation,
  rejectQuotation,
  startChat,
};
