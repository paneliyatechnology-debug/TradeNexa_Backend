/**
 * Remove is_recommended column from products — recommended products use subcategory_id instead.
 */

// ==========================================
// Migration — up
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('products', (table) => {
    table.dropIndex(['is_recommended']);
    table.dropColumn('is_recommended');
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
    table.boolean('is_recommended').defaultTo(false);
    table.index('is_recommended');
  });
};
