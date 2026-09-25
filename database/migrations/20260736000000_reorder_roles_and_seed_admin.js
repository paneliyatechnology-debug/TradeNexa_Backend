/**
 * Migration: Reorder roles so Admin is role_id 1, Buyer is 2, Seller is 3, Buyer+Seller is 4.
 * Also seeds default Admin user with email & password.
 */

const { v4: uuidv4 } = require('uuid');
const { hashPassword } = require('../../utils/password');

exports.up = async function (knex) {
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0;');

  try {
    // 1. Roles definitions with Admin as 1, Buyer as 2, Seller as 3, Buyer+Seller as 4, etc.
    const rolesData = [
      { id: 1, code: 'admin', name: 'Admin', description: 'Platform administrator', is_active: 1 },
      { id: 2, code: 'buyer', name: 'Buyer', description: 'User who purchases products', is_active: 1 },
      { id: 3, code: 'seller', name: 'Seller', description: 'User who sells products', is_active: 1 },
      { id: 4, code: 'buyer_seller', name: 'Buyer + Seller', description: 'User who buys and sells products', is_active: 1 },
      { id: 5, code: 'super_admin', name: 'Super Admin', description: 'Full platform access with elevated privileges', is_active: 1 },
      { id: 6, code: 'supporter', name: 'Supporter', description: 'Customer support staff for the admin panel', is_active: 1 },
    ];

    // Truncate and re-insert roles
    await knex('roles').truncate();
    for (const role of rolesData) {
      await knex('roles').insert(role);
    }

    // 2. Hash password for default admin
    const passwordHash = await hashPassword('Admin@1234');

    // 3. Seed / update admin@tradenexa.com
    const existingTradenexa = await knex('users').where({ email: 'admin@tradenexa.com' }).first();
    if (existingTradenexa) {
      await knex('users').where({ id: existingTradenexa.id }).update({
        role_id: 1,
        password: passwordHash,
        is_active: 1,
        is_verified: 1,
        is_completed_profile: 1,
      });
    } else {
      await knex('users').insert({
        uuid: uuidv4(),
        email: 'admin@tradenexa.com',
        full_name: 'Admin',
        mobile_number: '+919999999999',
        password: passwordHash,
        role_id: 1,
        is_active: 1,
        is_verified: 1,
        is_completed_profile: 1,
      });
    }

    // 4. Seed / update admin@gmail.com (as commonly used in admin panel login)
    const existingGmail = await knex('users').where({ email: 'admin@gmail.com' }).first();
    if (existingGmail) {
      await knex('users').where({ id: existingGmail.id }).update({
        role_id: 1,
        password: passwordHash,
        is_active: 1,
        is_verified: 1,
        is_completed_profile: 1,
      });
    } else {
      await knex('users').insert({
        uuid: uuidv4(),
        email: 'admin@gmail.com',
        full_name: 'Admin User',
        mobile_number: '+919999999998',
        password: passwordHash,
        role_id: 1,
        is_active: 1,
        is_verified: 1,
        is_completed_profile: 1,
      });
    }

    // 5. Re-seed business types mapped to new role IDs
    const BUYER_TYPES = [
      // 'Retailer',
      // 'Wholesaler',
      // 'Distributor',
      // 'Trader',
      // 'Importer',
      // 'Contractor',
      // 'Service Provider',
      // 'Corporate Company',
      // 'Startup',
    ];

    const SELLER_TYPES = [
      // 'Manufacturer',
      // 'Wholesaler',
      // 'Distributor',
      // 'Exporter',
      // 'Importer',
      // 'Supplier',
      // 'Dealer',
      // 'Trader',
      // 'Brand Owner',
    ];

    const BUYER_SELLER_TYPES = [...new Set([...BUYER_TYPES, ...SELLER_TYPES])];

    const slugify = (name) =>
      name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');

    await knex('business_types').del();

    const btRows = [
      ...BUYER_TYPES.map((name) => ({ name, code: slugify(name), role_id: 2, is_active: true })),
      ...SELLER_TYPES.map((name) => ({ name, code: slugify(name), role_id: 3, is_active: true })),
      ...BUYER_SELLER_TYPES.map((name) => ({ name, code: slugify(name), role_id: 4, is_active: true })),
    ];

    for (const row of btRows) {
      await knex('business_types').insert(row);
    }
  } finally {
    await knex.raw('SET FOREIGN_KEY_CHECKS = 1;');
  }
};

exports.down = async function (knex) {
  // Reversible if needed
};
