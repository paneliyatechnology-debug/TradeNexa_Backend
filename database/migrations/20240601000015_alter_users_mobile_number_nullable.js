/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('users', (table) => {
    table.string('mobile_number', 15).nullable().alter();
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('users', (table) => {
    table.string('mobile_number', 15).notNullable().alter();
  });
};
