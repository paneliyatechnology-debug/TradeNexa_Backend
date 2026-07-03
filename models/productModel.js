const db = require('../database/knex');
const config = require('../config');
const { paginate } = require('../utils/pagination');
const { resolveMediaUrl, deleteStoredFile } = require('../utils/media');
const categoryModel = require('./categoryModel');

// ==========================================
// Formatting helpers
// ==========================================

/** Convert a product name to a URL-safe slug. */
const slugify = (text) =>
  text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

/**
 * Format a product row for API responses.
 * Resolves thumbnail to a full URL.
 */
const formatRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    thumbnail: resolveMediaUrl(row.thumbnail),
    verified: row.verified !== undefined ? !!row.verified : undefined,
    is_trending: row.is_trending !== undefined ? !!row.is_trending : undefined,
    is_active: row.is_active !== undefined ? !!row.is_active : undefined,
    price: row.price !== undefined ? parseFloat(row.price) : undefined,
    rating: row.rating !== undefined ? parseFloat(row.rating) : undefined,
  };
};

/** Build nested product detail response; null for fields not stored in DB. */
const formatProductDetail = (row, images = [], videos = []) => {
  if (!row) return null;

  const baseUrl = (config.app.url || '').replace(/\/$/, '');
  const shareUrl = row.slug ? `${baseUrl}/product/${row.slug}` : null;

  return {
    id: row.id,
    slug: row.slug,
    basic_details: {
      name: row.name,
      short_description: null,
      description: null,
      brand: row.brand_id
        ? { id: row.brand_id, name: row.brand_name || null }
        : null,
      category: row.category_id
        ? { id: row.category_id, name: row.category_name || null }
        : null,
      subcategory: row.subcategory_id
        ? { id: row.subcategory_id, name: row.subcategory_name || null }
        : null,
      country_of_origin: null,
    },
    pricing: {
      price: row.price !== undefined ? parseFloat(row.price) : null,
      price_type: null,
      minimum_order_quantity: row.moq !== undefined ? parseInt(row.moq, 10) : null,
      unit: row.unit || null,
      gst_percentage: null,
      gst_included: null,
      hsn_code: null,
    },
    images: {
      thumbnail: resolveMediaUrl(row.thumbnail),
      gallery: images.map((image) => ({
        id: image.id,
        url: resolveMediaUrl(image.path),
        is_primary: !!image.is_primary,
      })),
    },
    videos: videos.map((video) => ({
      id: video.id,
      url: resolveMediaUrl(video.path),
    })),
    seller: row.supplier_id
      ? {
          id: row.supplier_id,
          company: {
            name: row.supplier_name || null,
            logo: resolveMediaUrl(row.company_logo),
            business_type: row.business_type_name || null,
            year_established: null,
            experience_years:
              row.years_in_business !== undefined && row.years_in_business !== null
                ? parseInt(row.years_in_business, 10)
                : null,
          },
          rating: {
            average:
              row.supplier_rating !== undefined && row.supplier_rating !== null
                ? parseFloat(row.supplier_rating)
                : null,
            total_reviews: null,
          },
          contact: {
            show_phone: null,
            show_email: null,
            phone: row.supplier_phone || null,
            whatsapp: null,
            email: row.supplier_email || null,
            website: null,
          },
          location: {
            address: row.address_line_1 || null,
            city: row.city || null,
            state: row.state || null,
            country: row.country || null,
            postal_code: row.pincode || null,
            latitude:
              row.latitude !== undefined && row.latitude !== null
                ? parseFloat(row.latitude)
                : null,
            longitude:
              row.longitude !== undefined && row.longitude !== null
                ? parseFloat(row.longitude)
                : null,
          },
          social_links: {
            website: null,
            facebook: null,
          },
        }
      : null,
    marketplace: {
      is_featured: null,
      is_trending: row.is_trending !== undefined ? !!row.is_trending : null,
      is_recommended: null,
      share_url: shareUrl,
    },
    user_actions: {
      is_favourite: null,
      is_inquiry_sent: null,
      can_contact_seller: null,
      can_buy: null,
    },
    ratings: {
      average: row.rating !== undefined ? parseFloat(row.rating) : null,
      total_reviews: null,
      breakdown: null,
    },
    reviews: null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
};

// ==========================================
// List & read queries
// ==========================================

const PRODUCT_SORT_FIELDS = {
  id: 'products.id',
  name: 'products.name',
  slug: 'products.slug',
  price: 'products.price',
  moq: 'products.moq',
  rating: 'products.rating',
  is_trending: 'products.is_trending',
  created_at: 'products.created_at',
  supplier_name: 'company_details.company_name',
};

/** Apply field-wise sort (default: id desc). */
const applyProductListSort = (q, filters) => {
  const sortBy =
    filters.sort_by && PRODUCT_SORT_FIELDS[filters.sort_by] ? filters.sort_by : 'id';
  const sortOrder = filters.sort_order === 'asc' ? 'asc' : 'desc';
  q.orderBy(PRODUCT_SORT_FIELDS[sortBy], sortOrder);
};

/**
 * Find a product by ID with supplier, category, brand, and location joins.
 * @param {number} id - Product ID
 * @param {{ raw?: boolean }} [options] - Return raw DB row when raw=true
 * @returns {Promise<Object|null>}
 */
const findProductById = async (id, options = {}) => {
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
      'states.name as state',
    )
    .first();

  if (!result || options.raw) return result;
  return formatRow(result);
};

