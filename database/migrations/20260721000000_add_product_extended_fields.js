/**
 * Add extended product fields (nullable / defaults — existing rows are preserved).
 * Idempotent: safe when columns were already added via manual SQL.
 */

const addColumnIfMissing = async (knex, tableName, columnName, builder) => {
  if (!(await knex.schema.hasColumn(tableName, columnName))) {
    await knex.schema.alterTable(tableName, builder);
  }
};

exports.up = async function (knex) {
  await addColumnIfMissing(knex, 'products', 'short_description', (table) => {
    table.text('short_description').nullable();
  });
  await addColumnIfMissing(knex, 'products', 'description', (table) => {
    table.text('description').nullable();
  });
  await addColumnIfMissing(knex, 'products', 'material', (table) => {
    table.string('material', 150).nullable();
  });
  await addColumnIfMissing(knex, 'products', 'country_of_origin', (table) => {
    table.string('country_of_origin', 100).nullable();
  });
  await addColumnIfMissing(knex, 'products', 'product_condition', (table) => {
    table.string('product_condition', 30).nullable();
  });
  await addColumnIfMissing(knex, 'products', 'stock_status', (table) => {
    table.string('stock_status', 30).nullable().defaultTo('IN_STOCK');
  });
  await addColumnIfMissing(knex, 'products', 'show_price', (table) => {
    table.boolean('show_price').notNullable().defaultTo(true);
  });
  await addColumnIfMissing(knex, 'products', 'accept_inquiry', (table) => {
    table.boolean('accept_inquiry').notNullable().defaultTo(true);
  });
  await addColumnIfMissing(knex, 'products', 'warranty', (table) => {
    table.string('warranty', 100).nullable();
  });
  await addColumnIfMissing(knex, 'products', 'stock_quantity', (table) => {
    table.integer('stock_quantity').unsigned().nullable();
  });
  await addColumnIfMissing(knex, 'products', 'hsn_code', (table) => {
    table.string('hsn_code', 20).nullable();
  });
  await addColumnIfMissing(knex, 'products', 'gst_percentage', (table) => {
    table.decimal('gst_percentage', 5, 2).nullable();
  });
  await addColumnIfMissing(knex, 'products', 'search_tags', (table) => {
    table.text('search_tags').nullable();
  });
  await addColumnIfMissing(knex, 'products', 'specifications', (table) => {
    table.json('specifications').nullable();
  });

  const indexExists = async (indexName) => {
    const result = await knex.raw(
      `
      SELECT COUNT(*) AS cnt
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'products'
        AND INDEX_NAME = ?
    `,
      [indexName],
    );
    return Number(result[0][0].cnt) > 0;
  };

  if (!(await indexExists('products_stock_status_index'))) {
    await knex.schema.alterTable('products', (table) => {
      table.index('stock_status');
    });
  }
  if (!(await indexExists('products_product_condition_index'))) {
    await knex.schema.alterTable('products', (table) => {
      table.index('product_condition');
    });
  }
  if (!(await indexExists('products_country_of_origin_index'))) {
    await knex.schema.alterTable('products', (table) => {
      table.index('country_of_origin');
    });
  }
};

exports.down = async function (knex) {
  const dropColumnIfExists = async (columnName) => {
    if (await knex.schema.hasColumn('products', columnName)) {
      await knex.schema.alterTable('products', (table) => {
        table.dropColumn(columnName);
      });
    }
  };

  const indexExists = async (indexName) => {
    const result = await knex.raw(
      `
      SELECT COUNT(*) AS cnt
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'products'
        AND INDEX_NAME = ?
    `,
      [indexName],
    );
    return Number(result[0][0].cnt) > 0;
  };

  if (await indexExists('products_stock_status_index')) {
    await knex.schema.alterTable('products', (table) => {
      table.dropIndex(['stock_status']);
    });
  }
  if (await indexExists('products_product_condition_index')) {
    await knex.schema.alterTable('products', (table) => {
      table.dropIndex(['product_condition']);
    });
  }
  if (await indexExists('products_country_of_origin_index')) {
    await knex.schema.alterTable('products', (table) => {
      table.dropIndex(['country_of_origin']);
    });
  }

  await dropColumnIfExists('short_description');
  await dropColumnIfExists('description');
  await dropColumnIfExists('material');
  await dropColumnIfExists('country_of_origin');
  await dropColumnIfExists('product_condition');
  await dropColumnIfExists('stock_status');
  await dropColumnIfExists('show_price');
  await dropColumnIfExists('accept_inquiry');
  await dropColumnIfExists('warranty');
  await dropColumnIfExists('stock_quantity');
  await dropColumnIfExists('hsn_code');
  await dropColumnIfExists('gst_percentage');
  await dropColumnIfExists('search_tags');
  await dropColumnIfExists('specifications');
};
