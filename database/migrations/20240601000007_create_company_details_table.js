/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable('company_details', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('user_id').unsigned().notNullable().unique();
    table.string('company_name', 200).notNullable();
    table.string('gst_number', 20).nullable();
    table.string('profile_image', 500).nullable();
    table.bigInteger('business_category_id').unsigned().nullable();
    table.bigInteger('business_type_id').unsigned().nullable();
    table.bigInteger('created_by').unsigned().nullable();
    table.bigInteger('updated_by').unsigned().nullable();
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index('gst_number');
    table.index('company_name');
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('company_details');
};
