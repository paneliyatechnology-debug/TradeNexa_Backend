/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable('countries', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable();
    table.string('code', 10).notNullable().unique();
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    table.index('code');
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('countries');
};
