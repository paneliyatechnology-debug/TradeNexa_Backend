/**
 * Inquiry business logic — product inquiry lifecycle, quotes, and chat hooks.
 *
 * Seller actions: Reply (shared buyer↔seller chat) | Send quote | Reject.
 * Chat is never inquiry-scoped: find-or-create uses buyer_id + seller_id only.
 */
const db = require('../database/knex');
const inquiryModel = require('../models/inquiryModel');
const inquiryQuotationModel = require('../models/inquiryQuotationModel');
const productModel = require('../models/productModel');
const chatConversationModel = require('../models/chatConversationModel');
const chatService = require('./chatService');
const { AppError } = require('../utils/response');
const {
  generateInquiryNumber,
  generateInquiryQuotationNumber,
} = require('../utils/inquiryNumbers');
const {
  INQUIRY_STATUS,
  INQUIRY_EDITABLE_STATUSES,
  INQUIRY_SELLER_ACTIONABLE_STATUSES,
  QUOTATION_STATUS,
  QUOTATION_EDITABLE_STATUSES,
} = require('../constants/inquiry');
const { CHAT_SYSTEM_EVENT, CHAT_SOCKET_EVENT } = require('../constants/chat');
const { PRODUCT_APPROVAL_STATUS } = require('../constants/product');
const notificationService = require('./notificationService');
const chatSocketEmitter = require('./chatSocketEmitter');
const {
  NOTIFICATION_TYPE,
  NOTIFICATION_CLICK_ACTION,
} = require('../constants/notification');
const notificationCopy = require('../utils/notificationCopy');

// ==========================================
// Push helpers (never throw — safe after DB commits)
// ==========================================

/** Fire-and-forget business push for inquiry / inquiry-quotation events. */
const pushInquiryNotify = (params) => {
  if (params?.senderId != null && Number(params.senderId) === Number(params.receiverId)) {
    return;
  }
  void notificationService.send(params);
};

/** Context fields from a joined inquiry row (raw findById). */
const inquiryNotifyContext = (inquiry = {}) => ({
  productName: inquiry.product_name,
  buyerName: inquiry.buyer_name,
  buyerCompany: inquiry.buyer_company_name,
  sellerName: inquiry.seller_name,
  sellerCompany: inquiry.seller_company_name,
  inquiryNumber: inquiry.inquiry_number,
  quantity: inquiry.quantity,
  unit: inquiry.unit,
  currency: inquiry.currency || 'INR',
});

// ==========================================
// Helpers
// ==========================================

/** Total = (price × qty) + GST on base + transportation. */
const calculateTotalAmount = ({ price, quantity, gstPercentage = 0, transportationCharge = 0 }) => {
  const base = parseFloat(price) * (quantity ? parseInt(quantity, 10) : 1);
  const gstAmount = (base * parseFloat(gstPercentage || 0)) / 100;
  return parseFloat((base + gstAmount + parseFloat(transportationCharge || 0)).toFixed(2));
};

