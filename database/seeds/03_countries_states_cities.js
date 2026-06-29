/**
 * @param { import("knex").Knex } knex
 */
exports.seed = async function (knex) {
  await knex('cities').del();
  await knex('states').del();
  await knex('countries').del();

  await knex('countries').insert({
    name: 'India',
    code: 'IN',
    is_active: true,
  });

  const country = await knex('countries').where('code', 'IN').first();
  const indiaId = country.id;

  const states = [
    { name: 'Gujarat', code: 'GJ' },
    { name: 'Maharashtra', code: 'MH' },
    { name: 'Delhi', code: 'DL' },
    { name: 'Karnataka', code: 'KA' },
    { name: 'Tamil Nadu', code: 'TN' },
  ];

  for (const state of states) {
    await knex('states').insert({
      country_id: indiaId,
      name: state.name,
      code: state.code,
      is_active: true,
    });

    const insertedState = await knex('states').where('code', state.code).first();
    const sid = insertedState.id;

    if (state.code === 'GJ') {
      await knex('cities').insert([
        { state_id: sid, name: 'Ahmedabad', is_active: true },
        { state_id: sid, name: 'Surat', is_active: true },
        { state_id: sid, name: 'Vadodara', is_active: true },
      ]);
    }

    if (state.code === 'MH') {
      await knex('cities').insert([
        { state_id: sid, name: 'Mumbai', is_active: true },
        { state_id: sid, name: 'Pune', is_active: true },
      ]);
    }
  }
};
