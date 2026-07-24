/**
 * Add audience `role` (buyer | seller) on notifications for dual-role inbox filtering.
 *
 * If an older `role_id` column exists (FK → roles), convert values into `role`
 * then drop `role_id`. Never stores buyer_seller — only marketplace side.
 */

const SELLER_TYPES = [
  'INQUIRY_RECEIVED',
  'QUOTATION_ACCEPTED',
  'QUOTATION_REJECTED',
  'RFQ_RECEIVED',
  'RFQ_QUOTATION_ACCEPTED',
  'RFQ_QUOTATION_REJECTED',
];

const BUYER_TYPES = [
  'INQUIRY_REPLY',
  'INQUIRY_REJECTED',
  'QUOTATION_RECEIVED',
  'QUOTATION_UPDATED',
  'RFQ_NEW_QUOTATION',
  'RFQ_QUOTATION_UPDATED',
];

const dropIndexIfExists = async (knex, tableName, indexName) => {
  try {
    await knex.raw(`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``);
  } catch {
    /* index may not exist */
  }
};

const dropForeignIfExists = async (knex, tableName, column) => {
  try {
    await knex.schema.alterTable(tableName, (table) => {
      table.dropForeign([column]);
    });
  } catch {
    /* FK may not exist or already dropped */
  }
};

/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasRoleId = await knex.schema.hasColumn('notifications', 'role_id');
  const hasRole = await knex.schema.hasColumn('notifications', 'role');

  if (!hasRole) {
    await knex.schema.alterTable('notifications', (table) => {
      table.string('role', 16).nullable().after('type');
      table.index(['user_id', 'role', 'created_at'], 'idx_notifications_user_role_created');
      table.index(['user_id', 'role', 'is_read'], 'idx_notifications_user_role_read');
    });
  }

  // Prefer codes from legacy role_id when present
  if (hasRoleId) {
    await knex.raw(`
      UPDATE notifications n
      INNER JOIN roles r ON r.id = n.role_id
      SET n.role = r.code
      WHERE n.role IS NULL
        AND r.code IN ('buyer', 'seller')
    `);
  }

  await knex('notifications').whereIn('type', BUYER_TYPES).whereNull('role').update({ role: 'buyer' });
  await knex('notifications').whereIn('type', SELLER_TYPES).whereNull('role').update({ role: 'seller' });
  await knex('notifications')
    .where({ type: 'RFQ_STATUS_UPDATED' })
    .whereNull('role')
    .update({ role: 'seller' });

  if (hasRoleId) {
    await dropForeignIfExists(knex, 'notifications', 'role_id');
    await dropIndexIfExists(knex, 'notifications', 'idx_notifications_user_role_id_created');
    await dropIndexIfExists(knex, 'notifications', 'idx_notifications_user_role_id_read');
    await knex.schema.alterTable('notifications', (table) => {
      table.dropColumn('role_id');
    });
  }
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  const hasRole = await knex.schema.hasColumn('notifications', 'role');
  if (!hasRole) return;

  await dropIndexIfExists(knex, 'notifications', 'idx_notifications_user_role_created');
  await dropIndexIfExists(knex, 'notifications', 'idx_notifications_user_role_read');
  await knex.schema.alterTable('notifications', (table) => {
    table.dropColumn('role');
  });
};
