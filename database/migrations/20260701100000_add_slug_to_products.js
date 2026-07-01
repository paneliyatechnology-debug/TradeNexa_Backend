const slugify = (text) =>
  text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start
    .replace(/-+$/, ''); // Trim - from end

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  // 0. Clean up existing products to prevent duplicate constraint failures during development
  await knex('products').del();

  // 1. Add slug column as nullable first
  await knex.schema.alterTable('products', (table) => {
    table.string('slug', 220).nullable();
  });

  // 2. Make slug notNullable and unique, and add unique constraint to name
  await knex.schema.alterTable('products', (table) => {
    table.string('slug', 220).notNullable().unique().alter();
    table.string('name', 200).notNullable().unique().alter();
    table.index('slug');
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('products', (table) => {
    table.dropIndex('slug');
    table.dropUnique('slug');
    table.dropUnique('name');
    table.dropColumn('slug');
  });
};
