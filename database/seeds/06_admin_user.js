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
  const adminRole = await knex('roles')
    .whereIn('code', [ROLE_CODES.ADMIN, ROLE_CODES.SUPER_ADMIN])
    .first();

  if (!adminRole) return;

  const passwordHash = await hashPassword('Admin@1234');

  const adminEmails = [
    { email: 'admin@tradenexa.com', name: 'Super Admin', mobile: '+919999999999' },
    { email: 'admin@gmail.com', name: 'Admin User', mobile: '+919999999998' },
  ];

  for (const item of adminEmails) {
    const existing = await knex('users').where({ email: item.email }).first();
    if (existing) {
      await knex('users')
        .where({ id: existing.id })
        .update({
          role_id: adminRole.id,
          password: passwordHash,
          is_active: true,
          is_verified: true,
          is_completed_profile: true,
        });
    } else {
      await knex('users').insert({
        uuid: uuidv4(),
        email: item.email,
        full_name: item.name,
        mobile_number: item.mobile,
        password: passwordHash,
        role_id: adminRole.id,
        is_active: true,
        is_verified: true,
        is_completed_profile: true,
      });
    }
  }
};
