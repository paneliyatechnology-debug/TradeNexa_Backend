/**
 * City sync progress logs + unique (state_id, name) on cities for idempotent imports.
 */

const indexExists = async (knex, table, indexName) => {
  const [rows] = await knex.raw(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
     LIMIT 1`,
    [table, indexName],
  );
  return rows.length > 0;
};

const tableExists = async (knex, tableName) => {
  const exists = await knex.schema.hasTable(tableName);
  return exists;
};

exports.up = async function (knex) {
  if (!(await tableExists(knex, 'city_sync_logs'))) {
    await knex.schema.createTable('city_sync_logs', (table) => {
      table.increments('id').primary();
      table.integer('state_id').unsigned().notNullable().unique();
      table.string('state_code', 10).notNullable();
      table
        .enu('status', ['pending', 'in_progress', 'completed', 'failed'])
        .notNullable()
        .defaultTo('pending');
      table.integer('api_city_count').unsigned().nullable();
      table.integer('imported_count').unsigned().nullable();
      table.integer('db_city_count').unsigned().nullable();
      table.text('last_error').nullable();
      table.timestamp('synced_at').nullable();
      table.timestamps(true, true);

      table.foreign('state_id').references('id').inTable('states').onDelete('CASCADE');
      table.index('status');
    });
  }

  if (!(await indexExists(knex, 'cities', 'cities_state_id_name_unique'))) {
    // Remove duplicate city names per state before adding unique constraint
    await knex.raw(`
      DELETE c1 FROM cities c1
      INNER JOIN cities c2
        ON c1.state_id = c2.state_id
       AND LOWER(TRIM(c1.name)) = LOWER(TRIM(c2.name))
       AND c1.id > c2.id
    `);

    await knex.schema.alterTable('cities', (table) => {
      table.unique(['state_id', 'name'], 'cities_state_id_name_unique');
    });
  }
};

exports.down = async function (knex) {
  if (await indexExists(knex, 'cities', 'cities_state_id_name_unique')) {
    await knex.schema.alterTable('cities', (table) => {
      table.dropUnique(['state_id', 'name'], 'cities_state_id_name_unique');
    });
  }

  await knex.schema.dropTableIfExists('city_sync_logs');
};
