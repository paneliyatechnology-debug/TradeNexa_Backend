/**
 * Create supported languages table.
 */

// ==========================================
// Migration — up
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable('languages', (table) => {
    table.increments('id').primary();
    table.string('code', 10).notNullable().unique();
    table.string('name', 50).notNullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    table.index('code');
  });
};

// ==========================================
// Migration — down
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('languages');
};
