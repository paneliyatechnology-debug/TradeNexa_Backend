/**
 * Unify chat to one conversation per buyer↔seller pair (IndiaMART-style).
 *
 * Changes:
 * - Unique (buyer_id, seller_id); drop RFQ/inquiry conversation uniques
 * - last_context_type / last_context_id (product | rfq | enquiry)
 * - last_message_sender_id on conversation
 * - is_read / read_at on each message
 * - Merge duplicate threads for the same pair (keep newest, move messages)
 */

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  // ------------------------------------------
  // Schema: conversation context + last sender
  // ------------------------------------------
  const hasLastContextType = await knex.schema.hasColumn('chat_conversations', 'last_context_type');
  if (!hasLastContextType) {
    await knex.schema.alterTable('chat_conversations', (table) => {
      table.string('last_context_type', 20).nullable().after('inquiry_id');
      table.bigInteger('last_context_id').unsigned().nullable().after('last_context_type');
      table.bigInteger('last_message_sender_id').unsigned().nullable().after('last_message_preview');
      table.index(['buyer_id', 'seller_id'], 'idx_chat_buyer_seller');
      table.index(['last_context_type', 'last_context_id'], 'idx_chat_last_context');
    });
  }

  // ------------------------------------------
  // Schema: per-message read receipts
  // ------------------------------------------
  const hasIsRead = await knex.schema.hasColumn('chat_messages', 'is_read');
  if (!hasIsRead) {
    await knex.schema.alterTable('chat_messages', (table) => {
      table.boolean('is_read').notNullable().defaultTo(false).after('reply_to_message_id');
      table.timestamp('read_at').nullable().after('is_read');
      table.index(['conversation_id', 'is_read'], 'idx_chat_msg_conv_read');
    });
  }

  // ------------------------------------------
  // Backfill last_context from legacy columns
  // ------------------------------------------
  await knex.raw(`
    UPDATE chat_conversations
    SET last_context_type = 'rfq', last_context_id = rfq_id
    WHERE rfq_id IS NOT NULL
      AND (last_context_type IS NULL OR last_context_type = '')
  `);

  await knex.raw(`
    UPDATE chat_conversations c
    LEFT JOIN inquiries i ON i.id = c.inquiry_id
    SET
      c.last_context_type = CASE
        WHEN i.product_id IS NOT NULL THEN 'product'
        WHEN c.inquiry_id IS NOT NULL THEN 'enquiry'
        ELSE c.last_context_type
      END,
      c.last_context_id = COALESCE(i.product_id, c.inquiry_id, c.last_context_id)
    WHERE c.inquiry_id IS NOT NULL
      AND (c.last_context_type IS NULL OR c.last_context_type = '')
  `);

  await knex.raw(`
    UPDATE chat_conversations c
    INNER JOIN chat_messages m ON m.id = c.last_message_id
    SET c.last_message_sender_id = m.sender_id
    WHERE c.last_message_id IS NOT NULL
      AND c.last_message_sender_id IS NULL
  `);

  // ------------------------------------------
  // Merge duplicate active conversations per pair
  // ------------------------------------------
  const duplicates = await knex('chat_conversations')
    .select('buyer_id', 'seller_id')
    .count('* as cnt')
    .where('is_active', true)
    .groupBy('buyer_id', 'seller_id')
    .having('cnt', '>', 1);

  for (const dup of duplicates) {
    const rows = await knex('chat_conversations')
      .where({
        buyer_id: dup.buyer_id,
        seller_id: dup.seller_id,
        is_active: true,
      })
      .orderByRaw('COALESCE(last_message_at, created_at) DESC')
      .orderBy('id', 'desc')
      .select('id');

    if (rows.length < 2) continue;

    const keepId = rows[0].id;
    const mergeIds = rows.slice(1).map((r) => r.id);

    // Move all messages into the kept conversation
    await knex('chat_messages').whereIn('conversation_id', mergeIds).update({ conversation_id: keepId });

    await knex('chat_conversations').whereIn('id', mergeIds).update({
      is_active: false,
      updated_at: knex.fn.now(),
    });
  }

  // ------------------------------------------
  // Drop legacy uniqueness (RFQ/inquiry scoped)
  // ------------------------------------------
  const dropUniqueIfExists = async (constraintName) => {
    try {
      await knex.raw(`ALTER TABLE chat_conversations DROP INDEX \`${constraintName}\``);
    } catch (err) {
      if (err.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && err.errno !== 1091) {
        throw err;
      }
    }
  };

  await dropUniqueIfExists('uk_chat_rfq_seller');
  await dropUniqueIfExists('uk_chat_inquiry');
  await dropUniqueIfExists('chat_conversations_rfq_id_seller_id_unique');
  await dropUniqueIfExists('chat_conversations_inquiry_id_unique');

  const stillDup = await knex('chat_conversations')
    .select('buyer_id', 'seller_id')
    .count('* as cnt')
    .where('is_active', true)
    .groupBy('buyer_id', 'seller_id')
    .having('cnt', '>', 1);

  if (stillDup.length) {
    throw new Error(
      `Cannot add unique (buyer_id, seller_id): ${stillDup.length} duplicate active pairs remain`,
    );
  }

  // Hard-delete leftover duplicates (active preferred) so unique index can be added
  const allPairs = await knex('chat_conversations')
    .select('buyer_id', 'seller_id')
    .count('* as cnt')
    .groupBy('buyer_id', 'seller_id')
    .having('cnt', '>', 1);

  for (const pair of allPairs) {
    const rows = await knex('chat_conversations')
      .where({ buyer_id: pair.buyer_id, seller_id: pair.seller_id })
      .orderByRaw('is_active DESC')
      .orderByRaw('COALESCE(last_message_at, created_at) DESC')
      .orderBy('id', 'desc')
      .select('id');

    if (rows.length < 2) continue;
    const keepId = rows[0].id;
    const dropIds = rows.slice(1).map((r) => r.id);
    await knex('chat_messages').whereIn('conversation_id', dropIds).update({ conversation_id: keepId });
    await knex('chat_conversations').whereIn('id', dropIds).del();
  }

  // ------------------------------------------
  // Unique buyer↔seller + FK for last sender
  // ------------------------------------------
  try {
    await knex.schema.alterTable('chat_conversations', (table) => {
      table.unique(['buyer_id', 'seller_id'], 'uk_chat_buyer_seller');
    });
  } catch (err) {
    if (err.code !== 'ER_DUP_KEYNAME' && err.errno !== 1061) throw err;
  }

  try {
    await knex.schema.alterTable('chat_conversations', (table) => {
      table
        .foreign('last_message_sender_id')
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');
    });
  } catch (err) {
    if (err.code !== 'ER_DUP_KEYNAME' && err.errno !== 1061 && err.code !== 'ER_FK_DUP_NAME') {
      // Ignore when constraint already exists
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  try {
    await knex.raw('ALTER TABLE chat_conversations DROP FOREIGN KEY chat_conversations_last_message_sender_id_foreign');
  } catch {
    /* ignore */
  }

  try {
    await knex.raw('ALTER TABLE chat_conversations DROP INDEX `uk_chat_buyer_seller`');
  } catch {
    /* ignore */
  }

  const hasLastContextType = await knex.schema.hasColumn('chat_conversations', 'last_context_type');
  if (hasLastContextType) {
    await knex.schema.alterTable('chat_conversations', (table) => {
      table.dropIndex(['last_context_type', 'last_context_id'], 'idx_chat_last_context');
      table.dropColumn('last_context_type');
      table.dropColumn('last_context_id');
      table.dropColumn('last_message_sender_id');
    });
  }

  const hasIsRead = await knex.schema.hasColumn('chat_messages', 'is_read');
  if (hasIsRead) {
    await knex.schema.alterTable('chat_messages', (table) => {
      table.dropIndex(['conversation_id', 'is_read'], 'idx_chat_msg_conv_read');
      table.dropColumn('is_read');
      table.dropColumn('read_at');
    });
  }

  try {
    await knex.schema.alterTable('chat_conversations', (table) => {
      table.unique(['rfq_id', 'seller_id'], 'uk_chat_rfq_seller');
    });
  } catch {
    /* ignore */
  }
};
