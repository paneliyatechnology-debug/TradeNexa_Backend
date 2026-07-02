/**
 * Add role-specific profile fields to users and company_details.
 */

// ==========================================
// Migration — up
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('company_details', (table) => {
    table.string('company_logo', 500).nullable();
    table.string('company_banner', 500).nullable();
    table.string('pan_number', 10).nullable();
    table.string('cin', 21).nullable();
    table.string('iec', 10).nullable();
    table.text('business_description').nullable();
  });

  await knex.schema.alterTable('company_details', (table) => {
    table.string('company_name', 200).nullable().alter();
  });
};

// ==========================================
// Migration — down
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('company_details', (table) => {
    table.dropColumn('company_logo');
    table.dropColumn('company_banner');
    table.dropColumn('pan_number');
    table.dropColumn('cin');
    table.dropColumn('iec');
    table.dropColumn('business_description');
    table.string('company_name', 200).notNullable().alter();
  });
};
