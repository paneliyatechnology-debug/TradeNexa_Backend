/**
 * Change offers.discount from string to decimal (numeric discount value).
 */

// ==========================================
// Migration — up
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  const rows = await knex('offers').select('id', 'discount');

  for (const row of rows) {
    const match = String(row.discount).match(/[0-9]+(\.[0-9]+)?/);
    const value = match ? parseFloat(match[0]) : 0;
    await knex('offers').where({ id: row.id }).update({ discount: value });
  }

  await knex.schema.alterTable('offers', (table) => {
    table.decimal('discount', 5, 2).notNullable().alter();
  });
};

// ==========================================
// Migration — down
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('offers', (table) => {
    table.string('discount', 100).notNullable().alter();
  });
};
