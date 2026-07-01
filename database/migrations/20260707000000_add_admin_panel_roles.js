const { ROLE_CODES } = require('../../constants');

const ADMIN_PANEL_ROLES = [
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
];

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  for (const role of ADMIN_PANEL_ROLES) {
    const exists = await knex('roles').where({ code: role.code }).first();
    if (!exists) {
      await knex('roles').insert(role);
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  await knex('roles')
    .whereIn('code', [ROLE_CODES.SUPER_ADMIN, ROLE_CODES.SUPPORTER])
    .del();
};
