/**
 * Add role_id to business_types for role-scoped business types.
 */

// ==========================================
// Migration — up
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  // Clear FK references before restructuring business_types
  const hasCompanyDetails = await knex.schema.hasTable('company_details');
  if (hasCompanyDetails) {
    await knex('company_details').update({ business_type_id: null });
  }

  await knex('business_types').del();

  await knex.schema.alterTable('business_types', (table) => {
    table.dropUnique(['name']);
    table.dropUnique(['code']);
  });

  await knex.schema.alterTable('business_types', (table) => {
    table.integer('role_id').unsigned().notNullable();
    table.foreign('role_id').references('id').inTable('roles').onDelete('CASCADE');
    table.unique(['name', 'role_id']);
    table.unique(['code', 'role_id']);
    table.index('role_id');
  });

  const hasBusinessTypeOnUsers = await knex.schema.hasColumn('users', 'business_type_id');
  if (!hasBusinessTypeOnUsers) {
    await knex.schema.alterTable('users', (table) => {
      table.bigInteger('business_type_id').unsigned().nullable();
      table.foreign('business_type_id').references('id').inTable('business_types').onDelete('SET NULL');
      table.index('business_type_id');
    });
  }
};

// ==========================================
// Migration — down
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('users', (table) => {
    table.dropForeign('business_type_id');
    table.dropColumn('business_type_id');
  });

  await knex.schema.alterTable('business_types', (table) => {
    table.dropForeign('role_id');
    table.dropUnique(['name', 'role_id']);
    table.dropUnique(['code', 'role_id']);
    table.dropColumn('role_id');
    table.unique(['name']);
    table.unique(['code']);
  });
};
