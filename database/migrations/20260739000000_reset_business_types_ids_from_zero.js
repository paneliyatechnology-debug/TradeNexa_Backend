/**
 * Migration: Re-index live business_types IDs starting from 0 in sequential order
 * and set AUTO_INCREMENT to continue the sequential number flow.
 */

exports.up = async function (knex) {
  // 1. Temporarily disable foreign key checks and allow 0 as auto-increment value
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0;');
  try {
    await knex.raw("SET sql_mode = 'NO_AUTO_VALUE_ON_ZERO';");
  } catch (err) {
    // Ignore if sql_mode cannot be changed in this session
  }

  // 2. Fetch all existing business types ordered by their existing ID
  const rows = await knex('business_types').orderBy('id', 'asc');

  // 3. Clear existing rows and reset counter
  await knex('business_types').del();
  try {
    await knex.raw('ALTER TABLE business_types AUTO_INCREMENT = 0;');
  } catch (err) {
    // Ignore dialect quirks
  }

  // 4. Re-insert with sequential IDs starting from 0
  const idMap = new Map();
  let nextId = 0;

  for (const row of rows) {
    idMap.set(row.id, nextId);
    await knex.raw(
      'INSERT INTO business_types (id, name, code, role_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        nextId,
        row.name,
        row.code,
        row.role_id,
        row.is_active,
        row.created_at || new Date(),
        row.updated_at || new Date(),
      ]
    );
    nextId++;
  }

  // 5. Update foreign key references in users and company_details
  for (const [oldId, newId] of idMap.entries()) {
    await knex('users')
      .where({ business_type_id: oldId })
      .update({ business_type_id: newId });

    await knex('company_details')
      .where({ business_type_id: oldId })
      .update({ business_type_id: newId });
  }

  // 6. Ensure AUTO_INCREMENT continues sequentially from nextId
  try {
    await knex.raw(`ALTER TABLE business_types AUTO_INCREMENT = ${Math.max(nextId, 1)};`);
  } catch (err) {
    // Ignore
  }

  // 7. Re-enable foreign key checks
  await knex.raw('SET FOREIGN_KEY_CHECKS = 1;');
};

exports.down = async function (knex) {
  // Reversible without data alteration
};
