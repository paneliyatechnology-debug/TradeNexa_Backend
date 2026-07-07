/**
 * Add structured delivery address fields to RFQs.
 */

exports.up = async function (knex) {
  const hasColumn = async (column) => knex.schema.hasColumn('rfqs', column);

  if (!(await hasColumn('address_line_1'))) {
    await knex.schema.alterTable('rfqs', (table) => {
      table.string('address_line_1', 255).nullable();
      table.string('address_line_2', 255).nullable();
      table.string('address_city', 100).nullable();
      table.string('address_state', 100).nullable();
      table.string('address_country', 100).nullable();
      table.string('pincode', 20).nullable();
    });
  }

  await knex.raw(`
    UPDATE rfqs
    SET
      pincode = COALESCE(pincode, delivery_pincode),
      address_line_1 = COALESCE(address_line_1, delivery_address)
    WHERE deleted_at IS NULL
  `);

  await knex.raw('ALTER TABLE rfqs MODIFY city_id INT UNSIGNED NULL');
};

exports.down = async function (knex) {
  const hasColumn = async (column) => knex.schema.hasColumn('rfqs', column);

  if (await hasColumn('address_line_1')) {
    await knex.schema.alterTable('rfqs', (table) => {
      table.dropColumn('address_line_1');
      table.dropColumn('address_line_2');
      table.dropColumn('address_city');
      table.dropColumn('address_state');
      table.dropColumn('address_country');
      table.dropColumn('pincode');
    });
  }

  await knex.raw('ALTER TABLE rfqs MODIFY city_id INT UNSIGNED NOT NULL');
};
