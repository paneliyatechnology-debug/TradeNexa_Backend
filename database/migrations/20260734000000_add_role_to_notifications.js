/**
 * Add audience `role_id` (FK → roles) to notifications so dual-role users
 * can filter their in-app inbox by buyer/seller role id.
 *
 * Also migrates away from the older string `role` column if present.
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

/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasRoleId = await knex.schema.hasColumn('notifications', 'role_id');
  const hasRole = await knex.schema.hasColumn('notifications', 'role');

  if (!hasRoleId) {
    await knex.schema.alterTable('notifications', (table) => {
      table.integer('role_id').unsigned().nullable().after('type');
      table.foreign('role_id').references('id').inTable('roles').onDelete('SET NULL');
      table.index(['user_id', 'role_id', 'created_at'], 'idx_notifications_user_role_id_created');
      table.index(['user_id', 'role_id', 'is_read'], 'idx_notifications_user_role_id_read');
    });
  }

  const buyer = await knex('roles').where({ code: 'buyer' }).first();
  const seller = await knex('roles').where({ code: 'seller' }).first();

  if (buyer?.id) {
    await knex('notifications')
      .whereIn('type', BUYER_TYPES)
      .whereNull('role_id')
      .update({ role_id: buyer.id });
  }
  if (seller?.id) {
    await knex('notifications')
      .whereIn('type', SELLER_TYPES)
      .whereNull('role_id')
      .update({ role_id: seller.id });
    await knex('notifications')
      .where({ type: 'RFQ_STATUS_UPDATED' })
      .whereNull('role_id')
      .update({ role_id: seller.id });
  }

  if (hasRole) {
    if (buyer?.id) {
      await knex('notifications').where({ role: 'buyer' }).whereNull('role_id').update({ role_id: buyer.id });
    }
    if (seller?.id) {
      await knex('notifications').where({ role: 'seller' }).whereNull('role_id').update({ role_id: seller.id });
    }

    await dropIndexIfExists(knex, 'notifications', 'idx_notifications_user_role_created');
    await dropIndexIfExists(knex, 'notifications', 'idx_notifications_user_role_read');
    await knex.schema.alterTable('notifications', (table) => {
      table.dropColumn('role');
    });
  }
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  const hasRoleId = await knex.schema.hasColumn('notifications', 'role_id');
  if (!hasRoleId) return;

  await knex.schema.alterTable('notifications', (table) => {
    table.dropForeign(['role_id']);
    table.dropIndex(['user_id', 'role_id', 'created_at'], 'idx_notifications_user_role_id_created');
    table.dropIndex(['user_id', 'role_id', 'is_read'], 'idx_notifications_user_role_id_read');
    table.dropColumn('role_id');
  });
};
