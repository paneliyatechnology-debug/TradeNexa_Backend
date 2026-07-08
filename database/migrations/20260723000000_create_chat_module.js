/**
 * Chat module — conversations, messages, and user presence.
 *
 * One RFQ can have multiple conversations (one per seller).
 * Unique constraint on (rfq_id, seller_id).
 */

// ==========================================
// Migration — up
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable('chat_conversations', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('rfq_id').unsigned().notNullable();
    table.bigInteger('buyer_id').unsigned().notNullable();
    table.bigInteger('seller_id').unsigned().notNullable();
    table.bigInteger('initiated_by').unsigned().notNullable();
    table.bigInteger('last_message_id').unsigned().nullable();
    table.timestamp('last_message_at').nullable();
    table.string('last_message_preview', 500).nullable();
    table.integer('buyer_unread_count').unsigned().notNullable().defaultTo(0);
    table.integer('seller_unread_count').unsigned().notNullable().defaultTo(0);
    table.bigInteger('buyer_last_read_message_id').unsigned().nullable();
    table.bigInteger('seller_last_read_message_id').unsigned().nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);

    table.unique(['rfq_id', 'seller_id'], 'uk_chat_rfq_seller');
    table.index(['buyer_id', 'last_message_at'], 'idx_chat_buyer_last_msg');
    table.index(['seller_id', 'last_message_at'], 'idx_chat_seller_last_msg');
    table.index(['rfq_id'], 'idx_chat_rfq');

    table
      .foreign('rfq_id')
      .references('id')
      .inTable('rfqs')
      .onDelete('CASCADE');
    table
      .foreign('buyer_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .foreign('seller_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .foreign('initiated_by')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
  });

  await knex.schema.createTable('chat_messages', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('conversation_id').unsigned().notNullable();
    table.bigInteger('sender_id').unsigned().nullable();
    table
      .enu('message_type', ['TEXT', 'IMAGE', 'DOCUMENT', 'PRODUCT', 'QUOTATION', 'SYSTEM'])
      .notNullable();
    table.text('content').nullable();
    table.json('metadata').nullable();
    table.bigInteger('reply_to_message_id').unsigned().nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();

    table.index(['conversation_id', 'created_at'], 'idx_chat_msg_conv_created');
    table.index(['sender_id'], 'idx_chat_msg_sender');

    table
      .foreign('conversation_id')
      .references('id')
      .inTable('chat_conversations')
      .onDelete('CASCADE');
    table
      .foreign('sender_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .foreign('reply_to_message_id')
      .references('id')
      .inTable('chat_messages')
      .onDelete('SET NULL');
  });

  await knex.schema.alterTable('chat_conversations', (table) => {
    table
      .foreign('last_message_id')
      .references('id')
      .inTable('chat_messages')
      .onDelete('SET NULL');
    table
      .foreign('buyer_last_read_message_id')
      .references('id')
      .inTable('chat_messages')
      .onDelete('SET NULL');
    table
      .foreign('seller_last_read_message_id')
      .references('id')
      .inTable('chat_messages')
      .onDelete('SET NULL');
  });

  await knex.schema.createTable('user_presence', (table) => {
    table.bigInteger('user_id').unsigned().primary();
    table.enu('status', ['online', 'offline']).notNullable().defaultTo('offline');
    table.timestamp('last_seen_at').nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table
      .foreign('user_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
  });
};

// ==========================================
// Migration — down
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('user_presence');
  await knex.schema.dropTableIfExists('chat_messages');
  await knex.schema.dropTableIfExists('chat_conversations');
};
