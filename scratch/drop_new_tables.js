const db = require('../database/knex');

async function run() {
  try {
    // Check if FKs exist on company_details and drop them
    try {
      await db.schema.alterTable('company_details', (table) => {
        table.dropForeign('business_type_id');
        table.dropForeign('business_category_id');
      });
      console.log('Dropped FKs on company_details');
    } catch (e) {
      console.log('FKs on company_details did not exist or already dropped');
    }

    const tables = [
      'news',
      'services',
      'rfqs',
      'offers',
      'banners',
      'products',
      'suppliers',
      'brands',
      'categories',
      'business_categories',
      'business_types'
    ];

    for (const table of tables) {
      await db.schema.dropTableIfExists(table);
      console.log(`Dropped table ${table} if existed`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await db.destroy();
  }
}

run();
