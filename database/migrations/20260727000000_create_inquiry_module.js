/**
 * Inquiry module — product-scoped buyer→seller inquiries, quotes, and chat linkage.
 *
 * Creates `inquiries` + `inquiry_quotations`.
 * Makes `chat_conversations.rfq_id` nullable and adds `inquiry_id`
 * (later superseded by unique buyer↔seller pair in unify_chat migration).
 */

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  // ------------------------------------------
  // inquiries
  // ------------------------------------------
  await knex.schema.createTable('inquiries', (table) => {
    table.bigIncrements('id').primary();
    table.string('inquiry_number', 30).notNullable().unique();
    table.bigInteger('product_id').unsigned().notNullable();
    table.bigInteger('buyer_id').unsigned().notNullable();
    table.bigInteger('seller_id').unsigned().notNullable();
    table.integer('quantity').unsigned().notNullable();
    table.string('unit', 50).nullable();
    table.text('message').notNullable();
    table.decimal('expected_price', 15, 2).nullable();
    table.string('currency', 10).notNullable().defaultTo('INR');
    table.timestamp('required_before').nullable();
    // pending | quoted | rejected | accepted | cancelled | closed
    table.string('status', 30).notNullable().defaultTo('pending');
    table.text('reject_reason').nullable();
    table.timestamp('viewed_at').nullable();
    table.timestamp('responded_at').nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.bigInteger('created_by').unsigned().nullable();
    table.bigInteger('updated_by').unsigned().nullable();
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();

    table.index(['buyer_id', 'status'], 'idx_inquiries_buyer_status');
    table.index(['seller_id', 'status'], 'idx_inquiries_seller_status');
    table.index(['product_id'], 'idx_inquiries_product');
    table.index(['status'], 'idx_inquiries_status');

    table.foreign('product_id').references('id').inTable('products').onDelete('CASCADE');
    table.foreign('buyer_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('seller_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('updated_by').references('id').inTable('users').onDelete('SET NULL');
  });

  // ------------------------------------------
  // inquiry_quotations (one row per inquiry)
  // ------------------------------------------
  await knex.schema.createTable('inquiry_quotations', (table) => {
    table.bigIncrements('id').primary();
    table.string('quotation_number', 30).notNullable().unique();
    table.bigInteger('inquiry_id').unsigned().notNullable();
    table.bigInteger('seller_id').unsigned().notNullable();
    table.decimal('price', 15, 2).notNullable();
    table.integer('quantity').nullable();
    table.string('unit', 50).nullable();
    table.decimal('gst_percentage', 5, 2).defaultTo(0);
    table.decimal('gst_amount', 15, 2).defaultTo(0);
    table.decimal('transportation_charge', 15, 2).defaultTo(0);
    table.decimal('total_amount', 15, 2).notNullable();
    table.integer('delivery_days').nullable();
    table.string('payment_terms', 200).nullable();
    table.integer('validity_days').nullable();
    table.text('remarks').nullable();
    table.string('attachment', 500).nullable();
    table.string('status', 30).notNullable().defaultTo('SUBMITTED');
    table.timestamps(true, true);

    table.unique(['inquiry_id'], 'uk_inquiry_quotation_inquiry');
    table.index(['seller_id'], 'idx_inquiry_quotations_seller');
    table.index(['status'], 'idx_inquiry_quotations_status');

    table.foreign('inquiry_id').references('id').inTable('inquiries').onDelete('CASCADE');
    table.foreign('seller_id').references('id').inTable('users').onDelete('CASCADE');
  });

  // ------------------------------------------
  // Chat: allow inquiry-linked threads (legacy unique on inquiry_id)
  // ------------------------------------------
  await knex.schema.alterTable('chat_conversations', (table) => {
    table.bigInteger('inquiry_id').unsigned().nullable().after('rfq_id');
  });

  // RFQ chat may still set rfq_id; inquiry/product threads leave it null
  await knex.raw('ALTER TABLE chat_conversations MODIFY rfq_id BIGINT UNSIGNED NULL');

  await knex.schema.alterTable('chat_conversations', (table) => {
    table
      .foreign('inquiry_id')
      .references('id')
      .inTable('inquiries')
      .onDelete('CASCADE');
    table.unique(['inquiry_id'], 'uk_chat_inquiry');
    table.index(['inquiry_id'], 'idx_chat_inquiry');
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('chat_conversations', (table) => {
    table.dropForeign(['inquiry_id']);
    table.dropUnique(['inquiry_id'], 'uk_chat_inquiry');
    table.dropIndex(['inquiry_id'], 'idx_chat_inquiry');
    table.dropColumn('inquiry_id');
  });

  // Restore NOT NULL only when every conversation still has rfq_id
  await knex.raw('ALTER TABLE chat_conversations MODIFY rfq_id BIGINT UNSIGNED NOT NULL');

  await knex.schema.dropTableIfExists('inquiry_quotations');
  await knex.schema.dropTableIfExists('inquiries');
};
