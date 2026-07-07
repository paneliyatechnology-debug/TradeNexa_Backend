/**
 * Unique RFQ and quotation number generators.
 */

// ==========================================
// Number generators
// ==========================================

/**
 * @param {import('knex').Knex} dbOrTrx - Knex instance or transaction
 * @param {string} table - Table name
 * @param {string} column - Column name for the number
 * @param {string} prefix - e.g. RFQ or QT
 */
const generateSequentialNumber = async (dbOrTrx, table, column, prefix) => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const dayPrefix = `${prefix}-${date}-`;

  const last = await dbOrTrx(table)
    .where(column, 'like', `${dayPrefix}%`)
    .orderBy('id', 'desc')
    .first();

  const lastSeq = last?.[column] ? parseInt(String(last[column]).split('-').pop(), 10) : 0;
  const nextSeq = Number.isNaN(lastSeq) ? 1 : lastSeq + 1;

  return `${dayPrefix}${String(nextSeq).padStart(6, '0')}`;
};

const generateRfqNumber = (dbOrTrx) =>
  generateSequentialNumber(dbOrTrx, 'rfqs', 'rfq_number', 'RFQ');

const generateQuotationNumber = (dbOrTrx) =>
  generateSequentialNumber(dbOrTrx, 'quotations', 'quotation_number', 'QT');

module.exports = {
  generateRfqNumber,
  generateQuotationNumber,
};
