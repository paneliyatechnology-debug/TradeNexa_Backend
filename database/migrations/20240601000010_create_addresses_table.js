/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable('addresses', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('user_id').unsigned().notNullable();
    table.string('address_line_1', 255).notNullable();
    table.string('address_line_2', 255).nullable();
    table.integer('city_id').unsigned().nullable();
    table.integer('state_id').unsigned().nullable();
    table.integer('country_id').unsigned().nullable();
    table.string('pincode', 10).notNullable();
    table.boolean('is_primary').defaultTo(true);
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('city_id').references('id').inTable('cities').onDelete('SET NULL');
    table.foreign('state_id').references('id').inTable('states').onDelete('SET NULL');
    table.foreign('country_id').references('id').inTable('countries').onDelete('SET NULL');
    table.index('user_id');
    table.index('pincode');
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('addresses');
};
