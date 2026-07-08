/**
 * Add category_id to products — backfill from subcategory parent, preserve existing data.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('products', (table) => {
    table.bigInteger('category_id').unsigned().nullable();
  });

  await knex.raw(`
    UPDATE products p
    INNER JOIN categories sc ON sc.id = p.subcategory_id
    SET p.category_id = sc.parent_id
    WHERE p.category_id IS NULL AND sc.parent_id IS NOT NULL
  `);

  await knex.schema.alterTable('products', (table) => {
    table.foreign('category_id').references('id').inTable('categories').onDelete('RESTRICT');
    table.index('category_id');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('products', (table) => {
    table.dropForeign(['category_id']);
    table.dropIndex(['category_id']);
    table.dropColumn('category_id');
  });
};
