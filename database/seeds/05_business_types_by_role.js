/**
 * Seed business types mapped to marketplace roles.
 */

// ==========================================
// Helpers & type lists
// ==========================================

const slugify = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

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

const buildRows = (names, roleId) =>
  names.map((name) => ({
    name,
    code: slugify(name),
    role_id: roleId,
    is_active: true,
  }));

// ==========================================
// Seed data
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.seed = async function (knex) {
  await knex('business_types').del();

  const roles = await knex('roles').select('id', 'code');
  const roleMap = Object.fromEntries(roles.map((r) => [r.code, r.id]));

  const buyerId = roleMap.buyer;
  const sellerId = roleMap.seller;
  const buyerSellerId = roleMap.buyer_seller;

  if (!buyerId || !sellerId || !buyerSellerId) {
    throw new Error('Buyer, Seller, and Buyer+Seller roles must exist before seeding business types');
  }

  const rows = [
    ...buildRows(BUYER_TYPES, buyerId),
    ...buildRows(SELLER_TYPES, sellerId),
    ...buildRows(BUYER_SELLER_TYPES, buyerSellerId),
  ];

  await knex('business_types').insert(rows);
};

module.exports.BUYER_SELLER_TYPES = BUYER_SELLER_TYPES;
module.exports.slugify = slugify;
