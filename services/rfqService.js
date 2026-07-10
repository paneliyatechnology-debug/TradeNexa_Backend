/**
 * RFQ business logic — lifecycle, buyer operations, and admin helpers.
 */
const db = require('../database/knex');
const rfqModel = require('../models/rfqModel');
const rfqAttachmentModel = require('../models/rfqAttachmentModel');
const rfqSellerModel = require('../models/rfqSellerModel');
const rfqAuditModel = require('../models/rfqAuditModel');
const quotationModel = require('../models/quotationModel');
const { generateRfqNumber } = require('../utils/rfqNumbers');
const { AppError } = require('../utils/response');
const {
  RFQ_STATUS,
  RFQ_EDITABLE_STATUSES,
  RFQ_VISIBILITY,
  RFQ_AUDIT_ACTION,
  RFQ_SELLER_VISIBLE_STATUSES,
  QUOTATION_STATUS,
  QUOTATION_EDITABLE_STATUSES,
  RFQ_SELLER_STATUS,
} = require('../constants/rfq');
const quotationHistoryModel = require('../models/quotationHistoryModel');
const { generateQuotationNumber } = require('../utils/rfqNumbers');
const chatService = require('./chatService');
const { CHAT_SYSTEM_EVENT } = require('../constants/chat');
const logger = require('../utils/logger');

// ==========================================
// Notification hooks (integration points only)
// ==========================================

const notify = (event, payload = {}) => {
  logger.info(`[RFQ Notification Hook] ${event}`, { event, ...payload });
};

const getBuyerId = (rfq) => rfq.buyer_id;

const mapRfqAddressFields = (data) => ({
  address_line_1: data.address_line_1 || null,
  address_line_2: data.address_line_2 || null,
  city: data.city || null,
  state: data.state ?? null,
  country: data.country || null,
  pincode: data.pincode || null,
});

const formatRfqAddress = (rfq) => ({
  address_line_1: rfq.address_line_1 || null,
  address_line_2: rfq.address_line_2 || null,
  city: rfq.city || null,
  state: rfq.state || null,
  country: rfq.country || null,
  pincode: rfq.pincode || null,
});

const buildRfqPayload = (data, buyerId, overrides = {}) => ({
  buyer_id: buyerId,
  title: data.title,
  description: data.description || null,
  category_id: data.category_id,
  subcategory_id: data.subcategory_id || null,
  product_id: data.product_id || null,
  quantity: data.quantity || null,
  unit: data.unit || 'pcs',
  expected_price: data.expected_price ?? data.budget ?? null,
  budget: data.expected_price ?? data.budget ?? null,
  currency: data.currency || 'INR',
  ...mapRfqAddressFields(data),
  required_before: data.required_before ? new Date(data.required_before) : null,
  quotation_deadline: data.quotation_deadline ? new Date(data.quotation_deadline) : null,
  payment_terms: data.payment_terms || null,
  visibility: data.visibility || RFQ_VISIBILITY.PUBLIC,
  status: overrides.status || RFQ_STATUS.DRAFT,
  is_active: overrides.is_active !== undefined ? overrides.is_active : true,
  created_by: buyerId,
  ...overrides,
});

const validateRfqDates = (data) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (data.quotation_deadline) {
    const deadline = new Date(data.quotation_deadline);
    if (deadline < today) {
      throw new AppError('Quotation deadline must be today or a future date', 400);
    }
  }

  if (data.required_before && data.quotation_deadline) {
    const requiredBefore = new Date(data.required_before);
    const deadline = new Date(data.quotation_deadline);
    if (requiredBefore < deadline) {
      throw new AppError('Required before date must be on or after quotation deadline', 400);
    }
  }
};

const getRfqDetail = async (id, options = {}) => {
  const rfq = await rfqModel.findRfqById(id);
  if (!rfq) return null;

  const attachments = await rfqAttachmentModel.findByRfqId(id);
  const sellerCount = await rfqSellerModel.countByRfqId(id);
  const quotations = options.includeQuotations
    ? await quotationModel.findByRfqId(id, { paginate: false })
    : undefined;

  const formatted = rfqModel.formatRow(rfq);

  return {
    ...formatted,
    address: formatRfqAddress(rfq),
    buyer: {
      id: getBuyerId(rfq),
      name: rfq.buyer_name,
      email: rfq.buyer_email,
      company: formatted.company ?? null,
    },
    category: rfq.category_name,
    subcategory: rfq.subcategory_name,
    product_name: rfq.product_name,
    seller_count: sellerCount,
    quotation_count: rfq.total_quotations || 0,
    attachments,
    quotations,
  };
};

