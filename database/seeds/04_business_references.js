/**
 * @param { import("knex").Knex } knex
 */
exports.seed = async function (knex) {
  await knex('business_categories').del();

  await knex('business_categories').insert([
    { name: 'Electronics & Electrical', code: 'electronics_electrical', is_active: true },
    { name: 'Apparel & Fashion', code: 'apparel_fashion', is_active: true },
    { name: 'Industrial Machinery & Equipment', code: 'machinery_equipment', is_active: true },
    { name: 'Chemicals, Dyes & Solvents', code: 'chemicals_dyes_solvents', is_active: true },
    { name: 'Food & Beverage', code: 'food_beverage', is_active: true },
    { name: 'Building & Construction', code: 'building_construction', is_active: true },
  ]);
};
