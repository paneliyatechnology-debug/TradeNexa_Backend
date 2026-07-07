/**
 * Replace RFQ unit_id with text unit field (same as products).
 */

exports.up = async function (knex) {
  const rfqsHasUnit = await knex.schema.hasColumn('rfqs', 'unit');
  if (!rfqsHasUnit) {
    await knex.schema.alterTable('rfqs', (table) => {
      table.string('unit', 50).nullable();
    });
  }

  await knex.raw(`
    UPDATE rfqs r
    LEFT JOIN units u ON u.id = r.unit_id
    SET r.unit = COALESCE(r.unit, u.code, u.name, 'pcs')
    WHERE r.deleted_at IS NULL
  `);

  const rfqsHasUnitId = await knex.schema.hasColumn('rfqs', 'unit_id');
  if (rfqsHasUnitId) {
    await knex.schema.alterTable('rfqs', (table) => {
      table.dropForeign('unit_id');
      table.dropColumn('unit_id');
    });
  }

  const quotationsHasUnit = await knex.schema.hasColumn('quotations', 'unit');
  if (!quotationsHasUnit) {
    await knex.schema.alterTable('quotations', (table) => {
      table.string('unit', 50).nullable();
    });
  }

  await knex.raw(`
    UPDATE quotations q
    LEFT JOIN units u ON u.id = q.unit_id
    SET q.unit = COALESCE(q.unit, u.code, u.name)
    WHERE q.unit IS NULL
  `);

  const quotationsHasUnitId = await knex.schema.hasColumn('quotations', 'unit_id');
  if (quotationsHasUnitId) {
    await knex.schema.alterTable('quotations', (table) => {
      table.dropForeign('unit_id');
      table.dropColumn('unit_id');
    });
  }
};

exports.down = async function (knex) {
  const rfqsHasUnitId = await knex.schema.hasColumn('rfqs', 'unit_id');
  if (!rfqsHasUnitId) {
    await knex.schema.alterTable('rfqs', (table) => {
      table.integer('unit_id').unsigned().nullable();
      table.foreign('unit_id').references('id').inTable('units').onDelete('SET NULL');
    });
  }

  if (await knex.schema.hasColumn('rfqs', 'unit')) {
    await knex.schema.alterTable('rfqs', (table) => {
      table.dropColumn('unit');
    });
  }

  const quotationsHasUnitId = await knex.schema.hasColumn('quotations', 'unit_id');
  if (!quotationsHasUnitId) {
    await knex.schema.alterTable('quotations', (table) => {
      table.integer('unit_id').unsigned().nullable();
      table.foreign('unit_id').references('id').inTable('units').onDelete('SET NULL');
    });
  }

  if (await knex.schema.hasColumn('quotations', 'unit')) {
    await knex.schema.alterTable('quotations', (table) => {
      table.dropColumn('unit');
    });
  }
};