const createDraftRfq = async (data, buyerId) => {
  validateRfqDates(data);

  const rfqId = await db.transaction(async (trx) => {
    const rfqNumber = await generateRfqNumber(trx);
    const payload = buildRfqPayload(data, buyerId, {
      rfq_number: rfqNumber,
      status: RFQ_STATUS.DRAFT,
    });

    const rfq = await rfqModel.createRfq(payload, trx);

    if (data.seller_ids?.length) {
      await rfqSellerModel.assignSellers(rfq.id, data.seller_ids, trx);
    }

    if (data.attachments?.length) {
      await rfqAttachmentModel.createAttachments(rfq.id, data.attachments, trx);
    }

    await rfqAuditModel.logAction(
      { rfqId: rfq.id, action: RFQ_AUDIT_ACTION.RFQ_CREATED, actorId: buyerId },
      trx,
    );

    notify('NEW_RFQ', { rfqId: rfq.id, buyerId });

    return rfq.id;
  });

  return getRfqDetail(rfqId);
};

const publishRfq = async (id, buyerId) => {
  const rfq = await rfqModel.findRfqById(id, { raw: true });
  if (!rfq) throw new AppError('RFQ not found', 404);
  if (getBuyerId(rfq) !== buyerId) throw new AppError('Forbidden: Access denied', 403);
  if (rfq.status !== RFQ_STATUS.DRAFT && rfq.status !== RFQ_STATUS.OPEN) {
    throw new AppError('Only draft or open RFQs can be published', 400);
  }

  await rfqModel.updateRfq(id, { status: RFQ_STATUS.PUBLISHED, updated_by: buyerId });
  await rfqAuditModel.logAction({ rfqId: id, action: RFQ_AUDIT_ACTION.RFQ_PUBLISHED, actorId: buyerId });
  notify('RFQ_PUBLISHED', { rfqId: id, buyerId });

  return getRfqDetail(id);
};

const updateRfq = async (id, data, actorId, isAdmin = false) => {
  const rfq = await rfqModel.findRfqById(id, { raw: true });
  if (!rfq) throw new AppError('RFQ not found', 404);
  if (!isAdmin && getBuyerId(rfq) !== actorId) throw new AppError('Forbidden: Access denied', 403);
  if (!RFQ_EDITABLE_STATUSES.includes(rfq.status)) {
    throw new AppError('RFQ cannot be updated in its current status', 400);
  }
  if ([RFQ_STATUS.AWARDED, RFQ_STATUS.COMPLETED].includes(rfq.status)) {
    throw new AppError('Awarded RFQ cannot be modified', 400);
  }

  validateRfqDates(data);

  const payload = {};
  const fields = [
    'title',
    'description',
    'category_id',
    'subcategory_id',
    'product_id',
    'quantity',
    'unit',
    'currency',
    'payment_terms',
    'visibility',
    'address_line_1',
    'address_line_2',
    'city',
    'state',
    'country',
    'pincode',
  ];

  fields.forEach((field) => {
    if (data[field] !== undefined) payload[field] = data[field];
  });

  if (data.expected_price !== undefined || data.budget !== undefined) {
    const price = data.expected_price ?? data.budget;
    payload.expected_price = price;
    payload.budget = price;
  }
  if (data.required_before !== undefined) {
    payload.required_before = data.required_before ? new Date(data.required_before) : null;
  }
  if (data.quotation_deadline !== undefined) {
    payload.quotation_deadline = data.quotation_deadline ? new Date(data.quotation_deadline) : null;
  }

  await rfqModel.updateRfq(id, { ...payload, updated_by: actorId });

  if (data.seller_ids) {
    await rfqSellerModel.assignSellers(id, data.seller_ids);
    notify('SELLER_ASSIGNED', { rfqId: id, sellerIds: data.seller_ids });
  }

  await rfqAuditModel.logAction({ rfqId: id, action: RFQ_AUDIT_ACTION.RFQ_UPDATED, actorId });
  return getRfqDetail(id);
};

