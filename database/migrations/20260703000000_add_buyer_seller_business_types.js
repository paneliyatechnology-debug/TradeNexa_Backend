/**
 * Seed buyer_seller business type reference data.
 */

const {
  BUYER_SELLER_TYPES,
  slugify,
} = require('../seeds/05_business_types_by_role');

// ==========================================
// Migration — up
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
  const buyerSellerRole = await knex('roles').where({ code: 'buyer_seller', is_active: true }).first();
  if (!buyerSellerRole) return;

  for (const name of BUYER_SELLER_TYPES) {
    const code = slugify(name);
    const exists = await knex('business_types')
      .where({ code, role_id: buyerSellerRole.id })
      .first();

    if (!exists) {
      await knex('business_types').insert({
        name,
        code,
        role_id: buyerSellerRole.id,
        is_active: true,
      });
    }
  }
};

// ==========================================
// Migration — down
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
  const buyerSellerRole = await knex('roles').where({ code: 'buyer_seller' }).first();
  if (!buyerSellerRole) return;

  await knex('business_types').where({ role_id: buyerSellerRole.id }).del();
};
