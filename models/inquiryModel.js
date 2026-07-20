/**
 * Inquiry data access — product-scoped buyer→seller inquiries.
 *
 * Joins product, buyer/seller profiles, and the shared chat conversation
 * (matched by buyer_id + seller_id, not inquiry_id — one thread per pair).
 */
const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { applyListSort } = require('../utils/listQuery');
const { resolveMediaUrl } = require('../utils/media');
const { INQUIRY_SORT_BY_VALUES } = require('../constants/inquiry');
const inquiryQuotationModel = require('./inquiryQuotationModel');

// ==========================================
// Sort configuration
// ==========================================

const SORT_MAP = {
  id: 'inquiries.id',
  created_at: 'inquiries.created_at',
  updated_at: 'inquiries.updated_at',
  status: 'inquiries.status',
  quantity: 'inquiries.quantity',
  expected_price: 'inquiries.expected_price',
};

// ==========================================
// Formatting helpers
// ==========================================

const formatUser = (id, name, email, companyName, companyLogo) => {
  if (!id) return null;
  return {
    id,
    user_id: id,
    name: name || null,
    email: email || null,
    company_name: companyName || null,
    company_logo: companyLogo ? resolveMediaUrl(companyLogo) : null,
  };
};

/** Normalize an inquiry row (with joins) for API responses. */
const formatInquiryRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    inquiry_number: row.inquiry_number,
    product_id: row.product_id,
    product: row.product_id
      ? {
          id: row.product_id,
          name: row.product_name || null,
          slug: row.product_slug || null,
          thumbnail: row.product_thumbnail ? resolveMediaUrl(row.product_thumbnail) : null,
          price: row.product_price !== undefined && row.product_price !== null
            ? parseFloat(row.product_price)
            : null,
          currency: row.product_currency || null,
          unit: row.product_unit || null,
          moq: row.product_moq ?? null,
        }
      : null,
    buyer: formatUser(
      row.buyer_id,
      row.buyer_name,
      row.buyer_email,
      row.buyer_company_name,
      row.buyer_company_logo,
    ),
    seller: formatUser(
      row.seller_id,
      row.seller_name,
      row.seller_email,
      row.seller_company_name,
      row.seller_company_logo,
    ),
    buyer_id: row.buyer_id,
    seller_id: row.seller_id,
    quantity: row.quantity,
    unit: row.unit,
    message: row.message,
    expected_price:
      row.expected_price !== undefined && row.expected_price !== null
        ? parseFloat(row.expected_price)
        : null,
    currency: row.currency,
    required_before: row.required_before,
    status: row.status,
    reject_reason: row.reject_reason || null,
    viewed_at: row.viewed_at,
    responded_at: row.responded_at,
    is_active: !!row.is_active,
    conversation_id: row.conversation_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

// ==========================================
// Query builders
// ==========================================

/** Base inquiry query with product, participants, and shared chat thread. */
const baseInquiryQuery = () =>
  db('inquiries')
    .leftJoin('products', 'products.id', 'inquiries.product_id')
    .leftJoin('users as buyer', 'buyer.id', 'inquiries.buyer_id')
    .leftJoin('users as seller', 'seller.id', 'inquiries.seller_id')
    .leftJoin('company_details as buyer_profile', 'buyer_profile.user_id', 'buyer.id')
    .leftJoin('company_details as seller_profile', 'seller_profile.user_id', 'seller.id')
    // Conversation is per buyer↔seller pair (not per inquiry)
    .leftJoin('chat_conversations', function () {
      this.on('chat_conversations.buyer_id', '=', 'inquiries.buyer_id')
        .andOn('chat_conversations.seller_id', '=', 'inquiries.seller_id')
        .andOn('chat_conversations.is_active', '=', db.raw('1'));
    })
    .whereNull('inquiries.deleted_at')
    .select(
      'inquiries.*',
      'products.name as product_name',
      'products.slug as product_slug',
      'products.thumbnail as product_thumbnail',
      'products.price as product_price',
      'products.currency as product_currency',
      'products.unit as product_unit',
      'products.moq as product_moq',
      'buyer.full_name as buyer_name',
      'buyer.email as buyer_email',
      'buyer_profile.company_name as buyer_company_name',
      db.raw('COALESCE(buyer_profile.company_logo, buyer.profile_image) as buyer_company_logo'),
      'seller.full_name as seller_name',
      'seller.email as seller_email',
      'seller_profile.company_name as seller_company_name',
      db.raw('COALESCE(seller_profile.company_logo, seller.profile_image) as seller_company_logo'),
      'chat_conversations.id as conversation_id',
    );

const applyFilters = (q, filters = {}) => {
  if (filters.buyer_id) q.where('inquiries.buyer_id', filters.buyer_id);
  if (filters.seller_id) q.where('inquiries.seller_id', filters.seller_id);
  if (filters.product_id) q.where('inquiries.product_id', filters.product_id);
  if (filters.status) {
    if (Array.isArray(filters.status)) q.whereIn('inquiries.status', filters.status);
    else q.where('inquiries.status', filters.status);
  }
  if (filters.is_active !== undefined) q.where('inquiries.is_active', filters.is_active);

  if (filters.date) {
    q.whereRaw('DATE(inquiries.created_at) = ?', [String(filters.date).slice(0, 10)]);
  }

  if (filters.search) {
    const term = `%${String(filters.search).trim()}%`;
    q.where((builder) => {
      builder
        .where('inquiries.inquiry_number', 'like', term)
        .orWhere('inquiries.message', 'like', term)
        .orWhere('products.name', 'like', term)
        .orWhere('buyer.full_name', 'like', term)
        .orWhere('seller.full_name', 'like', term)
        .orWhere('buyer_profile.company_name', 'like', term)
        .orWhere('seller_profile.company_name', 'like', term);
    });
  }
};

