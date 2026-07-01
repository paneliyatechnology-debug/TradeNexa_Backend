const db = require('../database/knex');

async function run() {
  try {
    await db('knex_migrations').where('name', '20260630000000_create_b2b_buyer_home_tables.js').del();
    console.log('Removed migration entry from knex_migrations');
  } catch (err) {
    console.error(err);
  } finally {
    await db.destroy();
  }
}

run();
