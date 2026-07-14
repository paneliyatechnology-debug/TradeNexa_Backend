/**
 * Product approval / moderation business logic.
 *
 * Owns status transitions, review history writes, seller resubmit,
 * admin approve/revision/reject (always via product_ids[] — one or many),
 * and re-review on material edits to already-approved products.
 */
const db = require('../database/knex');
const productModel = require('../models/productModel');
const productReviewModel = require('../models/productReviewModel');
const { AppError } = require('../utils/response');
const { HTTP_STATUS, ADMIN_PANEL_ROLE_CODES } = require('../constants');
const {
  PRODUCT_APPROVAL_STATUS,
  PRODUCT_APPROVAL_TRANSITIONS,
  PRODUCT_REVIEW_ACTION,
  PRODUCT_MATERIAL_EDIT_FIELDS,
} = require('../constants/product');
const logger = require('../utils/logger');

// ==========================================
// Notification hooks (integration points only)
// ==========================================

/** Log-only hook — swap for push/email/in-app later (same pattern as RFQ). */
const notify = (event, payload = {}) => {
  logger.info(`[Product Approval Hook] ${event}`, { event, ...payload });
};

// ==========================================
// Helpers
// ==========================================

/** True when role is an admin-panel role (admin | super_admin | supporter). */
const isAdminRole = (role) => ADMIN_PANEL_ROLE_CODES.includes(role);

/**
 * Enforce allowed status transitions from PRODUCT_APPROVAL_TRANSITIONS.
 * @param {string} fromStatus
 * @param {string} toStatus
 * @param {'admin'|'seller'|'system'} actorType
 * @returns {{ actor: string, remarksRequired: boolean }}
 */
const assertTransition = (fromStatus, toStatus, actorType) => {
  const allowed = PRODUCT_APPROVAL_TRANSITIONS[fromStatus]?.[toStatus];
  if (!allowed) {
    throw new AppError(
      `Invalid status transition from ${fromStatus} to ${toStatus}`,
      HTTP_STATUS.CONFLICT,
    );
  }
  if (allowed.actor !== actorType && actorType !== 'system') {
    throw new AppError(
      `Only ${allowed.actor} can transition from ${fromStatus} to ${toStatus}`,
      HTTP_STATUS.FORBIDDEN,
    );
  }
  return allowed;
};

/** Validate admin remarks (required for revision_required / rejected). */
const requireRemarks = (remarks, label = 'Remarks') => {
  const text = typeof remarks === 'string' ? remarks.trim() : '';
  if (!text || text.length < 10) {
    throw new AppError(`${label} are required (min 10 characters)`, HTTP_STATUS.BAD_REQUEST);
  }
  if (text.length > 2000) {
    throw new AppError(`${label} must be at most 2000 characters`, HTTP_STATUS.BAD_REQUEST);
  }
  return text;
};

/**
 * Apply a moderation status change: update products denormalized fields + append history.
 * Never overwrites previous history rows.
 *
 * @param {Object} product - Raw product row
 * @param {Object} options
 * @param {string} options.toStatus
 * @param {string} options.action - PRODUCT_REVIEW_ACTION value
 * @param {number|null} options.actorId
 * @param {string|null} options.actorRole
 * @param {'admin'|'seller'|'system'} options.actorType
 * @param {string|null} [options.remarks]
 * @param {boolean} [options.bumpVersion] - Increment review_version (resubmit)
 * @param {Object|null} [options.metadata]
 * @param {import('knex').Knex|null} [trx]
 * @returns {Promise<Object>} Formatted product
 */
const applyStatusChange = async (
  product,
  {
    toStatus,
    action,
    actorId,
    actorRole,
    actorType,
    remarks = null,
    bumpVersion = false,
    metadata = null,
  },
  trx = null,
) => {
  const fromStatus = product.approval_status || PRODUCT_APPROVAL_STATUS.IN_REVIEW;
  const rule = assertTransition(fromStatus, toStatus, actorType);

  if (rule.remarksRequired) {
    remarks = requireRemarks(remarks);
  } else if (remarks != null && String(remarks).trim()) {
    remarks = String(remarks).trim();
  } else {
    remarks = null;
  }

  const client = trx || db;
  const nextVersion = bumpVersion
    ? parseInt(product.review_version || 1, 10) + 1
    : parseInt(product.review_version || 1, 10);

  const updates = {
    approval_status: toStatus,
    review_version: nextVersion,
    updated_by: actorId,
    updated_at: client.fn.now(),
  };

  // Resubmit: bump queue timestamps so admin "oldest pending" sort works
  if (toStatus === PRODUCT_APPROVAL_STATUS.IN_REVIEW && bumpVersion) {
    updates.resubmitted_at = client.fn.now();
    updates.submitted_at = client.fn.now();
  }

  // Admin decision: denormalize latest review onto the product row
  if (actorType === 'admin') {
    updates.reviewed_at = client.fn.now();
    updates.reviewed_by = actorId;
    updates.latest_review_remarks = remarks;
  }

  await client('products').where({ id: product.id }).update(updates);

  await productReviewModel.createReviewHistory(
    {
      productId: product.id,
      reviewVersion: nextVersion,
      action,
      fromStatus,
      toStatus,
      remarks,
      actorId,
      actorRole,
      metadata,
    },
    client,
  );

  return productModel.findProductById(product.id);
};

