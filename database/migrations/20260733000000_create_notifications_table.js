/**
 * In-app notification inbox (RFQ + inquiry related).
 * Chat pushes are not stored here — only types in IN_APP_NOTIFICATION_TYPES.
 */

/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('notifications');
  if (exists) return;

  await knex.schema.createTable('notifications', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('user_id').unsigned().notNullable();
    table.string('type', 64).notNullable();
    table.string('title', 200).notNullable();
    table.string('body', 500).notNullable();
    table.bigInteger('reference_id').unsigned().nullable();
    table.bigInteger('sender_id').unsigned().nullable();
    table.string('click_action', 64).nullable();
    table.json('data').nullable();
    table.boolean('is_read').notNullable().defaultTo(false);
    table.timestamp('read_at').nullable();
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('sender_id').references('id').inTable('users').onDelete('SET NULL');

    table.index(['user_id', 'created_at'], 'idx_notifications_user_created');
    table.index(['user_id', 'is_read'], 'idx_notifications_user_read');
    table.index(['user_id', 'type'], 'idx_notifications_user_type');
  });
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('notifications');
};
