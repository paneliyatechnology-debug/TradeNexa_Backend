/**
 * Move profile_image to users and add is_completed_profile flag.
 */

/**
 * Move profile_image from company_details to users.
 * Add is_completed_profile flag on users.
 *
 * @param { import("knex").Knex } knex
 */
// ==========================================
// Migration — up
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('users', (table) => {
    table.string('profile_image', 500).nullable().after('full_name');
    table.boolean('is_completed_profile').notNullable().defaultTo(false).after('is_active');
  });

  await knex.raw(`
    UPDATE users u
    INNER JOIN company_details cd ON cd.user_id = u.id
    SET u.profile_image = cd.profile_image
    WHERE cd.profile_image IS NOT NULL
  `);

  await knex.schema.alterTable('company_details', (table) => {
    table.dropColumn('profile_image');
  });
};

// ==========================================
// Migration — down
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('company_details', (table) => {
    table.string('profile_image', 500).nullable();
  });

  await knex.raw(`
    UPDATE company_details cd
    INNER JOIN users u ON u.id = cd.user_id
    SET cd.profile_image = u.profile_image
    WHERE u.profile_image IS NOT NULL
  `);

  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('profile_image');
    table.dropColumn('is_completed_profile');
  });
};