const deleteDraftRfq = async (id, buyerId, isAdmin = false) => {
  const rfq = await rfqModel.findRfqById(id, { raw: true });
  if (!rfq) throw new AppError('RFQ not found', 404);
  if (!isAdmin && getBuyerId(rfq) !== buyerId) throw new AppError('Forbidden: Access denied', 403);
  if (rfq.status !== RFQ_STATUS.DRAFT) {
    throw new AppError('Only draft RFQs can be deleted', 400);
  }

  await rfqModel.deleteRfq(id, buyerId);
  return true;
};

const cancelRfq = async (id, buyerId, isAdmin = false) => {
  const rfq = await rfqModel.findRfqById(id, { raw: true });
  if (!rfq) throw new AppError('RFQ not found', 404);
  if (!isAdmin && getBuyerId(rfq) !== buyerId) throw new AppError('Forbidden: Access denied', 403);
  if ([RFQ_STATUS.COMPLETED, RFQ_STATUS.CANCELLED, RFQ_STATUS.CLOSED].includes(rfq.status)) {
    throw new AppError('RFQ cannot be cancelled in its current status', 400);
  }

  await rfqModel.updateRfq(id, { status: RFQ_STATUS.CANCELLED, updated_by: buyerId });
  await rfqAuditModel.logAction({ rfqId: id, action: RFQ_AUDIT_ACTION.RFQ_CANCELLED, actorId: buyerId });
  notify('RFQ_CANCELLED', { rfqId: id, buyerId });
  await chatService.recordRfqEventForSellers(id, CHAT_SYSTEM_EVENT.RFQ_CANCELLED, buyerId);
  return getRfqDetail(id);
};

const closeRfq = async (id, buyerId, isAdmin = false) => {
  const rfq = await rfqModel.findRfqById(id, { raw: true });
  if (!rfq) throw new AppError('RFQ not found', 404);
  if (!isAdmin && getBuyerId(rfq) !== buyerId) throw new AppError('Forbidden: Access denied', 403);

  await rfqModel.updateRfq(id, { status: RFQ_STATUS.CLOSED, updated_by: buyerId });
  await rfqAuditModel.logAction({ rfqId: id, action: RFQ_AUDIT_ACTION.RFQ_CLOSED, actorId: buyerId });
  notify('RFQ_CLOSED', { rfqId: id, buyerId });
  return getRfqDetail(id);
};

const getBuyerRfqs = async (buyerId, filters = {}) => {
  await rfqModel.expireOverdueRfqs();
  return rfqModel.findRfqs({ ...filters, buyer_id: buyerId });
};

const getSellerRfqDetail = async (rfqId, sellerId) => {
  await rfqModel.expireOverdueRfqs();
  const rfq = await rfqModel.findRfqById(rfqId, { raw: true });
  if (!rfq) throw new AppError('RFQ not found', 404);

  const allowed = await rfqSellerModel.isSellerAllowed(rfq, sellerId);
  if (!allowed) throw new AppError('Forbidden: RFQ not available', 403);

  await rfqSellerModel.markViewed(rfqId, sellerId);
  await rfqModel.incrementViews(rfqId);
  notify('SELLER_VIEWED_RFQ', { rfqId, sellerId });

  return getRfqDetail(rfqId);
};

const adminUpdateStatus = async (id, status, adminId) => {
  const rfq = await rfqModel.findRfqById(id, { raw: true });
  if (!rfq) throw new AppError('RFQ not found', 404);

  await rfqModel.updateRfq(id, { status, updated_by: adminId });
  await rfqAuditModel.logAction({
    rfqId: id,
    action: RFQ_AUDIT_ACTION.RFQ_UPDATED,
    actorId: adminId,
    metadata: { status },
  });

  return getRfqDetail(id);
};

// ==========================================
// Quotation operations
// ==========================================

const calculateTotalAmount = ({ price, quantity, gstPercentage = 0, transportationCharge = 0 }) => {
  const base = parseFloat(price) * (quantity ? parseInt(quantity, 10) : 1);
  const gstAmount = (base * parseFloat(gstPercentage || 0)) / 100;
  return parseFloat((base + gstAmount + parseFloat(transportationCharge || 0)).toFixed(2));
};