/** Build insert/update payload for inquiry_quotations (mirrors RFQ quote math). */
const buildQuotationPayload = (data, inquiryId, sellerId, quotationNumber) => {
  const gstPercentage = data.gst_percentage ?? 0;
  const transportationCharge = data.transportation_charge ?? 0;
  const quantity = data.quantity ?? null;
  const base = parseFloat(data.price) * (quantity || 1);
  const gstOnly = (base * parseFloat(gstPercentage)) / 100;

  return {
    quotation_number: quotationNumber,
    inquiry_id: inquiryId,
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

/** Buyer or assigned seller may access the inquiry. */
const assertParticipant = (inquiry, userId) => {
  if (inquiry.buyer_id !== userId && inquiry.seller_id !== userId) {
    throw new AppError('Forbidden: Access denied', 403);
  }
};

const getInquiryOrFail = async (inquiryId) => {
  const inquiry = await inquiryModel.findById(inquiryId, { raw: true });
  if (!inquiry) throw new AppError('Inquiry not found', 404);
  return inquiry;
};

/** Detail payload including nested quotation (if any). */
const enrichInquiryDetail = async (inquiryId) => {
  const inquiry = await inquiryModel.findById(inquiryId);
  if (!inquiry) throw new AppError('Inquiry not found', 404);
  const quotation = await inquiryQuotationModel.findByInquiryId(inquiryId);
  return { ...inquiry, quotation: quotation || null };
};

// ==========================================
// Create / list / detail
// ==========================================

/**
 * Buyer creates an inquiry on an approved, active product that accepts inquiries.
 * Reuses the buyer↔seller chat thread and seeds PRODUCT + TEXT + SYSTEM messages.
 */
const createInquiry = async (buyerId, data) => {
  const product = await productModel.findProductById(data.product_id);
  if (!product) throw new AppError('Product not found', 404);

  if (product.approval_status !== PRODUCT_APPROVAL_STATUS.APPROVED || !product.is_active) {
    throw new AppError('Product is not available for inquiry', 400);
  }
  if (product.accept_inquiry === false) {
    throw new AppError('This product does not accept inquiries', 400);
  }
  if (String(product.seller_id) === String(buyerId)) {
    throw new AppError('You cannot inquire on your own product', 400);
  }

  // One pending inquiry per buyer + product
  const existingPending = await inquiryModel.findPendingByBuyerAndProduct(buyerId, product.id);
  if (existingPending) {
    throw new AppError('You already have a pending inquiry for this product', 409);
  }

  const inquiryId = await db.transaction(async (trx) => {
    const inquiryNumber = await generateInquiryNumber(trx);
    const raw = await inquiryModel.createInquiry(
      {
        inquiry_number: inquiryNumber,
        product_id: product.id,
        buyer_id: buyerId,
        seller_id: product.seller_id,
        quantity: data.quantity,
        unit: data.unit || product.unit || null,
        message: String(data.message).trim(),
        expected_price: data.expected_price ?? null,
        currency: data.currency || product.currency || 'INR',
        required_before: data.required_before || null,
        status: INQUIRY_STATUS.PENDING,
        is_active: true,
        created_by: buyerId,
        updated_by: buyerId,
      },
      trx,
    );

    // Never create a second conversation for the same pair — update last_context instead
    const conversation = await chatConversationModel.findOrCreateBuyerSellerConversation(
      {
        buyerId,
        sellerId: product.seller_id,
        initiatedBy: buyerId,
        lastContextType: 'product',
        lastContextId: product.id,
        inquiryId: raw.id,
      },
      trx,
    );

    await chatService.persistInquirySeedMessages({
      conversation,
      buyerId,
      product,
      message: String(data.message).trim(),
      inquiryId: raw.id,
      trx,
    });

    return raw.id;
  });

  const inquiryRow = await inquiryModel.findById(inquiryId, { raw: true });
  const ctx = inquiryNotifyContext(inquiryRow || {});
  const copy = notificationCopy.inquiryReceived({
    productName: ctx.productName || product.name,
    buyerCompany: ctx.buyerCompany,
    buyerName: ctx.buyerName,
    quantity: data.quantity ?? ctx.quantity,
    unit: data.unit || ctx.unit || product.unit,
    inquiryNumber: ctx.inquiryNumber,
  });

  pushInquiryNotify({
    receiverId: product.seller_id,
    type: NOTIFICATION_TYPE.INQUIRY_RECEIVED,
    title: copy.title,
    body: copy.body,
    referenceId: inquiryId,
    senderId: buyerId,
    clickAction: NOTIFICATION_CLICK_ACTION.OPEN_INQUIRY,
    data: {
      inquiry_id: inquiryId,
      product_id: product.id,
      inquiry_number: ctx.inquiryNumber || undefined,
      product_name: ctx.productName || product.name || undefined,
    },
  });

  // Realtime for seller only — creator (buyer) must not get a new-message notification
  try {
    const conversation = await chatConversationModel.findOrCreateBuyerSellerConversation({
      buyerId,
      sellerId: product.seller_id,
      initiatedBy: buyerId,
    });
    if (conversation?.id) {
      chatSocketEmitter.emitToUser(product.seller_id, CHAT_SOCKET_EVENT.CONVERSATION_UPDATED, {
        conversation_id: conversation.id,
        last_context_type: conversation.last_context_type,
        last_context_id: conversation.last_context_id,
        inquiry_id: inquiryId,
      });
      chatService.pushUnreadSummary(product.seller_id);
    }
  } catch {
    // best-effort realtime
  }

  return enrichInquiryDetail(inquiryId);
};

/**
 * Load inquiry for a participant.
 * @param {{ markViewed?: boolean }} [options] - When true, seller open sets viewed_at once
 */
const getInquiryForUser = async (inquiryId, userId, { markViewed = false } = {}) => {
  const raw = await getInquiryOrFail(inquiryId);
  assertParticipant(raw, userId);

  if (markViewed && raw.seller_id === userId && !raw.viewed_at) {
    await inquiryModel.updateInquiry(inquiryId, { viewed_at: db.fn.now() });
  }

  return enrichInquiryDetail(inquiryId);
};

const listBuyerInquiries = (buyerId, filters = {}) =>
  inquiryModel.listInquiries({ ...filters, buyer_id: buyerId });

const listSellerInquiries = (sellerId, filters = {}) =>
  inquiryModel.listInquiries({ ...filters, seller_id: sellerId });

/** Buyer update while status is pending. */
const updateInquiry = async (inquiryId, buyerId, data) => {
  const inquiry = await getInquiryOrFail(inquiryId);
  if (inquiry.buyer_id !== buyerId) throw new AppError('Forbidden: Access denied', 403);
  if (!INQUIRY_EDITABLE_STATUSES.includes(inquiry.status)) {
    throw new AppError('Inquiry cannot be updated in its current status', 400);
  }

  const payload = { updated_by: buyerId };
  if (data.quantity !== undefined) payload.quantity = data.quantity;
  if (data.unit !== undefined) payload.unit = data.unit;
  if (data.message !== undefined) payload.message = String(data.message).trim();
  if (data.expected_price !== undefined) payload.expected_price = data.expected_price;
  if (data.currency !== undefined) payload.currency = data.currency;
  if (data.required_before !== undefined) payload.required_before = data.required_before;

  await inquiryModel.updateInquiry(inquiryId, payload);
  return enrichInquiryDetail(inquiryId);
};

/** Buyer cancels; posts SYSTEM message on the shared chat thread. */
const cancelInquiry = async (inquiryId, buyerId) => {
  const inquiry = await getInquiryOrFail(inquiryId);
  if (inquiry.buyer_id !== buyerId) throw new AppError('Forbidden: Access denied', 403);
  if ([INQUIRY_STATUS.ACCEPTED, INQUIRY_STATUS.CANCELLED, INQUIRY_STATUS.CLOSED].includes(inquiry.status)) {
    throw new AppError('Inquiry cannot be cancelled in its current status', 400);
  }

  await inquiryModel.updateInquiry(inquiryId, {
    status: INQUIRY_STATUS.CANCELLED,
    updated_by: buyerId,
  });

  await chatService.recordInquirySystemEvent({
    inquiryId,
    eventType: CHAT_SYSTEM_EVENT.INQUIRY_CANCELLED,
    actorId: buyerId,
  });

  return enrichInquiryDetail(inquiryId);
};

// ==========================================
// Seller actions: reject / quote
// ==========================================

/** Seller rejects the inquiry (optional reason stored on the row). */
const rejectInquiry = async (inquiryId, sellerId, reason = null) => {
  const inquiry = await getInquiryOrFail(inquiryId);
  if (inquiry.seller_id !== sellerId) throw new AppError('Forbidden: Access denied', 403);
  if (!INQUIRY_SELLER_ACTIONABLE_STATUSES.includes(inquiry.status)) {
    throw new AppError('Inquiry cannot be rejected in its current status', 400);
  }

  await inquiryModel.updateInquiry(inquiryId, {
    status: INQUIRY_STATUS.REJECTED,
    reject_reason: reason || null,
    responded_at: db.fn.now(),
    updated_by: sellerId,
  });

  await chatService.recordInquirySystemEvent({
    inquiryId,
    eventType: CHAT_SYSTEM_EVENT.INQUIRY_REJECTED,
    actorId: sellerId,
    metadata: { ...(reason ? { reason } : {}), skip_push: true },
  });

  const ctx = inquiryNotifyContext(inquiry);
  const copy = notificationCopy.inquiryRejected({
    productName: ctx.productName,
    sellerCompany: ctx.sellerCompany,
    sellerName: ctx.sellerName,
    reason,
    inquiryNumber: ctx.inquiryNumber,
  });

  pushInquiryNotify({
    receiverId: inquiry.buyer_id,
    type: NOTIFICATION_TYPE.INQUIRY_REJECTED,
    title: copy.title,
    body: copy.body,
    referenceId: inquiryId,
    senderId: sellerId,
    clickAction: NOTIFICATION_CLICK_ACTION.OPEN_INQUIRY,
    data: {
      inquiry_id: inquiryId,
      product_id: inquiry.product_id,
      inquiry_number: ctx.inquiryNumber || undefined,
      product_name: ctx.productName || undefined,
    },
  });

  return enrichInquiryDetail(inquiryId);
};

/**
 * Seller submits a quote. Reuses a WITHDRAWN row when re-quoting the same inquiry.
 * Inquiry status → quoted; SYSTEM event on shared chat.
 */
const submitQuotation = async (inquiryId, sellerId, data) => {
  const inquiry = await getInquiryOrFail(inquiryId);
  if (inquiry.seller_id !== sellerId) throw new AppError('Forbidden: Access denied', 403);
  if (!INQUIRY_SELLER_ACTIONABLE_STATUSES.includes(inquiry.status)) {
    throw new AppError('Inquiry is not open for quotations', 400);
  }

  const existing = await inquiryQuotationModel.findByInquiryId(inquiryId, { raw: true });
  if (existing && existing.status !== QUOTATION_STATUS.WITHDRAWN) {
    throw new AppError('A quotation already exists for this inquiry', 409);
  }

  const quotationId = await db.transaction(async (trx) => {
    const quotationNumber = await generateInquiryQuotationNumber(trx);
    const payload = buildQuotationPayload(
      { ...data, unit: data.unit || inquiry.unit, quantity: data.quantity ?? inquiry.quantity },
      inquiryId,
      sellerId,
      quotationNumber,
    );

    let quotationRow;
    if (existing && existing.status === QUOTATION_STATUS.WITHDRAWN) {
      quotationRow = await inquiryQuotationModel.updateQuotation(existing.id, payload, trx);
    } else {
      quotationRow = await inquiryQuotationModel.createQuotation(payload, trx);
    }

    await inquiryModel.updateInquiry(
      inquiryId,
      {
        status: INQUIRY_STATUS.QUOTED,
        responded_at: db.fn.now(),
        updated_by: sellerId,
      },
      trx,
    );

    return quotationRow.id;
  });

  await chatService.recordInquirySystemEvent({
    inquiryId,
    quotationId,
    eventType: CHAT_SYSTEM_EVENT.QUOTATION_SUBMITTED,
    actorId: sellerId,
    metadata: { skip_push: true },
  });

  const quotation = await inquiryQuotationModel.findById(quotationId, { raw: true });
  const ctx = inquiryNotifyContext(inquiry);
  const copy = notificationCopy.quotationReceived({
    productName: ctx.productName,
    sellerCompany: ctx.sellerCompany,
    sellerName: ctx.sellerName,
    totalAmount: quotation?.total_amount ?? data.price,
    currency: inquiry.currency || 'INR',
    quantity: quotation?.quantity ?? data.quantity ?? inquiry.quantity,
    unit: quotation?.unit || data.unit || inquiry.unit,
    inquiryNumber: ctx.inquiryNumber,
  });

  pushInquiryNotify({
    receiverId: inquiry.buyer_id,
    type: NOTIFICATION_TYPE.QUOTATION_RECEIVED,
    title: copy.title,
    body: copy.body,
    referenceId: quotationId,
    senderId: sellerId,
    clickAction: NOTIFICATION_CLICK_ACTION.OPEN_QUOTATION,
    data: {
      inquiry_id: inquiryId,
      quotation_id: quotationId,
      product_id: inquiry.product_id,
      inquiry_number: ctx.inquiryNumber || undefined,
      product_name: ctx.productName || undefined,
      quotation_number: quotation?.quotation_number || undefined,
    },
  });

  return inquiryQuotationModel.findById(quotationId);
};

/** Seller updates price/terms on an editable quote. */
const updateQuotation = async (quotationId, sellerId, data) => {
  const quotation = await inquiryQuotationModel.findById(quotationId, { raw: true });
  if (!quotation) throw new AppError('Quotation not found', 404);
  if (quotation.seller_id !== sellerId) throw new AppError('Forbidden: Access denied', 403);
  if (!QUOTATION_EDITABLE_STATUSES.includes(quotation.status)) {
    throw new AppError('Quotation cannot be updated in its current status', 400);
  }

  const inquiry = await getInquiryOrFail(quotation.inquiry_id);
  const payload = buildQuotationPayload(
    { ...quotation, ...data },
    quotation.inquiry_id,
    sellerId,
    quotation.quotation_number,
  );
  delete payload.quotation_number;
  delete payload.inquiry_id;
  delete payload.seller_id;
  payload.status = QUOTATION_STATUS.UPDATED;

  await inquiryQuotationModel.updateQuotation(quotationId, payload);
  await chatService.recordInquirySystemEvent({
    inquiryId: inquiry.id,
    quotationId,
    eventType: CHAT_SYSTEM_EVENT.QUOTATION_UPDATED,
    actorId: sellerId,
    metadata: { skip_push: true },
  });

  const updatedQuote = await inquiryQuotationModel.findById(quotationId, { raw: true });
  const ctx = inquiryNotifyContext(inquiry);
  const copy = notificationCopy.quotationUpdated({
    productName: ctx.productName,
    sellerCompany: ctx.sellerCompany,
    sellerName: ctx.sellerName,
    totalAmount: updatedQuote?.total_amount ?? payload.total_amount ?? data.price,
    currency: inquiry.currency || 'INR',
    inquiryNumber: ctx.inquiryNumber,
  });

  pushInquiryNotify({
    receiverId: inquiry.buyer_id,
    type: NOTIFICATION_TYPE.QUOTATION_UPDATED,
    title: copy.title,
    body: copy.body,
    referenceId: quotationId,
    senderId: sellerId,
    clickAction: NOTIFICATION_CLICK_ACTION.OPEN_QUOTATION,
    data: {
      inquiry_id: inquiry.id,
      quotation_id: quotationId,
      product_id: inquiry.product_id,
      inquiry_number: ctx.inquiryNumber || undefined,
      product_name: ctx.productName || undefined,
      quotation_number: updatedQuote?.quotation_number || quotation.quotation_number || undefined,
    },
  });

  return inquiryQuotationModel.findById(quotationId);
};

/** Seller withdraws quote; inquiry returns to pending. */
const withdrawQuotation = async (quotationId, sellerId) => {
  const quotation = await inquiryQuotationModel.findById(quotationId, { raw: true });
  if (!quotation) throw new AppError('Quotation not found', 404);
  if (quotation.seller_id !== sellerId) throw new AppError('Forbidden: Access denied', 403);
  if (quotation.status === QUOTATION_STATUS.ACCEPTED) {
    throw new AppError('Accepted quotation cannot be withdrawn', 400);
  }

  await inquiryQuotationModel.updateQuotation(quotationId, { status: QUOTATION_STATUS.WITHDRAWN });
  await inquiryModel.updateInquiry(quotation.inquiry_id, {
    status: INQUIRY_STATUS.PENDING,
    updated_by: sellerId,
  });

  await chatService.recordInquirySystemEvent({
    inquiryId: quotation.inquiry_id,
    quotationId,
    eventType: CHAT_SYSTEM_EVENT.QUOTATION_WITHDRAWN,
    actorId: sellerId,
  });

  return inquiryQuotationModel.findById(quotationId);
};

// ==========================================
// Buyer quote decisions
// ==========================================

/** Buyer accepts quote; inquiry → accepted. */
const acceptQuotation = async (quotationId, buyerId) => {
  const quotation = await inquiryQuotationModel.findById(quotationId, { raw: true });
  if (!quotation) throw new AppError('Quotation not found', 404);

  const inquiry = await getInquiryOrFail(quotation.inquiry_id);
  if (inquiry.buyer_id !== buyerId) throw new AppError('Forbidden: Access denied', 403);
  if (![QUOTATION_STATUS.SUBMITTED, QUOTATION_STATUS.UPDATED].includes(quotation.status)) {
    throw new AppError('Quotation cannot be accepted in its current status', 400);
  }

  await db.transaction(async (trx) => {
    await inquiryQuotationModel.updateQuotation(
      quotationId,
      { status: QUOTATION_STATUS.ACCEPTED },
      trx,
    );
    await inquiryModel.updateInquiry(
      inquiry.id,
      { status: INQUIRY_STATUS.ACCEPTED, updated_by: buyerId },
      trx,
    );
  });

  await chatService.recordInquirySystemEvent({
    inquiryId: inquiry.id,
    quotationId,
    eventType: CHAT_SYSTEM_EVENT.QUOTATION_ACCEPTED,
    actorId: buyerId,
    metadata: { skip_push: true },
  });
  await chatService.recordInquirySystemEvent({
    inquiryId: inquiry.id,
    quotationId,
    eventType: CHAT_SYSTEM_EVENT.INQUIRY_ACCEPTED,
    actorId: buyerId,
    metadata: { skip_push: true },
  });

  const ctx = inquiryNotifyContext(inquiry);
  const copy = notificationCopy.quotationAccepted({
    productName: ctx.productName,
    buyerCompany: ctx.buyerCompany,
    buyerName: ctx.buyerName,
    totalAmount: quotation.total_amount,
    currency: inquiry.currency || 'INR',
  });

  pushInquiryNotify({
    receiverId: inquiry.seller_id,
    type: NOTIFICATION_TYPE.QUOTATION_ACCEPTED,
    title: copy.title,
    body: copy.body,
    referenceId: quotationId,
    senderId: buyerId,
    clickAction: NOTIFICATION_CLICK_ACTION.OPEN_QUOTATION,
    data: {
      inquiry_id: inquiry.id,
      quotation_id: quotationId,
      product_id: inquiry.product_id,
      inquiry_number: ctx.inquiryNumber || undefined,
      product_name: ctx.productName || undefined,
      quotation_number: quotation.quotation_number || undefined,
    },
  });

  return inquiryQuotationModel.findById(quotationId);
};

/** Buyer rejects quote; inquiry returns to pending for a new quote. */
const rejectQuotation = async (quotationId, buyerId) => {
  const quotation = await inquiryQuotationModel.findById(quotationId, { raw: true });
  if (!quotation) throw new AppError('Quotation not found', 404);

  const inquiry = await getInquiryOrFail(quotation.inquiry_id);
  if (inquiry.buyer_id !== buyerId) throw new AppError('Forbidden: Access denied', 403);

  await inquiryQuotationModel.updateQuotation(quotationId, { status: QUOTATION_STATUS.REJECTED });
  await inquiryModel.updateInquiry(inquiry.id, {
    status: INQUIRY_STATUS.PENDING,
    updated_by: buyerId,
  });

  await chatService.recordInquirySystemEvent({
    inquiryId: inquiry.id,
    quotationId,
    eventType: CHAT_SYSTEM_EVENT.QUOTATION_REJECTED,
    actorId: buyerId,
    metadata: { skip_push: true },
  });

  const ctx = inquiryNotifyContext(inquiry);
  const copy = notificationCopy.quotationRejected({
    productName: ctx.productName,
    buyerCompany: ctx.buyerCompany,
    buyerName: ctx.buyerName,
  });

  pushInquiryNotify({
    receiverId: inquiry.seller_id,
    type: NOTIFICATION_TYPE.QUOTATION_REJECTED,
    title: copy.title,
    body: copy.body,
    referenceId: quotationId,
    senderId: buyerId,
    clickAction: NOTIFICATION_CLICK_ACTION.OPEN_QUOTATION,
    data: {
      inquiry_id: inquiry.id,
      quotation_id: quotationId,
      product_id: inquiry.product_id,
      inquiry_number: ctx.inquiryNumber || undefined,
      product_name: ctx.productName || undefined,
      quotation_number: quotation.quotation_number || undefined,
    },
  });

  return inquiryQuotationModel.findById(quotationId);
};

/** Continue the shared buyer↔seller conversation for this inquiry (updates last_context). */
const getOrStartChat = async (inquiryId, userId) => {
  const inquiry = await getInquiryOrFail(inquiryId);
  assertParticipant(inquiry, userId);
  return chatService.startInquiryConversation({ inquiryId, userId });
};

module.exports = {
  createInquiry,
  getInquiryForUser,
  listBuyerInquiries,
  listSellerInquiries,
  updateInquiry,
  cancelInquiry,
  rejectInquiry,
  submitQuotation,
  updateQuotation,
  withdrawQuotation,
  acceptQuotation,
  rejectQuotation,
  getOrStartChat,
  enrichInquiryDetail,
};
