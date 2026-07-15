/**
 * Product search history — keywords from GET /products?search=… only.
 * One row per (user_id, keyword); max 20 rows enforced in application code.
 */

/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('product_search_history', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('user_id').unsigned().notNullable();
    table.string('keyword', 255).notNullable();
    table.timestamp('searched_at').notNullable().defaultTo(knex.fn.now());
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.unique(['user_id', 'keyword'], 'uk_product_search_history_user_keyword');
    table.index(['user_id'], 'idx_product_search_history_user');
    table.index(['keyword'], 'idx_product_search_history_keyword');
    table.index(['user_id', 'searched_at'], 'idx_product_search_history_user_searched');
  });
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('product_search_history');
};
