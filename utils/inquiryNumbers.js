/**
 * Unique inquiry and inquiry-quotation number generators.
 *
 * Format matches RFQ numbers: PREFIX-YYYYMMDD-NNNNNN (e.g. INQ-20260714-000001).
 */
const { generateSequentialNumber } = require('./rfqNumbers');

/** @param {import('knex').Knex} dbOrTrx */
const generateInquiryNumber = (dbOrTrx) =>
  generateSequentialNumber(dbOrTrx, 'inquiries', 'inquiry_number', 'INQ');

/** @param {import('knex').Knex} dbOrTrx */
const generateInquiryQuotationNumber = (dbOrTrx) =>
  generateSequentialNumber(dbOrTrx, 'inquiry_quotations', 'quotation_number', 'IQT');

module.exports = {
  generateInquiryNumber,
  generateInquiryQuotationNumber,
};
