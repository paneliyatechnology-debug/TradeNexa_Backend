/**
 * Add seller profile view counter on company_details.
 * Incremented when a non-owner opens GET /sellers/:id.
 */

exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('company_details', 'profile_views_count');
  if (!hasColumn) {
    await knex.schema.alterTable('company_details', (table) => {
      table.integer('profile_views_count').unsigned().notNullable().defaultTo(0);
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('company_details', 'profile_views_count');
  if (hasColumn) {
    await knex.schema.alterTable('company_details', (table) => {
      table.dropColumn('profile_views_count');
    });
  }
};
