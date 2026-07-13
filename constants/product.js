/**
 * Product module constants — condition, stock status, and approval workflow.
 */

// ==========================================
// Catalog enums
// ==========================================

const PRODUCT_CONDITION = {
  NEW: 'NEW',
  USED: 'USED',
  REFURBISHED: 'REFURBISHED',
};

const PRODUCT_STOCK_STATUS = {
  IN_STOCK: 'IN_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  LIMITED: 'LIMITED',
  MADE_TO_ORDER: 'MADE_TO_ORDER',
};

const PRODUCT_CONDITION_VALUES = Object.values(PRODUCT_CONDITION);
const PRODUCT_STOCK_STATUS_VALUES = Object.values(PRODUCT_STOCK_STATUS);

// ==========================================
// Approval / moderation
// ==========================================

/**
 * Moderation statuses.
 * Only `approved` products are buyer-visible (also require is_active).
 * `rejected` is terminal — no resubmit.
 */
const PRODUCT_APPROVAL_STATUS = {
  IN_REVIEW: 'in_review',
  REVISION_REQUIRED: 'revision_required',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const PRODUCT_APPROVAL_STATUS_VALUES = Object.values(PRODUCT_APPROVAL_STATUS);

/** History row `action` values (append-only product_review_history). */
const PRODUCT_REVIEW_ACTION = {
  SUBMITTED: 'submitted',
  RESUBMITTED: 'resubmitted',
  APPROVED: 'approved',
  REVISION_REQUIRED: 'revision_required',
  REJECTED: 'rejected',
};

/**
 * Allowed transitions: from → { to → { actor, remarksRequired } }.
 * actor: 'admin' | 'seller' | 'system'
 */
const PRODUCT_APPROVAL_TRANSITIONS = {
  [PRODUCT_APPROVAL_STATUS.IN_REVIEW]: {
    [PRODUCT_APPROVAL_STATUS.APPROVED]: { actor: 'admin', remarksRequired: false },
    [PRODUCT_APPROVAL_STATUS.REVISION_REQUIRED]: { actor: 'admin', remarksRequired: true },
    [PRODUCT_APPROVAL_STATUS.REJECTED]: { actor: 'admin', remarksRequired: true },
  },
  [PRODUCT_APPROVAL_STATUS.REVISION_REQUIRED]: {
    // Seller submit-for-review only
    [PRODUCT_APPROVAL_STATUS.IN_REVIEW]: { actor: 'seller', remarksRequired: false },
  },
  [PRODUCT_APPROVAL_STATUS.APPROVED]: {
    // Material seller edits force re-review
    [PRODUCT_APPROVAL_STATUS.IN_REVIEW]: { actor: 'seller', remarksRequired: false },
  },
  [PRODUCT_APPROVAL_STATUS.REJECTED]: {},
};

/**
 * Field changes that force an approved product back into `in_review`.
 * Soft fields (stock_quantity, is_active, is_trending) are intentionally omitted.
 */
const PRODUCT_MATERIAL_EDIT_FIELDS = [
  'name',
  'slug',
  'short_description',
  'description',
  'price',
  'currency',
  'moq',
  'unit',
  'category_id',
  'subcategory_id',
  'brand_id',
  'material',
  'country_of_origin',
  'product_condition',
  'thumbnail',
  'specifications',
  'search_tags',
  'hsn_code',
  'gst_percentage',
  'warranty',
  'show_price',
  'accept_inquiry',
];

module.exports = {
  PRODUCT_CONDITION,
  PRODUCT_STOCK_STATUS,
  PRODUCT_CONDITION_VALUES,
  PRODUCT_STOCK_STATUS_VALUES,
  PRODUCT_APPROVAL_STATUS,
  PRODUCT_APPROVAL_STATUS_VALUES,
  PRODUCT_REVIEW_ACTION,
  PRODUCT_APPROVAL_TRANSITIONS,
  PRODUCT_MATERIAL_EDIT_FIELDS,
};