// ==========================================
// Read operations
// ==========================================

/**
 * @param {number} id
 * @param {{ raw?: boolean }} [options] - When raw=true, skip formatInquiryRow
 */
const findById = async (id, { raw = false } = {}) => {
  const row = await baseInquiryQuery().where('inquiries.id', id).first();
  if (!row || raw) return row || null;
  return formatInquiryRow(row);
};

/** Active pending inquiry for the same buyer + product (blocks duplicates). */
const findPendingByBuyerAndProduct = (buyerId, productId) =>
  db('inquiries')
    .where({ buyer_id: buyerId, product_id: productId, status: 'pending' })
    .whereNull('deleted_at')
    .first();

/**
 * True when the buyer has any non-cancelled inquiry on this product.
 * Used for product detail `user_actions.is_inquiry_sent`.
 */
const hasInquiryForBuyerProduct = async (buyerId, productId) => {
  const row = await db('inquiries')
    .where({ buyer_id: buyerId, product_id: productId })
    .whereNull('deleted_at')
    .whereNotIn('status', ['cancelled'])
    .first();
  return !!row;
};

/**
 * Batch inquiry state for product list cards.
 * @param {number} buyerId
 * @param {number[]} productIds
 * @returns {Promise<Map<number, { is_inquiry_sent: boolean, conversation_id: number|null }>>}
 */
const mapInquiryStateByProducts = async (buyerId, productIds = []) => {
  const map = new Map();
  if (!buyerId || !productIds.length) return map;

  const uniqueIds = [...new Set(productIds.map((id) => Number(id)).filter((id) => id > 0))];
  if (!uniqueIds.length) return map;

  const rows = await db('inquiries')
    .leftJoin('chat_conversations', function () {
      this.on('chat_conversations.buyer_id', '=', 'inquiries.buyer_id')
        .andOn('chat_conversations.seller_id', '=', 'inquiries.seller_id')
        .andOn('chat_conversations.is_active', '=', db.raw('1'));
    })
    .where('inquiries.buyer_id', buyerId)
    .whereIn('inquiries.product_id', uniqueIds)
    .whereNull('inquiries.deleted_at')
    .whereNotIn('inquiries.status', ['cancelled'])
    .select(
      'inquiries.product_id',
      'chat_conversations.id as conversation_id',
      'inquiries.updated_at',
      'inquiries.id as inquiry_id',
    )
    .orderBy('inquiries.updated_at', 'desc')
    .orderBy('inquiries.id', 'desc');

  for (const row of rows) {
    const productId = Number(row.product_id);
    if (map.has(productId)) continue;
    map.set(productId, {
      is_inquiry_sent: true,
      conversation_id: row.conversation_id ? Number(row.conversation_id) : null,
    });
  }

  return map;
};

/**
 * Single-product inquiry state for the authenticated buyer.
 * @returns {Promise<{ is_inquiry_sent: boolean, conversation_id: number|null }>}
 */
const getInquiryStateForBuyerProduct = async (buyerId, productId) => {
  const map = await mapInquiryStateByProducts(buyerId, [productId]);
  return map.get(Number(productId)) || { is_inquiry_sent: false, conversation_id: null };
};

/** Paginated inquiry list for buyer inbox, seller feed, or admin filters. */
const listInquiries = async (filters = {}) => {
  const q = baseInquiryQuery();
  applyFilters(q, filters);
  applyListSort(q, filters, SORT_MAP, {
    defaultSortBy: 'created_at',
    defaultSortOrder: 'desc',
    allowedSortBy: INQUIRY_SORT_BY_VALUES,
  });

  if (!filters.sort_by) {
    q.orderBy('inquiries.created_at', 'desc');
    q.orderBy('inquiries.id', 'desc');
  }

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  const paginated = await paginate(q, page, limit);
  const formatted = paginated.results.map(formatInquiryRow);

  const quotationMap = await inquiryQuotationModel.mapByInquiryIds(
    formatted.map((item) => item.id),
  );

  paginated.results = formatted.map((item) => ({
    ...item,
    quotation: quotationMap.get(Number(item.id)) || null,
  }));

  return paginated;
};

// ==========================================
// Write operations
// ==========================================

/**
 * @param {Object} data - Column map for inserts
 * @param {Object|null} [trx]
 */
const createInquiry = async (data, trx = null) => {
  const client = trx || db;
  const [id] = await client('inquiries').insert(data);
  return client('inquiries').where({ id }).first();
};

/**
 * @param {number} id
 * @param {Object} data
 * @param {Object|null} [trx]
 */
const updateInquiry = async (id, data, trx = null) => {
  const client = trx || db;
  await client('inquiries')
    .where({ id })
    .update({ ...data, updated_at: client.fn.now() });
  return client('inquiries').where({ id }).first();
};

module.exports = {
  formatInquiryRow,
  findById,
  findPendingByBuyerAndProduct,
  hasInquiryForBuyerProduct,
  mapInquiryStateByProducts,
  getInquiryStateForBuyerProduct,
  listInquiries,
  createInquiry,
  updateInquiry,
};
