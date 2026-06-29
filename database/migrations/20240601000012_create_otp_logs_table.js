/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.createTable('otp_logs', (table) => {
    table.bigIncrements('id').primary();
    table.string('mobile_number', 15).notNullable();
    table.string('firebase_verification_id', 500).notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.timestamp('expires_at').notNullable();
    table.timestamp('verified_at').nullable();
    table.timestamps(true, true);

    table.index('mobile_number');
    table.index('firebase_verification_id');
    table.index(['mobile_number', 'status']);
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('otp_logs');
};