/** Base product detail query with seller, category, brand, and address joins. */
const buildProductDetailQuery = () =>
  db('products')
    .leftJoin('users as suppliers', 'products.supplier_id', '=', 'suppliers.id')
    .leftJoin('company_details', 'suppliers.id', '=', 'company_details.user_id')
    .leftJoin('business_types', 'company_details.business_type_id', '=', 'business_types.id')
    .leftJoin('categories as subcategories', 'products.subcategory_id', '=', 'subcategories.id')
    .leftJoin('categories', 'subcategories.parent_id', '=', 'categories.id')
    .leftJoin('brands', 'products.brand_id', '=', 'brands.id')
    .leftJoin('addresses', function () {
      this.on('suppliers.id', '=', 'addresses.user_id').andOn('addresses.is_primary', '=', db.raw('?', [true]));
    })
    .leftJoin('cities', 'addresses.city_id', '=', 'cities.id')
    .leftJoin('states', 'addresses.state_id', '=', 'states.id')
    .leftJoin('countries', 'addresses.country_id', '=', 'countries.id')
    .whereNull('products.deleted_at');

/**
 * Find a product by ID with full detail for the single-product API response.
 * @param {number} id - Product ID
 * @returns {Promise<Object|null>}
 */
const findProductDetailById = async (id) => {
  const row = await buildProductDetailQuery()
    .where('products.id', id)
    .select(
      'products.*',
      'company_details.company_name as supplier_name',
      'company_details.company_logo',
      'company_details.years_in_business',
      'company_details.rating as supplier_rating',
      'suppliers.mobile_number as supplier_phone',
      'suppliers.email as supplier_email',
      'categories.id as category_id',
      'categories.name as category_name',
      'subcategories.name as subcategory_name',
      'brands.name as brand_name',
      'business_types.name as business_type_name',
      'addresses.address_line_1',
      'addresses.pincode',
      'addresses.latitude',
      'addresses.longitude',
      'cities.name as city',
      'states.name as state',
      'countries.name as country',
    )
    .first();

  if (!row) return null;

  const images = await findProductImages(id);
  const videos = await findProductVideos(id);
  return formatProductDetail(row, images, videos);
};

/** List gallery images for a product ordered by sort_order then id. */
const findProductImages = (productId) =>
  db('product_images')
    .where({ product_id: productId })
    .orderBy('sort_order', 'asc')
    .orderBy('id', 'asc')
    .select('id', 'path', 'is_primary', 'sort_order');

/** List videos for a product ordered by sort_order then id. */
const findProductVideos = (productId) =>
  db('product_videos')
    .where({ product_id: productId })
    .orderBy('sort_order', 'asc')
    .orderBy('id', 'asc')
    .select('id', 'title', 'path', 'sort_order');

/** Insert gallery image rows for a product. */
const insertProductImages = async (productId, paths = []) => {
  if (!paths.length) return [];

  const existingCount = await db('product_images')
    .where({ product_id: productId })
    .count('* as count')
    .first();
  const hasPrimary = await db('product_images')
    .where({ product_id: productId, is_primary: true })
    .first();
  const startOrder = parseInt(existingCount?.count || 0, 10);

  const rows = paths.map((imagePath, index) => ({
    product_id: productId,
    path: imagePath,
    is_primary: !hasPrimary && index === 0,
    sort_order: startOrder + index,
  }));

  await db('product_images').insert(rows);
  return findProductImages(productId);
};

