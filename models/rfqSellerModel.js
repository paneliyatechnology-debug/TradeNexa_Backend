/**
 * RFQ seller mapping data access.
 */
const db = require('../database/knex');
const { RFQ_SELLER_STATUS } = require('../constants/rfq');

const findByRfqAndSeller = (rfqId, sellerId) =>
  db('rfq_sellers').where({ rfq_id: rfqId, seller_id: sellerId }).first();

const countByRfqId = async (rfqId) => {
  const row = await db('rfq_sellers').where({ rfq_id: rfqId }).count('* as count').first();
  return parseInt(row?.count || 0, 10);
};

const assignSellers = async (rfqId, sellerIds = [], trx = null) => {
  if (!sellerIds.length) return;
  const client = trx || db;
  const rows = sellerIds.map((sellerId) => ({
    rfq_id: rfqId,
    seller_id: sellerId,
    status: RFQ_SELLER_STATUS.INVITED,
  }));
  await client('rfq_sellers').insert(rows).onConflict(['rfq_id', 'seller_id']).ignore();
};

const markViewed = async (rfqId, sellerId, trx = null) => {
  const client = trx || db;
  const existing = await findByRfqAndSeller(rfqId, sellerId);
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

module.exports = {
  findByRfqAndSeller,
  countByRfqId,
  assignSellers,
  markViewed,
  markResponded,
  isSellerAllowed,
};
