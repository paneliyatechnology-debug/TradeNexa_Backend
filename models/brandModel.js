const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { resolveMediaUrl } = require('../utils/media');
const { applyListSort } = require('../utils/listQuery');

const BRAND_SORT_FIELDS = {
  id: 'brands.id',
  name: 'brands.name',
  slug: 'brands.slug',
  country: 'brands.country',
  is_popular: 'brands.is_popular',
  is_featured: 'brands.is_featured',
  is_active: 'brands.is_active',
  created_at: 'brands.created_at',
};

/** Convert a brand name to a URL-safe slug. */
const slugify = (text) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

const uniqueSlugForBrand = async (name, excludeId = null) => {
  const base = slugify(name) || 'brand';
  let candidate = base;
  let suffix = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const q = db('brands').where({ slug: candidate }).whereNull('deleted_at');
    if (excludeId) q.whereNot({ id: excludeId });
    const existing = await q.first();
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
};

// ==========================================
// Formatting helpers
// ==========================================

/**
 * Format a brand row for API responses.
 * Accepts a brands table row or product-join columns prefixed with brand_.
 */
const formatBrandEntity = (row) => {
  if (!row) return null;

  const id = row.brand_id ?? row.id ?? null;
  const name = row.brand_name ?? row.name ?? null;

  if (!id && !name) {
    return {
      id: null,
      name: null,
      slug: null,
      description: null,
      website: null,
      country: null,
      logo: null,
      is_popular: null,
      is_featured: null,
      is_active: null,
    };
  }

  const logo = row.brand_logo ?? row.logo ?? null;

  return {
    id,
    name,
    slug: row.brand_slug ?? row.slug ?? null,
    description: row.brand_description ?? row.description ?? null,
    website: row.brand_website ?? row.website ?? null,
    country: row.brand_country ?? row.country ?? null,
    logo: logo ? resolveMediaUrl(logo) : null,
    is_popular:
      row.brand_is_popular !== undefined
        ? !!row.brand_is_popular
        : row.is_popular !== undefined
          ? !!row.is_popular
          : null,
    is_featured:
      row.brand_is_featured !== undefined
        ? !!row.brand_is_featured
        : row.is_featured !== undefined
          ? !!row.is_featured
          : null,
    is_active:
      row.brand_is_active !== undefined
        ? !!row.brand_is_active
        : row.is_active !== undefined
          ? !!row.is_active
          : null,
  };
};

/**
 * Format a brand row for API responses.
 * Resolves logo to a full URL.
 */
const formatRow = (row) => {
  if (!row) return null;
  return {
    ...formatBrandEntity(row),
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? undefined,
  };
};

// ==========================================
// List & read queries
// ==========================================

/**
 * Find a brand by ID (non-deleted).
 * @param {number} id - Brand ID
 * @param {{ raw?: boolean }} [options] - Return raw DB row when raw=true
 * @returns {Promise<Object|undefined>}
 */
const findBrandById = async (id, options = {}) => {
  const row = await db('brands').where({ id }).whereNull('deleted_at').first();
  if (!row || options.raw) return row;
  return formatRow(row);
};

/**
 * Paginated list of brands with optional search and status filters.
 * @param {Object} [filters] - Query filters (search, country, is_popular, is_featured, is_active, page, limit)
 * @returns {Promise<Object>}
 */
const findBrands = async (filters = {}) => {
  const q = db('brands').whereNull('deleted_at');

  if (filters.search) {
    const term = `%${filters.search}%`;
    q.where(function () {
      this.where('name', 'like', term)
        .orWhere('description', 'like', term)
        .orWhere('country', 'like', term);
    });
  }

  if (filters.country) {
    q.where('country', 'like', `%${filters.country}%`);
  }

  if (filters.is_popular !== undefined) {
    q.where('is_popular', filters.is_popular);
  }

  if (filters.is_featured !== undefined) {
    q.where('is_featured', filters.is_featured);
  }

  if (filters.is_active !== undefined) {
    q.where('is_active', filters.is_active);
  }

  applyListSort(q, filters, BRAND_SORT_FIELDS);

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map(formatRow);
  return paginated;
};

// ==========================================
// Create & update
// ==========================================

/**
 * Insert a new brand.
 * @param {Object} data - Brand creation payload
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<Object>}
 */
const createBrand = async (data, userId = null) => {
  const slug = await uniqueSlugForBrand(data.slug || data.name);

  const payload = {
    name: data.name,
    slug,
    description: data.description,
    website: data.website || null,
    country: data.country,
    logo: data.logo || null,
    is_popular: data.is_popular !== undefined ? data.is_popular : false,
    is_featured: data.is_featured !== undefined ? data.is_featured : false,
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_by: userId,
  };

  const [id] = await db('brands').insert(payload);
  return db('brands').where({ id }).whereNull('deleted_at').first();
};

/**
 * Update an existing brand by ID.
 * @param {number} id - Brand ID
 * @param {Object} data - Fields to update
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<Object>}
 */
const updateBrand = async (id, data, userId = null) => {
  const payload = {};

  if (data.name !== undefined) {
    payload.name = data.name;
    if (data.slug === undefined) {
      payload.slug = await uniqueSlugForBrand(data.name, id);
    }
  }

  if (data.slug !== undefined) {
    payload.slug = await uniqueSlugForBrand(data.slug, id);
  }
  if (data.description !== undefined) payload.description = data.description;
  if (data.website !== undefined) payload.website = data.website || null;
  if (data.country !== undefined) payload.country = data.country;
  if (data.logo !== undefined) payload.logo = data.logo;
  if (data.is_popular !== undefined) payload.is_popular = data.is_popular;
  if (data.is_featured !== undefined) payload.is_featured = data.is_featured;
  if (data.is_active !== undefined) payload.is_active = data.is_active;

  if (Object.keys(payload).length === 0) {
    return findBrandById(id);
  }

  payload.updated_by = userId;
  payload.updated_at = db.fn.now();

  await db('brands').where({ id }).update(payload);
  return findBrandById(id);
};

/** Apply logo path updates after file upload (used by brandService). */
const applyBrandMediaUpdates = async (id, updates, userId = null) => {
  if (!updates || !Object.keys(updates).length) {
    return db('brands').where({ id }).whereNull('deleted_at').first();
  }

  await db('brands')
    .where({ id })
    .update({
      ...updates,
      updated_by: userId,
      updated_at: db.fn.now(),
    });

  return db('brands').where({ id }).whereNull('deleted_at').first();
};

// ==========================================
// Delete (soft)
// ==========================================

/**
 * Soft-delete a brand by ID.
 * @param {number} id - Brand ID
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<void>}
 */
const deleteBrand = async (id, userId = null) => {
  await db('brands')
    .where({ id })
    .update({
      deleted_at: db.fn.now(),
      updated_by: userId,
    });
};

module.exports = {
  slugify,
  formatBrandEntity,
  formatRow,
  findBrandById,
  findBrands,
  createBrand,
  updateBrand,
  applyBrandMediaUpdates,
  deleteBrand,
};