const assertSellerCanQuote = async (rfq, sellerId) => {
  if (getBuyerId(rfq) === sellerId) {
    throw new AppError('Seller cannot quote on own RFQ', 400);
  }
  if (!RFQ_SELLER_VISIBLE_STATUSES.includes(rfq.status) && rfq.status !== RFQ_STATUS.NEGOTIATION) {
    throw new AppError('RFQ is not open for quotations', 400);
  }
  const allowed = await rfqSellerModel.isSellerAllowed(rfq, sellerId);
  if (!allowed) throw new AppError('Forbidden: RFQ not available', 403);
};

const buildQuotationPayload = (data, rfqId, sellerId, quotationNumber) => {
  const gstPercentage = data.gst_percentage ?? 0;
  const transportationCharge = data.transportation_charge ?? 0;
  const quantity = data.quantity ?? null;
  const base = parseFloat(data.price) * (quantity || 1);
  const gstOnly = (base * parseFloat(gstPercentage)) / 100;

  return {
    quotation_number: quotationNumber,
    rfq_id: rfqId,
    seller_id: sellerId,
    price: data.price,
    quantity,
    unit: data.unit || null,
    gst_percentage: gstPercentage,
    gst_amount: parseFloat(gstOnly.toFixed(2)),
    transportation_charge: transportationCharge,
    total_amount: calculateTotalAmount({
      price: data.price,
      quantity: quantity || 1,
      gstPercentage,
      transportationCharge,
    }),
    delivery_days: data.delivery_days || null,
    payment_terms: data.payment_terms || null,
    validity_days: data.validity_days || null,
    remarks: data.remarks || null,
    attachment: data.attachment || null,
    status: QUOTATION_STATUS.SUBMITTED,
  };
};

const submitQuotation = async (rfqId, data, sellerId) => {
  await rfqModel.expireOverdueRfqs();
  const rfq = await rfqModel.findRfqById(rfqId, { raw: true });
  if (!rfq) throw new AppError('RFQ not found', 404);

  await assertSellerCanQuote(rfq, sellerId);

  const existing = await quotationModel.findByRfqAndSeller(rfqId, sellerId);
  if (existing && existing.status !== QUOTATION_STATUS.WITHDRAWN) {
    throw new AppError('Seller has already submitted a quotation for this RFQ', 409);
  }

  return db.transaction(async (trx) => {
    const quotationNumber = await generateQuotationNumber(trx);
    const payload = buildQuotationPayload(
      { ...data, unit: data.unit || rfq.unit },
      rfqId,
      sellerId,
      quotationNumber,
    );
    const quotation = await quotationModel.createQuotation(payload, trx);

    await rfqModel.incrementQuotationCount(rfqId, trx);
    await rfqSellerModel.markResponded(rfqId, sellerId, trx);

    const nextStatus =
      rfq.status === RFQ_STATUS.PUBLISHED || rfq.status === RFQ_STATUS.OPEN
        ? RFQ_STATUS.QUOTATION_RECEIVED
        : rfq.status;
    if (nextStatus !== rfq.status) {
      await rfqModel.updateRfq(rfqId, { status: nextStatus }, trx);
    }

    await rfqAuditModel.logAction(
      { rfqId, quotationId: quotation.id, action: RFQ_AUDIT_ACTION.QUOTATION_SUBMITTED, actorId: sellerId },
      trx,
    );
    notify('NEW_QUOTATION', { rfqId, quotationId: quotation.id, sellerId });

    await chatService.recordSystemEvent({
      rfqId,
      sellerId,
      quotationId: quotation.id,
      eventType: CHAT_SYSTEM_EVENT.QUOTATION_SUBMITTED,
      actorId: sellerId,
    });

    return quotationModel.findById(quotation.id);
  });
};

