/**
 * RFQ module constants — statuses, visibility, and seller types.
 */

// ==========================================
// RFQ status
// ==========================================

const RFQ_STATUS = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  PUBLISHED: 'PUBLISHED',
  QUOTATION_RECEIVED: 'QUOTATION_RECEIVED',
  NEGOTIATION: 'NEGOTIATION',
  AWARDED: 'AWARDED',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  CLOSED: 'CLOSED',
};

/** Statuses that allow buyer update. */
const RFQ_EDITABLE_STATUSES = [RFQ_STATUS.DRAFT, RFQ_STATUS.OPEN];

/** Statuses visible in seller feed. */
const RFQ_SELLER_VISIBLE_STATUSES = [
  RFQ_STATUS.PUBLISHED,
  RFQ_STATUS.OPEN,
  RFQ_STATUS.QUOTATION_RECEIVED,
  RFQ_STATUS.NEGOTIATION,
];

/** @deprecated Use RFQ_SELLER_VISIBLE_STATUSES */
const RFQ_SUPPLIER_VISIBLE_STATUSES = RFQ_SELLER_VISIBLE_STATUSES;

// ==========================================
// Quotation status
// ==========================================

const QUOTATION_STATUS = {
  SUBMITTED: 'SUBMITTED',
  UPDATED: 'UPDATED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
  EXPIRED: 'EXPIRED',
};

/** Statuses that allow seller update. */
const QUOTATION_EDITABLE_STATUSES = [QUOTATION_STATUS.SUBMITTED, QUOTATION_STATUS.UPDATED];

// ==========================================
// Visibility & seller type
// ==========================================

const RFQ_VISIBILITY = {
  PUBLIC: 'PUBLIC',
  PRIVATE: 'PRIVATE',
};

const RFQ_SELLER_TYPE = {
  ANY: 'ANY',
  VERIFIED: 'VERIFIED',
  PREFERRED: 'PREFERRED',
};

/** @deprecated Use RFQ_SELLER_TYPE */
const RFQ_SUPPLIER_TYPE = RFQ_SELLER_TYPE;

// ==========================================
// RFQ seller mapping status
// ==========================================

const RFQ_SELLER_STATUS = {
  INVITED: 'INVITED',
  VIEWED: 'VIEWED',
  RESPONDED: 'RESPONDED',
  AWARDED: 'AWARDED',
  REJECTED: 'REJECTED',
};

/** @deprecated Use RFQ_SELLER_STATUS */
const RFQ_SUPPLIER_STATUS = RFQ_SELLER_STATUS;

// ==========================================
// Audit actions
// ==========================================

const RFQ_AUDIT_ACTION = {
  RFQ_CREATED: 'RFQ_CREATED',
  RFQ_UPDATED: 'RFQ_UPDATED',
  RFQ_PUBLISHED: 'RFQ_PUBLISHED',
  RFQ_CANCELLED: 'RFQ_CANCELLED',
  RFQ_CLOSED: 'RFQ_CLOSED',
  RFQ_EXPIRED: 'RFQ_EXPIRED',
  QUOTATION_SUBMITTED: 'QUOTATION_SUBMITTED',
  QUOTATION_UPDATED: 'QUOTATION_UPDATED',
  QUOTATION_ACCEPTED: 'QUOTATION_ACCEPTED',
  QUOTATION_REJECTED: 'QUOTATION_REJECTED',
  QUOTATION_WITHDRAWN: 'QUOTATION_WITHDRAWN',
  NEGOTIATION_STARTED: 'NEGOTIATION_STARTED',
  NEGOTIATION_COMPLETED: 'NEGOTIATION_COMPLETED',
};

const RFQ_SORT_BY_VALUES = [
  'id',
  'created_at',
  'quotation_deadline',
  'expected_price',
  'total_quotations',
  'title',
  'budget',
  'quantity',
  'category',
  'city',
];

const QUOTATION_SORT_BY_VALUES = [
  'id',
  'price',
  'total_amount',
  'delivery_days',
  'created_at',
];

module.exports = {
  RFQ_STATUS,
  RFQ_EDITABLE_STATUSES,
  RFQ_SELLER_VISIBLE_STATUSES,
  RFQ_SUPPLIER_VISIBLE_STATUSES,
  QUOTATION_STATUS,
  QUOTATION_EDITABLE_STATUSES,
  RFQ_VISIBILITY,
  RFQ_SELLER_TYPE,
  RFQ_SUPPLIER_TYPE,
  RFQ_SELLER_STATUS,
  RFQ_SUPPLIER_STATUS,
  RFQ_AUDIT_ACTION,
  RFQ_SORT_BY_VALUES,
  QUOTATION_SORT_BY_VALUES,
};
