const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const categoryModel = require('./categoryModel');

// ==========================================
// Formatting helpers
// ==========================================

/** Convert a product name to a URL-safe slug. */
const slugify = (text) =>
  text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start
    .replace(/-+$/, ''); // Trim - from end

// ==========================================
// List & read queries
// ==========================================

/**
 * Find a product by ID with supplier, category, brand, and location joins.
 * @param {number} id - Product ID
 * @returns {Promise<Object|null>}
 */
const findProductById = async (id) => {
  const result = await db('products')
    .leftJoin('users as suppliers', 'products.supplier_id', '=', 'suppliers.id')
    .leftJoin('company_details', 'suppliers.id', '=', 'company_details.user_id')
    .leftJoin('categories as subcategories', 'products.subcategory_id', '=', 'subcategories.id')
    .leftJoin('categories', 'subcategories.parent_id', '=', 'categories.id')
    .leftJoin('brands', 'products.brand_id', '=', 'brands.id')
    .leftJoin('addresses', function () {
      this.on('suppliers.id', '=', 'addresses.user_id').andOn('addresses.is_primary', '=', db.raw('?', [true]));
    })
    .leftJoin('cities', 'addresses.city_id', '=', 'cities.id')
    .leftJoin('states', 'addresses.state_id', '=', 'states.id')
    .where('products.id', id)
    .whereNull('products.deleted_at')
    .select(
      'products.*',
      'company_details.company_name as supplier_name',
      'suppliers.is_verified as verified',
      'categories.name as category_name',
      'subcategories.id as subcategory_id',
      'subcategories.name as subcategory_name',
      'brands.name as brand_name',
      'cities.name as city',
      'states.name as state'
    )
    .first();

  if (result) {
    result.verified = !!result.verified;
    result.is_trending = !!result.is_trending;
    result.is_recommended = !!result.is_recommended;
    result.is_active = !!result.is_active;
  }
  return result;
};

/**
 * Paginated list of products with optional filters and sorting.
 * @param {Object} [filters] - Query filters (q, category_id, subcategory_id, brand_id, price range, sort)
 * @returns {Promise<Object>}
 */
const findProducts = async (filters = {}) => {
  const q = db('products')
    .leftJoin('users as suppliers', 'products.supplier_id', '=', 'suppliers.id')
    .leftJoin('company_details', 'suppliers.id', '=', 'company_details.user_id')
    .leftJoin('categories as subcategories', 'products.subcategory_id', '=', 'subcategories.id')
    .leftJoin('addresses', function () {
      this.on('suppliers.id', '=', 'addresses.user_id').andOn('addresses.is_primary', '=', db.raw('?', [true]));
    })
    .leftJoin('cities', 'addresses.city_id', '=', 'cities.id')
    .leftJoin('states', 'addresses.state_id', '=', 'states.id')
    .whereNull('products.deleted_at')
    .select(
      'products.id',
      'products.name',
      'products.slug',
      'products.thumbnail',
      'products.price',
      'products.currency',
      'products.moq',
      'products.unit',
      'company_details.company_name as supplier_name',
      'suppliers.is_verified as verified',
      'products.rating',
      'cities.name as city',
      'states.name as state',
      'products.is_trending',
      'products.is_recommended',
      'products.created_at'
    );

  if (filters.q) {
    q.where('products.name', 'like', `%${filters.q}%`);
  }

  if (filters.category_id) {
    q.where('subcategories.parent_id', filters.category_id);
  }

  if (filters.subcategory_id) {
    q.where('products.subcategory_id', filters.subcategory_id);
  }

  if (filters.brand_id) {
    q.where('products.brand_id', filters.brand_id);
  }

  if (filters.is_trending !== undefined) {
    q.where('products.is_trending', filters.is_trending);
  }

  if (filters.is_recommended !== undefined) {
    q.where('products.is_recommended', filters.is_recommended);
  }

  if (filters.min_price) {
    q.where('products.price', '>=', filters.min_price);
  }

  if (filters.max_price) {
    q.where('products.price', '<=', filters.max_price);
  }

  if (filters.is_active !== undefined) {
    q.where('products.is_active', filters.is_active);
  }

  // Sorting
  if (filters.sort_by === 'price_asc') {
    q.orderBy('products.price', 'asc');
  } else if (filters.sort_by === 'price_desc') {
    q.orderBy('products.price', 'desc');
  } else if (filters.sort_by === 'rating') {
    q.orderBy('products.rating', 'desc');
  } else {
    q.orderBy('products.created_at', 'desc');
  }

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;

  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map(r => ({
    ...r,
    verified: !!r.verified,
    is_trending: !!r.is_trending,
    is_recommended: !!r.is_recommended
  }));
  return paginated;
};

