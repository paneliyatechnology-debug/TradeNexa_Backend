/**
 * Expand RFQ module — units, extended rfqs columns, quotations, attachments, audit.
 */

// ==========================================
// Migration — up
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable('units', (table) => {
    table.increments('id').primary();
    table.string('name', 50).notNullable();
    table.string('code', 20).notNullable().unique();
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
  });

  await knex('units').insert([
    { name: 'Piece', code: 'PCS' },
    { name: 'Kilogram', code: 'KG' },
    { name: 'Ton', code: 'TON' },
    { name: 'Litre', code: 'LTR' },
    { name: 'Meter', code: 'MTR' },
    { name: 'Box', code: 'BOX' },
    { name: 'Set', code: 'SET' },
  ]);

  await knex.schema.alterTable('rfqs', (table) => {
    table.string('rfq_number', 30).nullable().unique();
    table.bigInteger('buyer_id').unsigned().nullable();
    table.bigInteger('subcategory_id').unsigned().nullable();
    table.bigInteger('product_id').unsigned().nullable();
    table.integer('unit_id').unsigned().nullable();
    table.decimal('expected_price', 15, 2).nullable();
    table.string('currency', 10).defaultTo('INR');
    table.integer('delivery_country_id').unsigned().nullable();
    table.integer('delivery_state_id').unsigned().nullable();
    table.integer('delivery_city_id').unsigned().nullable();
    table.string('delivery_pincode', 20).nullable();
    table.text('delivery_address').nullable();
    table.timestamp('required_before').nullable();
    table.timestamp('quotation_deadline').nullable();
    table.string('payment_terms', 200).nullable();
    table.string('supplier_type', 50).nullable();
    table.enum('visibility', ['PUBLIC', 'PRIVATE']).defaultTo('PUBLIC');
    table.string('status', 30).defaultTo('DRAFT');
    table.integer('total_views').defaultTo(0);
    table.integer('total_quotations').defaultTo(0);
    table.bigInteger('awarded_supplier_id').unsigned().nullable();

    table.foreign('buyer_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('subcategory_id').references('id').inTable('categories').onDelete('SET NULL');
    table.foreign('product_id').references('id').inTable('products').onDelete('SET NULL');
    table.foreign('unit_id').references('id').inTable('units').onDelete('SET NULL');
    table.foreign('delivery_country_id').references('id').inTable('countries').onDelete('SET NULL');
    table.foreign('delivery_state_id').references('id').inTable('states').onDelete('SET NULL');
    table.foreign('delivery_city_id').references('id').inTable('cities').onDelete('SET NULL');
    table.foreign('awarded_supplier_id').references('id').inTable('users').onDelete('SET NULL');

    table.index('rfq_number');
    table.index('status');
    table.index('visibility');
    table.index('quotation_deadline');
    table.index('buyer_id');
  });

  await knex.raw('UPDATE rfqs SET buyer_id = user_id WHERE buyer_id IS NULL');
  await knex.raw('UPDATE rfqs SET expected_price = budget WHERE expected_price IS NULL AND budget IS NOT NULL');
  await knex.raw('UPDATE rfqs SET delivery_city_id = city_id WHERE delivery_city_id IS NULL AND city_id IS NOT NULL');
  await knex.raw(
    "UPDATE rfqs SET status = 'PUBLISHED' WHERE status = 'DRAFT' AND is_active = 1 AND deleted_at IS NULL",
  );

  const existing = await knex('rfqs').whereNull('rfq_number').select('id');
  for (const row of existing) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    await knex('rfqs')
      .where({ id: row.id })
      .update({ rfq_number: `RFQ-${date}-${String(row.id).padStart(6, '0')}` });
  }

  await knex.schema.alterTable('rfqs', (table) => {
    table.string('rfq_number', 30).notNullable().alter();
  });

  await knex.schema.createTable('rfq_attachments', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('rfq_id').unsigned().notNullable();
    table.string('file_name', 255).notNullable();
    table.string('file_path', 500).notNullable();
    table.string('file_type', 100).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('rfq_id').references('id').inTable('rfqs').onDelete('CASCADE');
    table.index('rfq_id');
  });

  await knex.schema.createTable('rfq_suppliers', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('rfq_id').unsigned().notNullable();
    table.bigInteger('supplier_id').unsigned().notNullable();
    table.timestamp('viewed_at').nullable();
    table.timestamp('responded_at').nullable();
    table.string('status', 30).defaultTo('INVITED');
    table.timestamps(true, true);

    table.foreign('rfq_id').references('id').inTable('rfqs').onDelete('CASCADE');
    table.foreign('supplier_id').references('id').inTable('users').onDelete('CASCADE');
    table.unique(['rfq_id', 'supplier_id']);
    table.index(['rfq_id', 'supplier_id']);
  });

  await knex.schema.createTable('quotations', (table) => {
    table.bigIncrements('id').primary();
    table.string('quotation_number', 30).notNullable().unique();
    table.bigInteger('rfq_id').unsigned().notNullable();
    table.bigInteger('supplier_id').unsigned().notNullable();
    table.decimal('price', 15, 2).notNullable();
    table.integer('quantity').nullable();
    table.integer('unit_id').unsigned().nullable();
    table.decimal('gst_percentage', 5, 2).defaultTo(0);
    table.decimal('gst_amount', 15, 2).defaultTo(0);
    table.decimal('transportation_charge', 15, 2).defaultTo(0);
    table.decimal('total_amount', 15, 2).notNullable();
    table.integer('delivery_days').nullable();
    table.string('payment_terms', 200).nullable();
    table.integer('validity_days').nullable();
    table.text('remarks').nullable();
    table.string('attachment', 500).nullable();
    table.string('status', 30).defaultTo('SUBMITTED');
    table.timestamps(true, true);

    table.foreign('rfq_id').references('id').inTable('rfqs').onDelete('CASCADE');
    table.foreign('supplier_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('unit_id').references('id').inTable('units').onDelete('SET NULL');
    table.unique(['rfq_id', 'supplier_id']);
    table.index('status');
    table.index('rfq_id');
    table.index('supplier_id');
  });

  await knex.schema.createTable('quotation_history', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('quotation_id').unsigned().notNullable();
    table.decimal('old_price', 15, 2).nullable();
    table.decimal('new_price', 15, 2).nullable();
    table.text('remarks').nullable();
    table.bigInteger('updated_by').unsigned().nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('quotation_id').references('id').inTable('quotations').onDelete('CASCADE');
    table.foreign('updated_by').references('id').inTable('users').onDelete('SET NULL');
    table.index('quotation_id');
  });

  await knex.schema.createTable('rfq_audit_logs', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('rfq_id').unsigned().nullable();
    table.bigInteger('quotation_id').unsigned().nullable();
    table.string('action', 60).notNullable();
    table.bigInteger('actor_id').unsigned().nullable();
    table.json('metadata').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('rfq_id').references('id').inTable('rfqs').onDelete('SET NULL');
    table.foreign('quotation_id').references('id').inTable('quotations').onDelete('SET NULL');
    table.foreign('actor_id').references('id').inTable('users').onDelete('SET NULL');
    table.index('rfq_id');
    table.index('quotation_id');
    table.index('action');
  });
};

