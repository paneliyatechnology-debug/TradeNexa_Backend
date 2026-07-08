/**
 * Rename supplier_id → seller_id across products, RFQ, and quotation tables.
 * awarded_supplier_id → awarded_seller_id on rfqs.
 *
 * Drop FKs before rename (MySQL requirement); indexes follow the renamed columns.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('products', (table) => {
    table.dropForeign(['supplier_id']);
  });
  await knex.schema.alterTable('products', (table) => {
    table.renameColumn('supplier_id', 'seller_id');
  });
  await knex.schema.alterTable('products', (table) => {
    table.foreign('seller_id').references('id').inTable('users').onDelete('CASCADE');
  });

  await knex.schema.alterTable('rfqs', (table) => {
    table.dropForeign(['awarded_supplier_id']);
  });
  await knex.schema.alterTable('rfqs', (table) => {
    table.renameColumn('awarded_supplier_id', 'awarded_seller_id');
  });
  await knex.schema.alterTable('rfqs', (table) => {
    table.foreign('awarded_seller_id').references('id').inTable('users').onDelete('SET NULL');
  });

  await knex.schema.alterTable('rfq_suppliers', (table) => {
    table.dropForeign(['supplier_id']);
  });
  await knex.schema.alterTable('rfq_suppliers', (table) => {
    table.renameColumn('supplier_id', 'seller_id');
  });
  await knex.schema.alterTable('rfq_suppliers', (table) => {
    table.foreign('seller_id').references('id').inTable('users').onDelete('CASCADE');
  });

  await knex.schema.alterTable('quotations', (table) => {
    table.dropForeign(['supplier_id']);
  });
  await knex.schema.alterTable('quotations', (table) => {
    table.renameColumn('supplier_id', 'seller_id');
  });
  await knex.schema.alterTable('quotations', (table) => {
    table.foreign('seller_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('quotations', (table) => {
    table.dropForeign(['seller_id']);
  });
  await knex.schema.alterTable('quotations', (table) => {
    table.renameColumn('seller_id', 'supplier_id');
  });
  await knex.schema.alterTable('quotations', (table) => {
    table.foreign('supplier_id').references('id').inTable('users').onDelete('CASCADE');
  });

  await knex.schema.alterTable('rfq_suppliers', (table) => {
    table.dropForeign(['seller_id']);
  });
  await knex.schema.alterTable('rfq_suppliers', (table) => {
    table.renameColumn('seller_id', 'supplier_id');
  });
  await knex.schema.alterTable('rfq_suppliers', (table) => {
    table.foreign('supplier_id').references('id').inTable('users').onDelete('CASCADE');
  });

  await knex.schema.alterTable('rfqs', (table) => {
    table.dropForeign(['awarded_seller_id']);
  });
  await knex.schema.alterTable('rfqs', (table) => {
    table.renameColumn('awarded_seller_id', 'awarded_supplier_id');
  });
  await knex.schema.alterTable('rfqs', (table) => {
    table.foreign('awarded_supplier_id').references('id').inTable('users').onDelete('SET NULL');
  });

  await knex.schema.alterTable('products', (table) => {
    table.dropForeign(['seller_id']);
  });
  await knex.schema.alterTable('products', (table) => {
    table.renameColumn('seller_id', 'supplier_id');
  });
  await knex.schema.alterTable('products', (table) => {
    table.foreign('supplier_id').references('id').inTable('users').onDelete('CASCADE');
  });
};
