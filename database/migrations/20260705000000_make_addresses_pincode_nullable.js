/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('addresses', (table) => {
    table.string('pincode', 10).nullable().alter();
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('addresses', (table) => {
    table.string('pincode', 10).notNullable().alter();
  });
};
