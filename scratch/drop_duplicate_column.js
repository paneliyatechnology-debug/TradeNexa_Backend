const db = require('../database/knex');

async function run() {
  try {
    // Drop foreign key if existed
    try {
      await db.schema.alterTable('users', (table) => {
        table.dropForeign('language_id');
      });
      console.log('Dropped foreign key constraint users_language_id_foreign');
    } catch (_) {}

    // Drop column if existed
    try {
      await db.schema.alterTable('users', (table) => {
        table.dropColumn('language_id');
      });
      console.log('Dropped column language_id');
    } catch (_) {}

    console.log('Cleanup of users.language_id completed successfully.');
  } catch (err) {
    console.error(err);
  } finally {
    await db.destroy();
  }
}

run();
