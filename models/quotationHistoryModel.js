/**
 * Quotation history data access.
 */
const db = require('../database/knex');

const createHistory = async ({ quotationId, oldPrice, newPrice, remarks, updatedBy }, trx = null) => {
  const client = trx || db;
  const [id] = await client('quotation_history').insert({
    quotation_id: quotationId,
    old_price: oldPrice,
    new_price: newPrice,
    remarks: remarks || null,
    updated_by: updatedBy,
  });
  return id;
};

const findByQuotationId = (quotationId) =>
  db('quotation_history').where({ quotation_id: quotationId }).orderBy('id', 'desc');

module.exports = {
  createHistory,
  findByQuotationId,
};