// ==========================================
// Migration — down
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('rfq_audit_logs');
  await knex.schema.dropTableIfExists('quotation_history');
  await knex.schema.dropTableIfExists('quotations');
  await knex.schema.dropTableIfExists('rfq_suppliers');
  await knex.schema.dropTableIfExists('rfq_attachments');

  await knex.schema.alterTable('rfqs', (table) => {
    table.dropForeign('buyer_id');
    table.dropForeign('subcategory_id');
    table.dropForeign('product_id');
    table.dropForeign('unit_id');
    table.dropForeign('delivery_country_id');
    table.dropForeign('delivery_state_id');
    table.dropForeign('delivery_city_id');
    table.dropForeign('awarded_supplier_id');
    table.dropColumn('rfq_number');
    table.dropColumn('buyer_id');
    table.dropColumn('subcategory_id');
    table.dropColumn('product_id');
    table.dropColumn('unit_id');
    table.dropColumn('expected_price');
    table.dropColumn('currency');
    table.dropColumn('delivery_country_id');
    table.dropColumn('delivery_state_id');
    table.dropColumn('delivery_city_id');
    table.dropColumn('delivery_pincode');
    table.dropColumn('delivery_address');
    table.dropColumn('required_before');
    table.dropColumn('quotation_deadline');
    table.dropColumn('payment_terms');
    table.dropColumn('supplier_type');
    table.dropColumn('visibility');
    table.dropColumn('status');
    table.dropColumn('total_views');
    table.dropColumn('total_quotations');
    table.dropColumn('awarded_supplier_id');
  });

  await knex.schema.dropTableIfExists('units');
};