// ==========================================
// Seller lifecycle
// ==========================================

/**
 * After product create: ensure in_review + write first history row (submitted).
 * @param {Object} product
 * @param {number} actorId
 * @param {string} [actorRole='seller']
 * @param {import('knex').Knex|null} [trx]
 */
const recordInitialSubmission = async (product, actorId, actorRole = 'seller', trx = null) => {
  const client = trx || db;
  await client('products')
    .where({ id: product.id })
    .update({
      approval_status: PRODUCT_APPROVAL_STATUS.IN_REVIEW,
      review_version: 1,
      submitted_at: client.fn.now(),
      latest_review_remarks: null,
      reviewed_at: null,
      reviewed_by: null,
    });

  await productReviewModel.createReviewHistory(
    {
      productId: product.id,
      reviewVersion: 1,
      action: PRODUCT_REVIEW_ACTION.SUBMITTED,
      fromStatus: null,
      toStatus: PRODUCT_APPROVAL_STATUS.IN_REVIEW,
      remarks: null,
      actorId,
      actorRole,
    },
    client,
  );

  notify('PRODUCT_SUBMITTED', { productId: product.id, sellerId: product.seller_id || actorId });
  return productModel.findProductById(product.id);
};

/**
 * After seller update: keep approval workflow consistent with status.
 * - Rejected → blocked
 * - revision_required → any successful update resubmits to in_review (replaces old POST /submit)
 * - approved + material/media change → back to in_review
 * - in_review → edits allowed, status unchanged
 *
 * @param {Object} existing - Product row before update
 * @param {Object} updatePayload - Fields being written; may include `__has_media_change`
 * @param {number} actorId
 * @param {string} [actorRole]
 * @returns {Promise<Object|null>} Updated product when status changed, else null
 */
const handleSellerUpdateApproval = async (existing, updatePayload, actorId, actorRole) => {
  const status = existing.approval_status || PRODUCT_APPROVAL_STATUS.APPROVED;

  if (status === PRODUCT_APPROVAL_STATUS.REJECTED) {
    throw new AppError('Rejected products cannot be updated', HTTP_STATUS.CONFLICT);
  }

  // Seller fixed items after admin revision — update itself is the resubmit
  if (status === PRODUCT_APPROVAL_STATUS.REVISION_REQUIRED) {
    delete updatePayload.__has_media_change;
    const refreshed = await productModel.findProductById(existing.id, { raw: true });
    const updated = await applyStatusChange(refreshed, {
      toStatus: PRODUCT_APPROVAL_STATUS.IN_REVIEW,
      action: PRODUCT_REVIEW_ACTION.RESUBMITTED,
      actorId,
      actorRole: actorRole || 'seller',
      actorType: 'seller',
      bumpVersion: true,
      metadata: { reason: 'update_after_revision_required' },
    });

    notify('PRODUCT_RESUBMITTED', {
      productId: existing.id,
      sellerId: actorId,
      reason: 'revision_update',
    });
    return updated;
  }

  if (status !== PRODUCT_APPROVAL_STATUS.APPROVED) {
    return null;
  }

  const changedMaterial = PRODUCT_MATERIAL_EDIT_FIELDS.some(
    (field) => updatePayload[field] !== undefined,
  );
  // Media is applied outside the text payload; controller/service sets this flag
  if (!changedMaterial && !updatePayload.__has_media_change) {
    return null;
  }

  delete updatePayload.__has_media_change;

  const refreshed = await productModel.findProductById(existing.id, { raw: true });
  const updated = await applyStatusChange(refreshed, {
    toStatus: PRODUCT_APPROVAL_STATUS.IN_REVIEW,
    action: PRODUCT_REVIEW_ACTION.RESUBMITTED,
    actorId,
    actorRole: actorRole || 'seller',
    actorType: 'seller',
    bumpVersion: true,
    metadata: { reason: 'material_edit_on_approved' },
  });

  notify('PRODUCT_RESUBMITTED', {
    productId: existing.id,
    sellerId: actorId,
    reason: 'material_edit',
  });
  return updated;
};

// ==========================================
// Admin review actions (always product_ids[])
// ==========================================

/**
 * Apply a per-product handler across product_ids (1–100).
 * Continues on failures so partial success is returned.
 * @returns {{ succeeded: Array, failed: Array, total: number }}
 */
