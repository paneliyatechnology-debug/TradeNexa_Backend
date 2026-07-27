/**
 * Add category_id on company_details for profile (main category from categories).
 */

/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('company_details', 'category_id');
  if (hasColumn) return;

  await knex.schema.alterTable('company_details', (table) => {
    table.bigInteger('category_id').unsigned().nullable().after('industry');
    table
      .foreign('category_id')
      .references('id')
      .inTable('categories')
      .onDelete('SET NULL');
    table.index('category_id');
  });
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('company_details', 'category_id');
  if (!hasColumn) return;

  await knex.schema.alterTable('company_details', (table) => {
    table.dropForeign(['category_id']);
    table.dropIndex(['category_id']);
    table.dropColumn('category_id');
  });
};
