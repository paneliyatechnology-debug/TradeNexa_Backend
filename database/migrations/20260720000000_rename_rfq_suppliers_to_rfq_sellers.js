/**
 * Rename rfq_suppliers table → rfq_sellers.
 * Run after supplier_id → seller_id column rename.
 */
exports.up = async function (knex) {
  const hasOld = await knex.schema.hasTable('rfq_suppliers');
  const hasNew = await knex.schema.hasTable('rfq_sellers');
  if (hasOld && !hasNew) {
    await knex.schema.renameTable('rfq_suppliers', 'rfq_sellers');
  }
};

exports.down = async function (knex) {
  const hasOld = await knex.schema.hasTable('rfq_suppliers');
  const hasNew = await knex.schema.hasTable('rfq_sellers');
  if (hasNew && !hasOld) {
    await knex.schema.renameTable('rfq_sellers', 'rfq_suppliers');
  }
};
