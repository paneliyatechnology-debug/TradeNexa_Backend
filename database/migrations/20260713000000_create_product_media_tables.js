/**
 * Create product_images and product_videos tables for product gallery and videos.
 * Does not modify or delete existing product data.
 */

// ==========================================
// Migration — up
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable('product_images', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('product_id').unsigned().notNullable();
    table.string('path', 500).notNullable();
    table.boolean('is_primary').defaultTo(false);
    table.integer('sort_order').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('product_id').references('id').inTable('products').onDelete('CASCADE');
    table.index('product_id');
  });

  await knex.schema.createTable('product_videos', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('product_id').unsigned().notNullable();
    table.string('title', 200).nullable();
    table.string('path', 500).notNullable();
    table.integer('sort_order').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('product_id').references('id').inTable('products').onDelete('CASCADE');
    table.index('product_id');
  });
};

// ==========================================
// Migration — down
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('product_videos');
  await knex.schema.dropTableIfExists('product_images');
};
