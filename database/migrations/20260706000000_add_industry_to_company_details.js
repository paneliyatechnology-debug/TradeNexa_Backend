/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('company_details', (table) => {
    table.string('industry', 200).nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('company_details', (table) => {
    table.dropColumn('industry');
  });
};
