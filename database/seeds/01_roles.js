const { ROLE_CODES } = require('../../constants');

/**
 * @param { import("knex").Knex } knex
 */
exports.seed = async function (knex) {
  await knex('roles').del();

  await knex('roles').insert([
    {
      code: ROLE_CODES.BUYER,
      name: 'Buyer',
      description: 'User who purchases products',
      is_active: true,
    },
    {
      code: ROLE_CODES.SELLER,
      name: 'Seller',
      description: 'User who sells products',
      is_active: true,
    },
    {
      code: ROLE_CODES.BUYER_SELLER,
      name: 'Buyer + Seller',
      description: 'User who buys and sells products',
      is_active: true,
    },
    {
      code: ROLE_CODES.ADMIN,
      name: 'Admin',
      description: 'Platform administrator',
      is_active: true,
    },
    {
      code: ROLE_CODES.SUPER_ADMIN,
      name: 'Super Admin',
      description: 'Full platform access with elevated privileges',
      is_active: true,
    },
    {
      code: ROLE_CODES.SUPPORTER,
      name: 'Supporter',
      description: 'Customer support staff for the admin panel',
      is_active: true,
    },
  ]);
};
