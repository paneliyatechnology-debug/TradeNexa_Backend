/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  // 1. Create business_types reference table
  await knex.schema.createTable('business_types', (table) => {
    table.bigIncrements('id').primary();
    table.string('name', 100).notNullable().unique();
    table.string('code', 50).notNullable().unique();
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    table.index('code');
  });

  // Seed business_types immediately to satisfy existing company_details references
  await knex('business_types').insert([
    { id: 1, name: 'Manufacturer', code: 'manufacturer', is_active: true },
    { id: 2, name: 'Wholesaler', code: 'wholesaler', is_active: true },
    { id: 3, name: 'Retailer', code: 'retailer', is_active: true },
    { id: 4, name: 'Distributor', code: 'distributor', is_active: true },
    { id: 5, name: 'Service Provider', code: 'service_provider', is_active: true }
  ]);

  // 2. Create business_categories reference table
  await knex.schema.createTable('business_categories', (table) => {
    table.bigIncrements('id').primary();
    table.string('name', 100).notNullable().unique();
    table.string('code', 50).notNullable().unique();
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    table.index('code');
  });

  // Seed business_categories immediately to satisfy existing company_details references
  await knex('business_categories').insert([
    { id: 1, name: 'Electronics & Electrical', code: 'electronics_electrical', is_active: true },
    { id: 2, name: 'Apparel & Fashion', code: 'apparel_fashion', is_active: true },
    { id: 3, name: 'Industrial Machinery & Equipment', code: 'machinery_equipment', is_active: true },
    { id: 4, name: 'Chemicals, Dyes & Solvents', code: 'chemicals_dyes_solvents', is_active: true },
    { id: 5, name: 'Food & Beverage', code: 'food_beverage', is_active: true },
    { id: 6, name: 'Building & Construction', code: 'building_construction', is_active: true }
  ]);

  // 3. Alter company_details to add FKs and supplier columns
  await knex.schema.alterTable('company_details', (table) => {
    table.decimal('rating', 3, 2).defaultTo(0.00);
    table.decimal('response_rate', 5, 2).defaultTo(0.00);
    table.integer('years_in_business').defaultTo(0);
    table.foreign('business_type_id').references('id').inTable('business_types').onDelete('SET NULL');
    table.foreign('business_category_id').references('id').inTable('business_categories').onDelete('SET NULL');

    table.index('rating');
  });

  // 4. Alter addresses to add coordinate fields for nearby calculation
  await knex.schema.alterTable('addresses', (table) => {
    table.decimal('latitude', 10, 8).nullable();
    table.decimal('longitude', 11, 8).nullable();

    table.index('latitude');
    table.index('longitude');
  });

  // 5. Create categories table
  await knex.schema.createTable('categories', (table) => {
    table.bigIncrements('id').primary();
    table.string('name', 100).notNullable().unique();
    table.string('icon', 500).nullable();
    table.string('image', 500).nullable();
    table.string('slug', 120).notNullable().unique();
    table.boolean('is_active').defaultTo(true);
    table.bigInteger('created_by').unsigned().nullable();
    table.bigInteger('updated_by').unsigned().nullable();
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();

    table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('updated_by').references('id').inTable('users').onDelete('SET NULL');
    table.index('slug');
    table.index('is_active');
    table.index('deleted_at');
  });

  // 6. Create brands table
  await knex.schema.createTable('brands', (table) => {
    table.bigIncrements('id').primary();
    table.string('name', 100).notNullable().unique();
    table.string('logo', 500).nullable();
    table.boolean('is_popular').defaultTo(false);
    table.boolean('is_active').defaultTo(true);
    table.bigInteger('created_by').unsigned().nullable();
    table.bigInteger('updated_by').unsigned().nullable();
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();

    table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('updated_by').references('id').inTable('users').onDelete('SET NULL');
    table.index('is_popular');
    table.index('is_active');
    table.index('deleted_at');
  });

  // 7. Create products table (supplier_id maps to users.id)
  await knex.schema.createTable('products', (table) => {
    table.bigIncrements('id').primary();
    table.string('name', 200).notNullable();
    table.string('thumbnail', 500).nullable();
    table.decimal('price', 15, 2).notNullable();
    table.string('currency', 10).defaultTo('INR');
    table.integer('moq').defaultTo(1);
    table.string('unit', 50).defaultTo('pcs');
    table.bigInteger('supplier_id').unsigned().notNullable(); // References users.id
    table.bigInteger('category_id').unsigned().notNullable();
    table.bigInteger('brand_id').unsigned().nullable();
    table.boolean('is_trending').defaultTo(false);
    table.boolean('is_recommended').defaultTo(false);
    table.decimal('rating', 3, 2).defaultTo(0.00);
    table.boolean('is_active').defaultTo(true);
    table.bigInteger('created_by').unsigned().nullable();
    table.bigInteger('updated_by').unsigned().nullable();
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();

    table.foreign('supplier_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('category_id').references('id').inTable('categories').onDelete('RESTRICT');
    table.foreign('brand_id').references('id').inTable('brands').onDelete('SET NULL');
    table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('updated_by').references('id').inTable('users').onDelete('SET NULL');
    
    table.index('supplier_id');
    table.index('category_id');
    table.index('brand_id');
    table.index('is_trending');
    table.index('is_recommended');
    table.index('rating');
    table.index('is_active');
    table.index('deleted_at');
  });

  // 8. Create banners table
  await knex.schema.createTable('banners', (table) => {
    table.bigIncrements('id').primary();
    table.string('title', 200).notNullable();
    table.string('image', 500).notNullable();
    table.string('redirect_type', 50).nullable();
    table.bigInteger('redirect_id').unsigned().nullable();
    table.integer('priority').defaultTo(0);
    table.boolean('is_active').defaultTo(true);
    table.bigInteger('created_by').unsigned().nullable();
    table.bigInteger('updated_by').unsigned().nullable();
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();

    table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('updated_by').references('id').inTable('users').onDelete('SET NULL');
    table.index('priority');
    table.index('is_active');
    table.index('deleted_at');
  });

  // 9. Create offers table
  await knex.schema.createTable('offers', (table) => {
    table.bigIncrements('id').primary();
    table.string('title', 200).notNullable();
    table.string('banner', 500).notNullable();
    table.string('discount', 100).notNullable();
    table.timestamp('expiry_date').notNullable();
    table.boolean('is_active').defaultTo(true);
    table.bigInteger('created_by').unsigned().nullable();
    table.bigInteger('updated_by').unsigned().nullable();
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();

    table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('updated_by').references('id').inTable('users').onDelete('SET NULL');
    table.index('expiry_date');
    table.index('is_active');
    table.index('deleted_at');
  });

  // 10. Create rfqs table
  await knex.schema.createTable('rfqs', (table) => {
    table.bigIncrements('id').primary();
    table.string('title', 200).notNullable();
    table.bigInteger('category_id').unsigned().notNullable();
    table.integer('city_id').unsigned().notNullable();
    table.bigInteger('user_id').unsigned().notNullable();
    table.text('description').nullable();
    table.integer('quantity').nullable();
    table.decimal('budget', 15, 2).nullable();
    table.boolean('is_active').defaultTo(true);
    table.bigInteger('created_by').unsigned().nullable();
    table.bigInteger('updated_by').unsigned().nullable();
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();

    table.foreign('category_id').references('id').inTable('categories').onDelete('RESTRICT');
    table.foreign('city_id').references('id').inTable('cities').onDelete('RESTRICT');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('updated_by').references('id').inTable('users').onDelete('SET NULL');

    table.index('category_id');
    table.index('city_id');
    table.index('user_id');
    table.index('is_active');
    table.index('deleted_at');
  });

  // 11. Create services table
  await knex.schema.createTable('services', (table) => {
    table.bigIncrements('id').primary();
    table.string('name', 100).notNullable();
    table.string('icon', 500).nullable();
    table.text('description').nullable();
    table.boolean('is_active').defaultTo(true);
    table.bigInteger('created_by').unsigned().nullable();
    table.bigInteger('updated_by').unsigned().nullable();
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();

    table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('updated_by').references('id').inTable('users').onDelete('SET NULL');
    table.index('is_active');
    table.index('deleted_at');
  });

  // 12. Create news table
  await knex.schema.createTable('news', (table) => {
    table.bigIncrements('id').primary();
    table.string('title', 200).notNullable();
    table.string('thumbnail', 500).nullable();
    table.text('content').notNullable();
    table.timestamp('published_at').nullable();
    table.boolean('is_active').defaultTo(true);
    table.bigInteger('created_by').unsigned().nullable();
    table.bigInteger('updated_by').unsigned().nullable();
    table.timestamps(true, true);
    table.timestamp('deleted_at').nullable();

    table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('updated_by').references('id').inTable('users').onDelete('SET NULL');
    table.index('published_at');
    table.index('is_active');
    table.index('deleted_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  // Drop foreign keys and columns from company_details first
  await knex.schema.alterTable('company_details', (table) => {
    table.dropForeign('business_type_id');
    table.dropForeign('business_category_id');
    table.dropColumn('rating');
    table.dropColumn('response_rate');
    table.dropColumn('years_in_business');
  });

  // Drop columns from addresses
  await knex.schema.alterTable('addresses', (table) => {
    table.dropColumn('latitude');
    table.dropColumn('longitude');
  });

  // Drop tables in reverse order of dependencies
  await knex.schema.dropTableIfExists('news');
  await knex.schema.dropTableIfExists('services');
  await knex.schema.dropTableIfExists('rfqs');
  await knex.schema.dropTableIfExists('offers');
  await knex.schema.dropTableIfExists('banners');
  await knex.schema.dropTableIfExists('products');
  await knex.schema.dropTableIfExists('brands');
  await knex.schema.dropTableIfExists('categories');
  await knex.schema.dropTableIfExists('business_categories');
  await knex.schema.dropTableIfExists('business_types');
};