/** Insert video rows for a product. */
const insertProductVideos = async (productId, paths = []) => {
  if (!paths.length) return [];

  const existingCount = await db('product_videos')
    .where({ product_id: productId })
    .count('* as count')
    .first();
  const startOrder = parseInt(existingCount?.count || 0, 10);

  const rows = paths.map((videoPath, index) => ({
    product_id: productId,
    title: null,
    path: videoPath,
    sort_order: startOrder + index,
  }));

  await db('product_videos').insert(rows);
  return findProductVideos(productId);
};

/** Find a gallery image belonging to a product. */
const findProductImageById = (productId, imageId) =>
  db('product_images')
    .where({ id: imageId, product_id: productId })
    .first();

/** Find a video belonging to a product. */
const findProductVideoById = (productId, videoId) =>
  db('product_videos')
    .where({ id: videoId, product_id: productId })
    .first();

/**
 * Delete a gallery image from DB and storage (S3 or local).
 * Promotes the next image to primary when the deleted one was primary.
 */
const deleteProductImage = async (productId, imageId) => {
  const image = await findProductImageById(productId, imageId);
  if (!image) return null;

  await deleteStoredFile(image.path);
  await db('product_images').where({ id: imageId, product_id: productId }).del();

  if (image.is_primary) {
    const next = await db('product_images')
      .where({ product_id: productId })
      .orderBy('sort_order', 'asc')
      .orderBy('id', 'asc')
      .first();
    if (next) {
      await db('product_images').where({ id: next.id }).update({ is_primary: true });
    }
  }

  return image;
};

/** Delete a video from DB and storage (S3 or local). */
const deleteProductVideo = async (productId, videoId) => {
  const video = await findProductVideoById(productId, videoId);
  if (!video) return null;

  await deleteStoredFile(video.path);
  await db('product_videos').where({ id: videoId, product_id: productId }).del();
  return video;
};

/**
 * Paginated list of products with optional filters and sorting.
 * @param {Object} [filters] - Query filters (search, category_id, subcategory_id, brand_id, price range, sort)
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
      'products.created_at',
    );

  if (filters.search) {
    q.where('products.name', 'like', `%${filters.search}%`);
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

  if (filters.min_price) {
    q.where('products.price', '>=', filters.min_price);
  }

  if (filters.max_price) {
    q.where('products.price', '<=', filters.max_price);
  }

  if (filters.is_active !== undefined) {
    q.where('products.is_active', filters.is_active);
  }

  if (filters.exclude_product_id) {
    q.whereNot('products.id', filters.exclude_product_id);
  }

  applyProductListSort(q, filters);

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
    rating: data.rating !== undefined ? data.rating : 0.0,
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_by: userId,
  };

  const [id] = await db('products').insert(payload);
  return db('products').where({ id }).whereNull('deleted_at').first();
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
  if (data.rating !== undefined) payload.rating = data.rating;
  if (data.is_active !== undefined) payload.is_active = data.is_active;

  if (Object.keys(payload).length === 0) return findProductById(id);

  payload.updated_by = userId;
  payload.updated_at = db.fn.now();

  await db('products').where({ id }).update(payload);
  return findProductById(id);
};

/** Apply thumbnail path updates after file upload (used by productService). */
const applyProductMediaUpdates = async (id, updates, userId = null) => {
  if (!updates || !Object.keys(updates).length) {
    return db('products').where({ id }).whereNull('deleted_at').first();
  }

  await db('products')
    .where({ id })
    .update({
      ...updates,
      updated_by: userId,
      updated_at: db.fn.now(),
    });

  return db('products').where({ id }).whereNull('deleted_at').first();
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
  formatRow,
  formatProductDetail,
  findProductById,
  findProductDetailById,
  findProductImages,
  findProductVideos,
  insertProductImages,
  insertProductVideos,
  findProductImageById,
  findProductVideoById,
  deleteProductImage,
  deleteProductVideo,
  findProducts,
  createProduct,
  updateProduct,
  applyProductMediaUpdates,
  deleteProduct,
};