// ==========================================
// Create & update
// ==========================================

/**
 * Insert a new product after validating its subcategory.
 * @param {Object} data - Product creation payload
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<Object>}
 */
const createProduct = async (data, userId = null) => {
  await categoryModel.validateSubcategoryForProduct(data.subcategory_id);

  const payload = {
    name: data.name,
    slug: data.slug ? slugify(data.slug) : slugify(data.name),
    thumbnail: data.thumbnail || null,
    price: data.price,
    currency: data.currency || 'INR',
    moq: data.moq !== undefined ? data.moq : 1,
    unit: data.unit || 'pcs',
    supplier_id: data.supplier_id,
    subcategory_id: data.subcategory_id,
    brand_id: data.brand_id || null,
    is_trending: data.is_trending !== undefined ? data.is_trending : false,
    is_recommended: data.is_recommended !== undefined ? data.is_recommended : false,
    rating: data.rating !== undefined ? data.rating : 0.00,
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_by: userId,
  };

  const [id] = await db('products').insert(payload);
  return findProductById(id);
};

/**
 * Update an existing product by ID.
 * @param {number} id - Product ID
 * @param {Object} data - Fields to update
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<Object>}
 */
const updateProduct = async (id, data, userId = null) => {
  const payload = {};
  if (data.name !== undefined) {
    payload.name = data.name;
    if (!data.slug) payload.slug = slugify(data.name);
  }
  if (data.slug !== undefined) payload.slug = slugify(data.slug);
  if (data.thumbnail !== undefined) payload.thumbnail = data.thumbnail;
  if (data.price !== undefined) payload.price = data.price;
  if (data.currency !== undefined) payload.currency = data.currency;
  if (data.moq !== undefined) payload.moq = data.moq;
  if (data.unit !== undefined) payload.unit = data.unit;
  if (data.supplier_id !== undefined) payload.supplier_id = data.supplier_id;
  if (data.subcategory_id !== undefined) {
    await categoryModel.validateSubcategoryForProduct(data.subcategory_id);
    payload.subcategory_id = data.subcategory_id;
  }
  if (data.brand_id !== undefined) payload.brand_id = data.brand_id;
  if (data.is_trending !== undefined) payload.is_trending = data.is_trending;
  if (data.is_recommended !== undefined) payload.is_recommended = data.is_recommended;
  if (data.rating !== undefined) payload.rating = data.rating;
  if (data.is_active !== undefined) payload.is_active = data.is_active;

  if (Object.keys(payload).length === 0) return findProductById(id);

  payload.updated_by = userId;
  payload.updated_at = db.fn.now();

  await db('products').where({ id }).update(payload);
  return findProductById(id);
};

// ==========================================
// Delete (soft)
// ==========================================

/**
 * Soft-delete a product by ID.
 * @param {number} id - Product ID
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<void>}
 */
const deleteProduct = async (id, userId = null) => {
  await db('products')
    .where({ id })
    .update({
      deleted_at: db.fn.now(),
      updated_by: userId,
    });
};

module.exports = {
  findProductById,
  findProducts,
  createProduct,
  updateProduct,
  deleteProduct,
};
