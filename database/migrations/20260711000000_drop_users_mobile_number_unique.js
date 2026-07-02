/**
 * Drop unique constraint on users.mobile_number.
 */

/**
 * Allow duplicate mobile_number values (e.g. multiple admin panel users).
 *
 * @param { import("knex").Knex } knex
 */
// ==========================================
// Migration — up
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('users', (table) => {
    table.dropUnique(['mobile_number']);
  });
};

// ==========================================
// Migration — down
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('users', (table) => {
    table.unique(['mobile_number']);
  });
};
