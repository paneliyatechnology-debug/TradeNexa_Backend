const db = require('../database/knex');

async function run() {
  try {
    const details = await db('company_details').select('id', 'user_id', 'company_name', 'business_type_id', 'business_category_id');
    console.log('Company Details:', details);
  } catch (err) {
    console.error(err);
  } finally {
    await db.destroy();
  }
}

run();
