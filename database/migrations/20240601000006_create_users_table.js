/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable('users', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable().unique();
    table.string('mobile_number', 15).notNullable().unique();
    table.string('email', 255).nullable().unique();
    table.string('full_name', 100).notNullable();
    table.integer('role_id').unsigned().nullable();
    table.boolean('is_verified').defaultTo(false);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('last_login').nullable();
    table.bigInteger('created_by').unsigned().nullable();
    table.bigInteger('updated_by').unsigned().nullable();
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();

    table.foreign('role_id').references('id').inTable('roles').onDelete('SET NULL');
    table.index('mobile_number');
    table.index('email');
    table.index('uuid');
    table.index('deleted_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('users');
};
