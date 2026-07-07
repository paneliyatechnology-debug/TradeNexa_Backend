/**
 * Change rfqs.state from integer ID to string name.
 */

exports.up = async function (knex) {
  const hasState = await knex.schema.hasColumn('rfqs', 'state');
  if (!hasState) {
    await knex.schema.alterTable('rfqs', (table) => {
      table.string('state', 100).nullable();
    });
    return;
  }

  const column = await knex.raw(`
    SELECT DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'rfqs'
      AND COLUMN_NAME = 'state'
    LIMIT 1
  `);

  const dataType = column[0]?.[0]?.DATA_TYPE;
  if (dataType === 'varchar' || dataType === 'char') return;

  await knex.schema.alterTable('rfqs', (table) => {
    table.string('state_name', 100).nullable();
  });

  await knex.raw(`
    UPDATE rfqs r
    LEFT JOIN states s ON r.state = s.id
    SET r.state_name = COALESCE(s.name, CAST(r.state AS CHAR))
    WHERE r.deleted_at IS NULL
  `);

  await knex.schema.alterTable('rfqs', (table) => {
    table.dropColumn('state');
  });

  await knex.schema.alterTable('rfqs', (table) => {
    table.renameColumn('state_name', 'state');
  });
};

exports.down = async function (knex) {
  const hasState = await knex.schema.hasColumn('rfqs', 'state');
  if (!hasState) return;

  await knex.schema.alterTable('rfqs', (table) => {
    table.integer('state_id').unsigned().nullable();
  });

  await knex.raw('UPDATE rfqs SET state_id = NULL');

  await knex.schema.alterTable('rfqs', (table) => {
    table.dropColumn('state');
    table.renameColumn('state_id', 'state');
  });
};
