/**
 * Add extended product fields (nullable / defaults — existing rows are preserved).
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('products', (table) => {
    table.text('short_description').nullable();
    table.text('description').nullable();
    table.string('material', 150).nullable();
    table.string('country_of_origin', 100).nullable();
    table.string('product_condition', 30).nullable();
    table.string('stock_status', 30).nullable().defaultTo('IN_STOCK');
    table.boolean('show_price').notNullable().defaultTo(true);
    table.boolean('accept_inquiry').notNullable().defaultTo(true);
    table.string('warranty', 100).nullable();
    table.integer('stock_quantity').unsigned().nullable();
    table.string('hsn_code', 20).nullable();
    table.decimal('gst_percentage', 5, 2).nullable();
    table.text('search_tags').nullable();
    table.json('specifications').nullable();

    table.index('stock_status');
    table.index('product_condition');
    table.index('country_of_origin');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('products', (table) => {
    table.dropIndex(['stock_status']);
    table.dropIndex(['product_condition']);
    table.dropIndex(['country_of_origin']);
    table.dropColumn('short_description');
    table.dropColumn('description');
    table.dropColumn('material');
    table.dropColumn('country_of_origin');
    table.dropColumn('product_condition');
    table.dropColumn('stock_status');
    table.dropColumn('show_price');
    table.dropColumn('accept_inquiry');
    table.dropColumn('warranty');
    table.dropColumn('stock_quantity');
    table.dropColumn('hsn_code');
    table.dropColumn('gst_percentage');
    table.dropColumn('search_tags');
    table.dropColumn('specifications');
  });
};
