/**
 * Seed countries, states, and cities reference data.
 */

// ==========================================
// Seed data
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.seed = async function (knex) {
  let country = await knex('countries').where('code', 'IN').first();
  if (!country) {
    const [id] = await knex('countries').insert({
      name: 'India',
      code: 'IN',
      is_active: true,
    });
    country = { id };
  }
  const indiaId = country.id;

  const states = [
    { name: 'Gujarat', code: 'GJ' },
    { name: 'Maharashtra', code: 'MH' },
    { name: 'Delhi', code: 'DL' },
    { name: 'Karnataka', code: 'KA' },
    { name: 'Tamil Nadu', code: 'TN' },
  ];

  for (const state of states) {
    let stateRow = await knex('states').where({ country_id: indiaId, code: state.code }).first();
    if (!stateRow) {
      const [id] = await knex('states').insert({
        country_id: indiaId,
        name: state.name,
        code: state.code,
        is_active: true,
      });
      stateRow = { id };
    }
    const sid = stateRow.id;

    if (state.code === 'GJ') {
      const gjCities = ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar'];
      for (const cityName of gjCities) {
        const cExists = await knex('cities').where({ state_id: sid, name: cityName }).first();
        if (!cExists) {
          await knex('cities').insert({ state_id: sid, name: cityName, is_active: true });
        }
      }
    }

    if (state.code === 'MH') {
      const mhCities = ['Mumbai', 'Pune', 'Nagpur', 'Nashik'];
      for (const cityName of mhCities) {
        const cExists = await knex('cities').where({ state_id: sid, name: cityName }).first();
        if (!cExists) {
          await knex('cities').insert({ state_id: sid, name: cityName, is_active: true });
        }
      }
    }
  }
};
