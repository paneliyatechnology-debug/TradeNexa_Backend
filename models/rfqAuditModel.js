/**
 * RFQ audit log data access.
 */
const db = require('../database/knex');

const logAction = async ({ rfqId = null, quotationId = null, action, actorId = null, metadata = null }, trx = null) => {
  const client = trx || db;
  const [id] = await client('rfq_audit_logs').insert({
    rfq_id: rfqId,
    quotation_id: quotationId,
    action,
    actor_id: actorId,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
  return id;
};

module.exports = {
  logAction,
};
