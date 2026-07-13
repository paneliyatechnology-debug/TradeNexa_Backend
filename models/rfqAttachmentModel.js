/**
 * RFQ attachment data access.
 */
const db = require('../database/knex');
const { resolveMediaUrl } = require('../utils/media');

const formatRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    file_url: resolveMediaUrl(row.file_path),
  };
};

const findByRfqId = async (rfqId, trx = null) => {
  const client = trx || db;
  const rows = await client('rfq_attachments').where({ rfq_id: rfqId }).orderBy('id', 'asc');
  return rows.map(formatRow);
};

const createAttachments = async (rfqId, attachments = [], trx = null) => {
  if (!attachments.length) return [];
  const client = trx || db;
  const payload = attachments.map((file) => ({
    rfq_id: rfqId,
    file_name: file.file_name,
    file_path: file.file_path,
    file_type: file.file_type || null,
  }));
  await client('rfq_attachments').insert(payload);
  // Must use same connection/trx — querying via global `db` while trx is open
  // causes InnoDB lock waits (often 15–50s) against uncommitted rows.
  return findByRfqId(rfqId, client);
};

const deleteByRfqId = async (rfqId, trx = null) => {
  const client = trx || db;
  await client('rfq_attachments').where({ rfq_id: rfqId }).del();
};

module.exports = {
  findByRfqId,
  createAttachments,
  deleteByRfqId,
};