const runForProductIds = async (productIds, handler) => {
  const ids = [...new Set((productIds || []).map((id) => parseInt(id, 10)).filter((id) => id > 0))];
  if (!ids.length) {
    throw new AppError('product_ids must be a non-empty array', HTTP_STATUS.BAD_REQUEST);
  }
  if (ids.length > 100) {
    throw new AppError('Maximum 100 products per request', HTTP_STATUS.BAD_REQUEST);
  }

  const succeeded = [];
  const failed = [];

  for (const id of ids) {
    try {
      const product = await handler(id);
      succeeded.push({ id, approval_status: product.approval_status });
    } catch (err) {
      failed.push({ id, message: err.message || 'Failed' });
    }
  }

  return { succeeded, failed, total: ids.length };
};

/** Approve one product → buyer-visible when is_active. */
const approveOne = async (productId, adminId, role, remarks = null) => {
  const product = await productModel.findProductById(productId, { raw: true });
  if (!product) throw new AppError('Product not found', HTTP_STATUS.NOT_FOUND);

  const updated = await applyStatusChange(product, {
    toStatus: PRODUCT_APPROVAL_STATUS.APPROVED,
    action: PRODUCT_REVIEW_ACTION.APPROVED,
    actorId: adminId,
    actorRole: role || 'admin',
    actorType: 'admin',
    remarks,
  });

  notify('PRODUCT_APPROVED', { productId, sellerId: product.seller_id, adminId });
  return updated;
};

/** Request revision on one product — remarks mandatory. */
const requestRevisionOne = async (productId, adminId, role, remarks) => {
  const product = await productModel.findProductById(productId, { raw: true });
  if (!product) throw new AppError('Product not found', HTTP_STATUS.NOT_FOUND);

  const updated = await applyStatusChange(product, {
    toStatus: PRODUCT_APPROVAL_STATUS.REVISION_REQUIRED,
    action: PRODUCT_REVIEW_ACTION.REVISION_REQUIRED,
    actorId: adminId,
    actorRole: role || 'admin',
    actorType: 'admin',
    remarks,
  });

  notify('PRODUCT_REVISION_REQUIRED', {
    productId,
    sellerId: product.seller_id,
    adminId,
    remarks: updated.latest_review_remarks,
  });
  return updated;
};

/** Reject one product — remarks mandatory; terminal. */
const rejectOne = async (productId, adminId, role, remarks) => {
  const product = await productModel.findProductById(productId, { raw: true });
  if (!product) throw new AppError('Product not found', HTTP_STATUS.NOT_FOUND);

  const updated = await applyStatusChange(product, {
    toStatus: PRODUCT_APPROVAL_STATUS.REJECTED,
    action: PRODUCT_REVIEW_ACTION.REJECTED,
    actorId: adminId,
    actorRole: role || 'admin',
    actorType: 'admin',
    remarks,
  });

  notify('PRODUCT_REJECTED', {
    productId,
    sellerId: product.seller_id,
    adminId,
    remarks: updated.latest_review_remarks,
  });
  return updated;
};

/**
 * Admin approve — always pass product_ids as an array (single or multiple).
 * Example: `{ "product_ids": [12] }` or `{ "product_ids": [12, 15, 18] }`
 */
const approveProducts = (productIds, adminId, role, remarks = null) =>
  runForProductIds(productIds, (id) => approveOne(id, adminId, role, remarks));

/**
 * Admin request revision — product_ids[] + required remarks (shared for all).
 */
const requestRevision = (productIds, adminId, role, remarks) => {
  requireRemarks(remarks);
  return runForProductIds(productIds, (id) => requestRevisionOne(id, adminId, role, remarks));
};

/**
 * Admin reject — product_ids[] + required remarks (shared for all).
 */
const rejectProducts = (productIds, adminId, role, remarks) => {
  requireRemarks(remarks);
  return runForProductIds(productIds, (id) => rejectOne(id, adminId, role, remarks));
};

// ==========================================
// Review history
// ==========================================

/** Paginated review history — seller owner or admin only. */
const getReviewHistory = async (productId, viewer, filters = {}) => {
  const product = await productModel.findProductById(productId, { raw: true });
  if (!product) throw new AppError('Product not found', HTTP_STATUS.NOT_FOUND);

  const admin = isAdminRole(viewer?.role);
  if (!admin && String(product.seller_id) !== String(viewer?.id)) {
    throw new AppError('Forbidden', HTTP_STATUS.FORBIDDEN);
  }

  return productReviewModel.listByProductId(productId, filters);
};

module.exports = {
  recordInitialSubmission,
  approveProducts,
  requestRevision,
  rejectProducts,
  handleSellerUpdateApproval,
  getReviewHistory,
  isAdminRole,
  PRODUCT_APPROVAL_STATUS,
};
