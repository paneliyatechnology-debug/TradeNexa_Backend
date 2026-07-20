/**
 * Widen device_token for FCM web tokens and allow one device per platform per user.
 */

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('devices', (table) => {
    table.string('device_token', 1024).alter();
  });

  // Prefer latest token per (user_id, device_type); drop older duplicates first.
  const duplicates = await knex('devices')
    .select('user_id', 'device_type')
    .whereNotNull('device_type')
    .groupBy('user_id', 'device_type')
    .havingRaw('COUNT(*) > 1');

  for (const row of duplicates) {
    const keep = await knex('devices')
      .where({ user_id: row.user_id, device_type: row.device_type })
      .orderBy('updated_at', 'desc')
      .orderBy('id', 'desc')
      .first();
    if (!keep) continue;
    await knex('devices')
      .where({ user_id: row.user_id, device_type: row.device_type })
      .whereNot('id', keep.id)
      .del();
  }
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('devices', (table) => {
    table.string('device_token', 500).alter();
  });
};
