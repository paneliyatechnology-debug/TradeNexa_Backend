/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable('roles', (table) => {
    table.increments('id').primary();
    table.string('code', 50).notNullable().unique();
    table.string('name', 100).notNullable();
    table.text('description').nullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    table.index('code');
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('roles');
};