const updateQuotation = async (quotationId, data, sellerId) => {
  const quotation = await quotationModel.findById(quotationId, { raw: true });
  if (!quotation) throw new AppError('Quotation not found', 404);
  if (quotation.seller_id !== sellerId) throw new AppError('Forbidden: Access denied', 403);
  if (!QUOTATION_EDITABLE_STATUSES.includes(quotation.status)) {
    throw new AppError('Quotation cannot be updated in its current status', 400);
  }

  const oldPrice = quotation.price;
  const payload = buildQuotationPayload(
    { ...quotation, ...data },
    quotation.rfq_id,
    sellerId,
    quotation.quotation_number,
  );
  delete payload.quotation_number;
  delete payload.rfq_id;
  delete payload.seller_id;
  payload.status = QUOTATION_STATUS.UPDATED;

  return db.transaction(async (trx) => {
    await quotationModel.updateQuotation(quotationId, payload, trx);
    await quotationHistoryModel.createHistory(
      { quotationId, oldPrice, newPrice: payload.price, remarks: data.remarks, updatedBy: sellerId },
      trx,
    );
    await rfqAuditModel.logAction(
      { rfqId: quotation.rfq_id, quotationId, action: RFQ_AUDIT_ACTION.QUOTATION_UPDATED, actorId: sellerId },
      trx,
    );
    notify('QUOTATION_UPDATED', { quotationId, sellerId });
    await chatService.recordSystemEvent({
      rfqId: quotation.rfq_id,
      sellerId,
      quotationId,
      eventType: CHAT_SYSTEM_EVENT.QUOTATION_UPDATED,
      actorId: sellerId,
    });
    return quotationModel.findById(quotationId);
  });
};

const withdrawQuotation = async (quotationId, sellerId) => {
  const quotation = await quotationModel.findById(quotationId, { raw: true });
  if (!quotation) throw new AppError('Quotation not found', 404);
  if (quotation.seller_id !== sellerId) throw new AppError('Forbidden: Access denied', 403);
  if (quotation.status === QUOTATION_STATUS.ACCEPTED) {
    throw new AppError('Accepted quotation cannot be withdrawn', 400);
  }

  await quotationModel.updateQuotation(quotationId, { status: QUOTATION_STATUS.WITHDRAWN });
  await rfqAuditModel.logAction({
    rfqId: quotation.rfq_id,
    quotationId,
    action: RFQ_AUDIT_ACTION.QUOTATION_WITHDRAWN,
    actorId: sellerId,
  });
  await chatService.recordSystemEvent({
    rfqId: quotation.rfq_id,
    sellerId,
    quotationId,
    eventType: CHAT_SYSTEM_EVENT.QUOTATION_WITHDRAWN,
    actorId: sellerId,
  });
  return quotationModel.findById(quotationId);
};

const acceptQuotation = async (quotationId, buyerId, isAdmin = false) => {
  const quotation = await quotationModel.findById(quotationId, { raw: true });
  if (!quotation) throw new AppError('Quotation not found', 404);

  const rfq = await rfqModel.findRfqById(quotation.rfq_id, { raw: true });
  if (!rfq) throw new AppError('RFQ not found', 404);
  if (!isAdmin && getBuyerId(rfq) !== buyerId) {
    throw new AppError('Forbidden: Access denied', 403);
  }

  return db.transaction(async (trx) => {
    await quotationModel.updateQuotation(quotationId, { status: QUOTATION_STATUS.ACCEPTED }, trx);
    await quotationModel.rejectOthersExcept(quotation.rfq_id, quotationId, trx);
    await rfqModel.updateRfq(
      quotation.rfq_id,
      { status: RFQ_STATUS.AWARDED, awarded_seller_id: quotation.seller_id, updated_by: buyerId },
      trx,
    );
    await trx('rfq_sellers')
      .where({ rfq_id: quotation.rfq_id, seller_id: quotation.seller_id })
      .update({ status: RFQ_SELLER_STATUS.AWARDED });

    await rfqAuditModel.logAction(
      { rfqId: quotation.rfq_id, quotationId, action: RFQ_AUDIT_ACTION.QUOTATION_ACCEPTED, actorId: buyerId },
      trx,
    );
    notify('QUOTATION_ACCEPTED', { rfqId: quotation.rfq_id, quotationId, sellerId: quotation.seller_id });

    await chatService.recordSystemEvent({
      rfqId: quotation.rfq_id,
      sellerId: quotation.seller_id,
      quotationId,
      eventType: CHAT_SYSTEM_EVENT.QUOTATION_ACCEPTED,
      actorId: buyerId,
    });
    await chatService.recordSystemEvent({
      rfqId: quotation.rfq_id,
      sellerId: quotation.seller_id,
      quotationId,
      eventType: CHAT_SYSTEM_EVENT.RFQ_AWARDED,
      actorId: buyerId,
    });

    return quotationModel.findById(quotationId);
  });
};

