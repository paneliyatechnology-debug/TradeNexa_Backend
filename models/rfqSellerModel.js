/**
 * RFQ seller mapping data access.
 */
const db = require('../database/knex');
const { resolveMediaUrl } = require('../utils/media');
const { RFQ_SELLER_STATUS } = require('../constants/rfq');

const findByRfqAndSeller = (rfqId, sellerId) =>
  db('rfq_sellers').where({ rfq_id: rfqId, seller_id: sellerId }).first();

const countByRfqId = async (rfqId) => {
  const row = await db('rfq_sellers').where({ rfq_id: rfqId }).count('* as count').first();
  return parseInt(row?.count || 0, 10);
};

const assignSellers = async (rfqId, sellerIds = [], trx = null) => {
  const ids = [
    ...new Set(
      (Array.isArray(sellerIds) ? sellerIds : [])
        .map((id) => parseInt(id, 10))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  if (!ids.length) return;

  const client = trx || db;
  const rows = ids.map((sellerId) => ({
    rfq_id: rfqId,
    seller_id: sellerId,
    status: RFQ_SELLER_STATUS.INVITED,
  }));
  await client('rfq_sellers').insert(rows).onConflict(['rfq_id', 'seller_id']).ignore();
};

const markViewed = async (rfqId, sellerId, trx = null) => {
  const client = trx || db;
  const existing = await client('rfq_sellers').where({ rfq_id: rfqId, seller_id: sellerId }).first();
  if (existing) {
    if (!existing.viewed_at) {
      await client('rfq_sellers')
        .where({ id: existing.id })
        .update({ viewed_at: client.fn.now(), status: RFQ_SELLER_STATUS.VIEWED });
    }
    return;
  }
  await client('rfq_sellers').insert({
    rfq_id: rfqId,
    seller_id: sellerId,
    viewed_at: client.fn.now(),
    status: RFQ_SELLER_STATUS.VIEWED,
  });
};

const markResponded = async (rfqId, sellerId, trx = null) => {
  const client = trx || db;
  await client('rfq_sellers')
    .where({ rfq_id: rfqId, seller_id: sellerId })
    .update({ responded_at: client.fn.now(), status: RFQ_SELLER_STATUS.RESPONDED });
};

const isSellerAllowed = async (rfq, sellerId) => {
  if (rfq.visibility === 'PUBLIC') return true;
  const row = await findByRfqAndSeller(rfq.id, sellerId);
  return !!row;
};

/**
 * Assigned/invited sellers for an RFQ with basic profile fields.
 * Used on PRIVATE RFQ detail responses.
 */
const listAssignedSellersByRfqId = async (rfqId) => {
  const rows = await db('rfq_sellers')
    .leftJoin('users', 'rfq_sellers.seller_id', '=', 'users.id')
    .leftJoin('company_details', 'users.id', '=', 'company_details.user_id')
    .where('rfq_sellers.rfq_id', rfqId)
    .whereNull('users.deleted_at')
    .select(
      'rfq_sellers.seller_id',
      'rfq_sellers.status as invite_status',
      'rfq_sellers.viewed_at',
      'rfq_sellers.responded_at',
      'rfq_sellers.created_at as invited_at',
      'users.full_name',
      'users.email',
      'users.mobile_number',
      'users.is_verified',
      'company_details.company_name',
      'company_details.rating',
      db.raw('COALESCE(company_details.company_logo, users.profile_image) as company_logo'),
    )
    .orderBy('rfq_sellers.id', 'asc');

  return rows.map((row) => ({
    id: row.seller_id,
    user_id: row.seller_id,
    full_name: row.full_name ?? null,
    email: row.email ?? null,
    mobile_number: row.mobile_number ?? null,
    is_verified: !!row.is_verified,
    invite_status: row.invite_status ?? null,
    viewed_at: row.viewed_at ?? null,
    responded_at: row.responded_at ?? null,
    invited_at: row.invited_at ?? null,
    company: {
      company_name: row.company_name ?? null,
      company_logo: row.company_logo ? resolveMediaUrl(row.company_logo) : null,
      rating: row.rating != null ? parseFloat(row.rating) : null,
    },
  }));
};

module.exports = {
  findByRfqAndSeller,
  countByRfqId,
  assignSellers,
  markViewed,
  markResponded,
  isSellerAllowed,
  listAssignedSellersByRfqId,
};
