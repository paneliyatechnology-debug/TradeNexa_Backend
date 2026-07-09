/**
 * Add category_id to products — backfill from subcategory parent, preserve existing data.
 * Idempotent: safe when the column was already added via manual SQL.
 */

const foreignKeyExists = async (knex, tableName, columnName) => {
  const result = await knex.raw(
    `
    SELECT COUNT(*) AS cnt
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `,
    [tableName, columnName],
  );

  return Number(result[0][0].cnt) > 0;
};

const indexExists = async (knex, tableName, columnName) => {
  const result = await knex.raw(
    `
    SELECT COUNT(*) AS cnt
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
      AND INDEX_NAME != 'PRIMARY'
  `,
    [tableName, columnName],
  );

  return Number(result[0][0].cnt) > 0;
};

exports.up = async function (knex) {
  const hasCategoryId = await knex.schema.hasColumn('products', 'category_id');

  if (!hasCategoryId) {
    await knex.schema.alterTable('products', (table) => {
      table.bigInteger('category_id').unsigned().nullable();
    });
  }

  await knex.raw(`
    UPDATE products p
    INNER JOIN categories sc ON sc.id = p.subcategory_id
    SET p.category_id = sc.parent_id
    WHERE p.category_id IS NULL AND sc.parent_id IS NOT NULL
  `);

  if (!(await foreignKeyExists(knex, 'products', 'category_id'))) {
    await knex.schema.alterTable('products', (table) => {
      table.foreign('category_id').references('id').inTable('categories').onDelete('RESTRICT');
    });
  }

  if (!(await indexExists(knex, 'products', 'category_id'))) {
    await knex.schema.alterTable('products', (table) => {
      table.index('category_id');
    });
  }
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasColumn('products', 'category_id'))) {
    return;
  }

  if (await foreignKeyExists(knex, 'products', 'category_id')) {
    await knex.schema.alterTable('products', (table) => {
      table.dropForeign(['category_id']);
    });
  }

  if (await indexExists(knex, 'products', 'category_id')) {
    await knex.schema.alterTable('products', (table) => {
      table.dropIndex(['category_id']);
    });
  }

  await knex.schema.alterTable('products', (table) => {
    table.dropColumn('category_id');
  });
};
