/**
 * Migration: Set Super Admin as role_id 1 and seed Super Admin accounts with email & password.
 */

const { v4: uuidv4 } = require('uuid');
const { hashPassword } = require('../../utils/password');

exports.up = async function (knex) {
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0;');

  try {
    // 1. Roles table: Super Admin as ID 1, Buyer as 2, Seller as 3, Buyer+Seller as 4, Admin as 5, Supporter as 6
    const rolesData = [
      { id: 1, code: 'super_admin', name: 'Super Admin', description: 'Full platform access with elevated privileges', is_active: 1 },
      { id: 2, code: 'buyer', name: 'Buyer', description: 'User who purchases products', is_active: 1 },
      { id: 3, code: 'seller', name: 'Seller', description: 'User who sells products', is_active: 1 },
      { id: 4, code: 'buyer_seller', name: 'Buyer + Seller', description: 'User who buys and sells products', is_active: 1 },
      { id: 5, code: 'admin', name: 'Admin', description: 'Platform administrator', is_active: 1 },
      { id: 6, code: 'supporter', name: 'Supporter', description: 'Customer support staff for the admin panel', is_active: 1 },
    ];

    await knex('roles').truncate();
    for (const r of rolesData) {
      await knex('roles').insert(r);
    }

    const passwordHash = await hashPassword('Admin@1234');

    // 2. Super Admin accounts to seed / update with role_id: 1
    const superAdminUsers = [
      { email: 'superadmin@tradenexa.com', name: 'Super Admin', mobile: '+919999999990' },
      { email: 'superadmin@gmail.com', name: 'Super Admin User', mobile: '+919999999991' },
      { email: 'admin@tradenexa.com', name: 'Super Admin', mobile: '+919999999999' },
      { email: 'admin@gmail.com', name: 'Admin User', mobile: '+919999999998' },
    ];

    for (const u of superAdminUsers) {
      const existing = await knex('users').where({ email: u.email }).first();
      if (existing) {
        await knex('users').where({ id: existing.id }).update({
          role_id: 1,
          password: passwordHash,
          is_active: 1,
          is_verified: 1,
          is_completed_profile: 1,
        });
      } else {
        await knex('users').insert({
          uuid: uuidv4(),
          email: u.email,
          full_name: u.name,
          mobile_number: u.mobile,
          password: passwordHash,
          role_id: 1,
          is_active: 1,
          is_verified: 1,
          is_completed_profile: 1,
        });
      }
    }
  } finally {
    await knex.raw('SET FOREIGN_KEY_CHECKS = 1;');
  }
};

exports.down = async function (knex) {};
