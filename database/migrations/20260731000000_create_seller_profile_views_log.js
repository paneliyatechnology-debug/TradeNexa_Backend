/**
 * Event log for seller profile views — enables daily growth charts.
 * company_details.profile_views_count remains the fast lifetime total.
 */

exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('seller_profile_views');
  if (exists) return;

  await knex.schema.createTable('seller_profile_views', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('seller_id').unsigned().notNullable();
    table.bigInteger('viewer_user_id').unsigned().nullable();
    table.timestamp('viewed_at').notNullable().defaultTo(knex.fn.now());

    table.foreign('seller_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('viewer_user_id').references('id').inTable('users').onDelete('SET NULL');
    table.index(['seller_id', 'viewed_at'], 'idx_seller_profile_views_seller_date');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('seller_profile_views');
};
