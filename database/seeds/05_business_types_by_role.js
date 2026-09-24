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

exports.seed = async function (knex) {
  // Auto-seeding disabled to prevent clearing and overwriting manual database entries
};

module.exports.BUYER_SELLER_TYPES = BUYER_SELLER_TYPES;
module.exports.slugify = slugify;
