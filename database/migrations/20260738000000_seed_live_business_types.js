/**
 * Migration: Seed live business types for buyer, seller, and buyer_seller roles.
 */

exports.up = async function (knex) {
  const buyerRole = await knex('roles').where({ code: 'buyer' }).first();
  const sellerRole = await knex('roles').where({ code: 'seller' }).first();
  const buyerSellerRole = await knex('roles').where({ code: 'buyer_seller' }).first();

  if (!buyerRole || !sellerRole || !buyerSellerRole) {
    console.warn('[Migration] Roles not found when seeding business_types');
    return;
  }

  const BUYER_TYPES = [
    'Retailer',
    'Wholesaler',
    'Distributor',
    'Trader',
    'Importer',
    'Contractor',
    'Service Provider',
    'Corporate Company',
    'Startup',
  ];

  const SELLER_TYPES = [
    'Manufacturer',
    'Wholesaler',
    'Distributor',
    'Exporter',
    'Importer',
    'Supplier',
    'Dealer',
    'Trader',
    'Brand Owner',
  ];

  const BUYER_SELLER_TYPES = [...new Set([...BUYER_TYPES, ...SELLER_TYPES])];

  const slugify = (name) =>
    name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

  await knex('business_types').del();

  const rows = [
    ...BUYER_TYPES.map((name) => ({
      name,
      code: slugify(name),
      role_id: buyerRole.id,
      is_active: true,
    })),
    ...SELLER_TYPES.map((name) => ({
      name,
      code: slugify(name),
      role_id: sellerRole.id,
      is_active: true,
    })),
    ...BUYER_SELLER_TYPES.map((name) => ({
      name,
      code: slugify(name),
      role_id: buyerSellerRole.id,
      is_active: true,
    })),
  ];

  for (const row of rows) {
    await knex('business_types').insert(row);
  }
};

exports.down = async function (knex) {
  await knex('business_types').del();
};
