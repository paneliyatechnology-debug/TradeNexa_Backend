/**
 * Product approval workflow — moderation status before public visibility.
 *
 * Adds approval_status + denormalized review fields on products,
 * and append-only product_review_history.
 */
exports.up = async function (knex) {
  const hasApproval = await knex.schema.hasColumn('products', 'approval_status');
  if (!hasApproval) {
    await knex.schema.alterTable('products', (table) => {
      table
        .enum('approval_status', ['in_review', 'revision_required', 'approved', 'rejected'])
        .notNullable()
        .defaultTo('in_review')
        .after('is_active');
      table.integer('review_version').unsigned().notNullable().defaultTo(1).after('approval_status');
      table.timestamp('submitted_at').nullable().after('review_version');
      table.timestamp('resubmitted_at').nullable().after('submitted_at');
      table.timestamp('reviewed_at').nullable().after('resubmitted_at');
      table.bigInteger('reviewed_by').unsigned().nullable().after('reviewed_at');
      table.text('latest_review_remarks').nullable().after('reviewed_by');

      table.index(['approval_status', 'submitted_at'], 'idx_products_approval_queue');
      table.index(['seller_id', 'approval_status'], 'idx_products_seller_approval');
      table.foreign('reviewed_by').references('id').inTable('users').onDelete('SET NULL');
    });
  }

  // Existing catalog products were already public — keep them live.
  await knex('products')
    .whereNull('deleted_at')
    .update({
      approval_status: 'approved',
      submitted_at: knex.raw('COALESCE(submitted_at, created_at, CURRENT_TIMESTAMP)'),
      reviewed_at: knex.raw('COALESCE(reviewed_at, updated_at, created_at, CURRENT_TIMESTAMP)'),
    });

  const hasHistory = await knex.schema.hasTable('product_review_history');
  if (!hasHistory) {
    await knex.schema.createTable('product_review_history', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('product_id').unsigned().notNullable();
      table.integer('review_version').unsigned().notNullable();
      table
        .enum('action', ['submitted', 'resubmitted', 'approved', 'revision_required', 'rejected'])
        .notNullable();
      table.string('from_status', 30).nullable();
      table.string('to_status', 30).notNullable();
      table.text('remarks').nullable();
      table.bigInteger('actor_id').unsigned().nullable();
      table.string('actor_role', 30).nullable();
      table.json('metadata').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

      table.foreign('product_id').references('id').inTable('products').onDelete('CASCADE');
      table.foreign('actor_id').references('id').inTable('users').onDelete('SET NULL');
      table.index(['product_id', 'id'], 'idx_prh_product');
      table.index(['action', 'created_at'], 'idx_prh_action');
    });
  }

  // Synthetic history for backfilled approved products (idempotent-ish: only if empty).
  const existingHistory = await knex('product_review_history').count('* as c').first();
  if (parseInt(existingHistory?.c || 0, 10) === 0) {
    const products = await knex('products')
      .whereNull('deleted_at')
      .where('approval_status', 'approved')
      .select('id', 'review_version', 'created_by', 'seller_id');

    if (products.length) {
      const rows = products.map((p) => ({
        product_id: p.id,
        review_version: p.review_version || 1,
        action: 'approved',
        from_status: null,
        to_status: 'approved',
        remarks: 'Backfilled as approved during approval workflow rollout',
        actor_id: null,
        actor_role: 'system',
        metadata: JSON.stringify({ source: 'migration_backfill' }),
      }));
      // Chunk inserts for large catalogs
      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        await knex('product_review_history').insert(rows.slice(i, i + chunkSize));
      }
    }
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('product_review_history');

  const hasApproval = await knex.schema.hasColumn('products', 'approval_status');
  if (hasApproval) {
    await knex.schema.alterTable('products', (table) => {
      table.dropForeign(['reviewed_by']);
      table.dropIndex(['approval_status', 'submitted_at'], 'idx_products_approval_queue');
      table.dropIndex(['seller_id', 'approval_status'], 'idx_products_seller_approval');
      table.dropColumn('latest_review_remarks');
      table.dropColumn('reviewed_by');
      table.dropColumn('reviewed_at');
      table.dropColumn('resubmitted_at');
      table.dropColumn('submitted_at');
      table.dropColumn('review_version');
      table.dropColumn('approval_status');
    });
  }
};