const rejectQuotation = async (quotationId, buyerId, isAdmin = false) => {
  const quotation = await quotationModel.findById(quotationId, { raw: true });
  if (!quotation) throw new AppError('Quotation not found', 404);

  const rfq = await rfqModel.findRfqById(quotation.rfq_id, { raw: true });
  if (!isAdmin && getBuyerId(rfq) !== buyerId) {
    throw new AppError('Forbidden: Access denied', 403);
  }

  await quotationModel.updateQuotation(quotationId, { status: QUOTATION_STATUS.REJECTED });
  await rfqAuditModel.logAction({
    rfqId: quotation.rfq_id,
    quotationId,
    action: RFQ_AUDIT_ACTION.QUOTATION_REJECTED,
    actorId: buyerId,
  });
  notify('QUOTATION_REJECTED', { quotationId, buyerId });
  await chatService.recordSystemEvent({
    rfqId: quotation.rfq_id,
    sellerId: quotation.seller_id,
    quotationId,
    eventType: CHAT_SYSTEM_EVENT.QUOTATION_REJECTED,
    actorId: buyerId,
  });
  return quotationModel.findById(quotationId);
};

const requestRevision = async (quotationId, buyerId, remarks) => {
  const quotation = await quotationModel.findById(quotationId, { raw: true });
  if (!quotation) throw new AppError('Quotation not found', 404);

  const rfq = await rfqModel.findRfqById(quotation.rfq_id, { raw: true });
  if (getBuyerId(rfq) !== buyerId) throw new AppError('Forbidden: Access denied', 403);

  await rfqModel.updateRfq(quotation.rfq_id, { status: RFQ_STATUS.NEGOTIATION, updated_by: buyerId });
  await quotationHistoryModel.createHistory({
    quotationId,
    oldPrice: quotation.price,
    newPrice: quotation.price,
    remarks: remarks || 'Revision requested by buyer',
    updatedBy: buyerId,
  });
  await rfqAuditModel.logAction({
    rfqId: quotation.rfq_id,
    quotationId,
    action: RFQ_AUDIT_ACTION.NEGOTIATION_STARTED,
    actorId: buyerId,
    metadata: { remarks },
  });
  notify('NEGOTIATION_REQUEST', { quotationId, buyerId, remarks });
  await chatService.recordSystemEvent({
    rfqId: quotation.rfq_id,
    sellerId: quotation.seller_id,
    quotationId,
    eventType: CHAT_SYSTEM_EVENT.REVISION_REQUESTED,
    actorId: buyerId,
    metadata: { remarks },
  });
  return quotationModel.findById(quotationId);
};

const reviseQuotation = async (quotationId, data, sellerId) => {
  const quotation = await quotationModel.findById(quotationId, { raw: true });
  if (!quotation) throw new AppError('Quotation not found', 404);
  if (quotation.seller_id !== sellerId) throw new AppError('Forbidden: Access denied', 403);

  const rfq = await rfqModel.findRfqById(quotation.rfq_id, { raw: true });
  if (rfq.status !== RFQ_STATUS.NEGOTIATION) {
    throw new AppError('RFQ is not in negotiation', 400);
  }

  const updated = await updateQuotation(quotationId, data, sellerId);
  await rfqAuditModel.logAction({
    rfqId: quotation.rfq_id,
    quotationId,
    action: RFQ_AUDIT_ACTION.NEGOTIATION_COMPLETED,
    actorId: sellerId,
  });
  notify('NEGOTIATION_RESPONSE', { quotationId, sellerId });
  await chatService.recordSystemEvent({
    rfqId: quotation.rfq_id,
    sellerId,
    quotationId,
    eventType: CHAT_SYSTEM_EVENT.QUOTATION_REVISED,
    actorId: sellerId,
  });
  return updated;
};

module.exports = {
  getRfqDetail,
  createDraftRfq,
  publishRfq,
  updateRfq,
  deleteDraftRfq,
  cancelRfq,
  closeRfq,
  getBuyerRfqs,
  getSellerRfqDetail,
  adminUpdateStatus,
  getBuyerId,
  submitQuotation,
  updateQuotation,
  withdrawQuotation,
  acceptQuotation,
  rejectQuotation,
  requestRevision,
  reviseQuotation,
};
