/**
 * Seed default super admin user for admin panel login.
 */
const { v4: uuidv4 } = require('uuid');
const { hashPassword } = require('../../utils/password');
const { ROLE_CODES } = require('../../constants');

/**
 * @param { import("knex").Knex } knex
 */
exports.seed = async function (knex) {
  const superAdminRole = await knex('roles')
    .where({ code: ROLE_CODES.SUPER_ADMIN })
    .first();

  if (!superAdminRole) return;

  const passwordHash = await hashPassword('Admin@1234');

  const existing = await knex('users')
    .where({ email: 'admin@tradenexa.com' })
    .first();

  if (existing) {
    await knex('users')
      .where({ id: existing.id })
      .update({
        role_id: superAdminRole.id,
        password: passwordHash,
        is_active: true,
        is_verified: true,
        is_completed_profile: true,
      });
  } else {
    await knex('users').insert({
      uuid: uuidv4(),
      email: 'admin@tradenexa.com',
      full_name: 'Super Admin',
      mobile_number: '+919999999999',
      password: passwordHash,
      role_id: superAdminRole.id,
      is_active: true,
      is_verified: true,
      is_completed_profile: true,
    });
  }
};
