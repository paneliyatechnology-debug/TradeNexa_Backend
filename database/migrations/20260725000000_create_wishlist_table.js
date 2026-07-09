/**
 * Create wishlist table — one row per user/product pair.
 */

/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('wishlist', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('user_id').unsigned().notNullable();
    table.bigInteger('product_id').unsigned().notNullable();
    table.timestamps(true, true);

    table.unique(['user_id', 'product_id'], 'wishlist_user_id_product_id_unique');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('product_id').references('id').inTable('products').onDelete('CASCADE');
    table.index('user_id');
    table.index('product_id');
    table.index('created_at');
  });
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('wishlist');
};
