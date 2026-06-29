/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable('cities', (table) => {
    table.increments('id').primary();
    table.integer('state_id').unsigned().notNullable();
    table.string('name', 100).notNullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);

    table.foreign('state_id').references('id').inTable('states').onDelete('CASCADE');
    table.index(['state_id', 'name']);
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('cities');
};
