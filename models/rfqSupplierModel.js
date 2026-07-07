/**
 * RFQ supplier mapping data access.
 */
const db = require('../database/knex');
const { RFQ_SUPPLIER_STATUS } = require('../constants/rfq');

const findByRfqAndSupplier = (rfqId, supplierId) =>
  db('rfq_suppliers').where({ rfq_id: rfqId, supplier_id: supplierId }).first();

const countByRfqId = async (rfqId) => {
  const row = await db('rfq_suppliers').where({ rfq_id: rfqId }).count('* as count').first();
  return parseInt(row?.count || 0, 10);
};

const assignSuppliers = async (rfqId, supplierIds = [], trx = null) => {
  if (!supplierIds.length) return;
  const client = trx || db;
  const rows = supplierIds.map((supplierId) => ({
    rfq_id: rfqId,
    supplier_id: supplierId,
    status: RFQ_SUPPLIER_STATUS.INVITED,
  }));
  await client('rfq_suppliers').insert(rows).onConflict(['rfq_id', 'supplier_id']).ignore();
};

const markViewed = async (rfqId, supplierId, trx = null) => {
  const client = trx || db;
  const existing = await findByRfqAndSupplier(rfqId, supplierId);
  if (existing) {
    if (!existing.viewed_at) {
      await client('rfq_suppliers')
        .where({ id: existing.id })
        .update({ viewed_at: client.fn.now(), status: RFQ_SUPPLIER_STATUS.VIEWED });
    }
    return;
  }
  await client('rfq_suppliers').insert({
    rfq_id: rfqId,
    supplier_id: supplierId,
    viewed_at: client.fn.now(),
    status: RFQ_SUPPLIER_STATUS.VIEWED,
  });
};

const markResponded = async (rfqId, supplierId, trx = null) => {
  const client = trx || db;
  await client('rfq_suppliers')
    .where({ rfq_id: rfqId, supplier_id: supplierId })
    .update({ responded_at: client.fn.now(), status: RFQ_SUPPLIER_STATUS.RESPONDED });
};

const isSupplierAllowed = async (rfq, supplierId) => {
  if (rfq.visibility === 'PUBLIC') return true;
  const row = await findByRfqAndSupplier(rfq.id, supplierId);
  return !!row;
};

module.exports = {
  findByRfqAndSupplier,
  countByRfqId,
  assignSuppliers,
  markViewed,
  markResponded,
  isSupplierAllowed,
};
