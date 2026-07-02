/**
 * Add category parent_id and rename products.category_id to subcategory_id.
 */

// ==========================================
// Migration — up
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('categories', (table) => {
    table.bigInteger('parent_id').unsigned().nullable().after('id');
    table.foreign('parent_id').references('id').inTable('categories').onDelete('CASCADE');
    table.index('parent_id');
  });

  await knex.schema.alterTable('categories', (table) => {
    table.dropUnique(['name']);
  });

  await knex.schema.alterTable('products', (table) => {
    table.dropForeign(['category_id']);
  });

  await knex.schema.alterTable('products', (table) => {
    table.renameColumn('category_id', 'subcategory_id');
  });

  await knex.schema.alterTable('products', (table) => {
    table
      .foreign('subcategory_id')
      .references('id')
      .inTable('categories')
      .onDelete('RESTRICT');
  });
};

// ==========================================
// Migration — down
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('products', (table) => {
    table.dropForeign(['subcategory_id']);
  });

  await knex.schema.alterTable('products', (table) => {
    table.renameColumn('subcategory_id', 'category_id');
  });

  await knex.schema.alterTable('products', (table) => {
    table.foreign('category_id').references('id').inTable('categories').onDelete('RESTRICT');
  });

  await knex.schema.alterTable('categories', (table) => {
    table.unique(['name']);
    table.dropForeign(['parent_id']);
    table.dropColumn('parent_id');
  });
};
