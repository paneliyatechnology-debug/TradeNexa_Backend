/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  // 1. Drop user_languages table
  await knex.schema.dropTableIfExists('user_languages');

  // 2. Alter users table to add language_id (must match integer type of languages.id)
  await knex.schema.alterTable('users', (table) => {
    table.integer('language_id').unsigned().nullable();
    table.foreign('language_id').references('id').inTable('languages').onDelete('SET NULL');
    table.index('language_id');
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  // 1. Remove language_id from users table
  await knex.schema.alterTable('users', (table) => {
    table.dropForeign('language_id');
    table.dropColumn('language_id');
  });

  // 2. Recreate user_languages table
  await knex.schema.createTable('user_languages', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('user_id').unsigned().notNullable();
    table.integer('language_id').unsigned().notNullable();
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('language_id').references('id').inTable('languages').onDelete('CASCADE');
    table.unique(['user_id', 'language_id']);
  });
};
