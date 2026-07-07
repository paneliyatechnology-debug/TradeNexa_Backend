/**
 * RFQ module constants — statuses, visibility, and supplier types.
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

/** Statuses visible in supplier feed. */
const RFQ_SUPPLIER_VISIBLE_STATUSES = [
  RFQ_STATUS.PUBLISHED,
  RFQ_STATUS.OPEN,
  RFQ_STATUS.QUOTATION_RECEIVED,
  RFQ_STATUS.NEGOTIATION,
];

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

/** Statuses that allow supplier update. */
const QUOTATION_EDITABLE_STATUSES = [QUOTATION_STATUS.SUBMITTED, QUOTATION_STATUS.UPDATED];

// ==========================================
// Visibility & supplier type
// ==========================================

const RFQ_VISIBILITY = {
  PUBLIC: 'PUBLIC',
  PRIVATE: 'PRIVATE',
};

const RFQ_SUPPLIER_TYPE = {
  ANY: 'ANY',
  VERIFIED: 'VERIFIED',
  PREFERRED: 'PREFERRED',
};

// ==========================================
// RFQ supplier mapping status
// ==========================================

const RFQ_SUPPLIER_STATUS = {
  INVITED: 'INVITED',
  VIEWED: 'VIEWED',
  RESPONDED: 'RESPONDED',
  AWARDED: 'AWARDED',
  REJECTED: 'REJECTED',
};

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
];

module.exports = {
  RFQ_STATUS,
  RFQ_EDITABLE_STATUSES,
  RFQ_SUPPLIER_VISIBLE_STATUSES,
  QUOTATION_STATUS,
  QUOTATION_EDITABLE_STATUSES,
  RFQ_VISIBILITY,
  RFQ_SUPPLIER_TYPE,
  RFQ_SUPPLIER_STATUS,
  RFQ_AUDIT_ACTION,
  RFQ_SORT_BY_VALUES,
};
