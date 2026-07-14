/**
 * Inquiry module constants — lifecycle statuses, quotation reuse, and list sort fields.
 *
 * Flow: pending → quoted | rejected | cancelled → accepted | closed
 */

// ==========================================
// Inquiry status
// ==========================================

const INQUIRY_STATUS = {
  PENDING: 'pending',
  QUOTED: 'quoted',
  REJECTED: 'rejected',
  ACCEPTED: 'accepted',
  CANCELLED: 'cancelled',
  CLOSED: 'closed',
};

const INQUIRY_STATUS_VALUES = Object.values(INQUIRY_STATUS);

/** Buyer may edit quantity/message only while the inquiry is still pending. */
const INQUIRY_EDITABLE_STATUSES = [INQUIRY_STATUS.PENDING];

/** Seller may reply (chat), send a quote, or reject while pending or quoted. */
const INQUIRY_SELLER_ACTIONABLE_STATUSES = [INQUIRY_STATUS.PENDING, INQUIRY_STATUS.QUOTED];

// ==========================================
// Quotation status (shared with RFQ module)
// ==========================================

/** Reuse RFQ quotation status values for inquiry quotes (SUBMITTED, ACCEPTED, …). */
const { QUOTATION_STATUS, QUOTATION_EDITABLE_STATUSES } = require('./rfq');

// ==========================================
// List sort fields
// ==========================================

const INQUIRY_SORT_BY_VALUES = [
  'id',
  'created_at',
  'updated_at',
  'status',
  'quantity',
  'expected_price',
];

const INQUIRY_QUOTATION_SORT_BY_VALUES = [
  'id',
  'price',
  'total_amount',
  'delivery_days',
  'created_at',
];

module.exports = {
  INQUIRY_STATUS,
  INQUIRY_STATUS_VALUES,
  INQUIRY_EDITABLE_STATUSES,
  INQUIRY_SELLER_ACTIONABLE_STATUSES,
  QUOTATION_STATUS,
  QUOTATION_EDITABLE_STATUSES,
  INQUIRY_SORT_BY_VALUES,
  INQUIRY_QUOTATION_SORT_BY_VALUES,
};
