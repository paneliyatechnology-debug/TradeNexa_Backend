/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable('states', (table) => {
    table.increments('id').primary();
    table.integer('country_id').unsigned().notNullable();
    table.string('name', 100).notNullable();
    table.string('code', 10).nullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);

    table.foreign('country_id').references('id').inTable('countries').onDelete('CASCADE');
    table.index(['country_id', 'name']);
    table.index('code');
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('states');
};
