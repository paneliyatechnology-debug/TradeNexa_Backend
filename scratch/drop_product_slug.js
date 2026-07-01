const db = require('../database/knex');

async function run() {
  try {
    try {
      await db.schema.alterTable('products', (table) => {
        table.dropIndex('slug');
      });
      console.log('Dropped slug index');
    } catch (_) {}

    try {
      await db.schema.alterTable('products', (table) => {
        table.dropColumn('slug');
      });
      console.log('Dropped slug column');
    } catch (_) {}

    console.log('Cleanup completed.');
  } catch (err) {
    console.error(err);
  } finally {
    await db.destroy();
  }
}

run();
