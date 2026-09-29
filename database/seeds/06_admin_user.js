/**
 * Seed default super admin and admin users for admin panel login.
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
  const adminRole = await knex('roles')
    .where({ code: ROLE_CODES.ADMIN })
    .first();

  const superAdminPassHash = await hashPassword('superadmin@123');
  const adminPassHash = await hashPassword('admin@123');

  const usersToSeed = [
    {
      email: 'superadmin@gmail.com',
      name: 'Super Admin',
      mobile: '+919999999991',
      roleId: superAdminRole ? superAdminRole.id : 1,
      passwordHash: superAdminPassHash,
    },
    {
      email: 'admin@gmail.com',
      name: 'Admin',
      mobile: '+919999999998',
      roleId: adminRole ? adminRole.id : 4,
      passwordHash: adminPassHash,
    },
  ];

  for (const item of usersToSeed) {
    const existing = await knex('users').where({ email: item.email }).first();
    if (existing) {
      await knex('users')
        .where({ id: existing.id })
        .update({
          role_id: item.roleId,
          password: item.passwordHash,
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
        password: item.passwordHash,
        role_id: item.roleId,
        is_active: true,
        is_verified: true,
        is_completed_profile: true,
      });
    }
  }
};

