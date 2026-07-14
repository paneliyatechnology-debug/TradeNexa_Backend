const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { resolveMediaUrl, deleteStoredFile } = require('../utils/media');
const { formatAddressResponse } = require('../utils/addressFormat');
const categoryModel = require('./categoryModel');
const { formatBrandEntity } = require('./brandModel');

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

/** Parse JSON stored in DB (string or object). */
const parseStoredJson = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

/** Parse search_tags for API responses. */
const formatSearchTags = (value) => {
  const parsed = parseStoredJson(value, []);
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === 'string') {
    return parsed
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
};

/** Strip raw seller address columns after formatting nested `address` object. */
const SELLER_ADDRESS_ROW_KEYS = [
  'address_line_1',
  'address_line_2',
  'pincode',
  'country_id',
  'state_id',
  'city_id',
  'city',
  'state',
  'country',
  'latitude',
  'longitude',
];

const stripSellerAddressRowFields = (row) => {
  SELLER_ADDRESS_ROW_KEYS.forEach((key) => {
    delete row[key];
  });
  return row;
};

/** Join seller primary address with country, state, and city names. */
const applySellerPrimaryAddressJoins = (q) =>
  q
    .leftJoin('addresses', function () {
      this.on('sellers.id', '=', 'addresses.user_id').andOn(
        'addresses.is_primary',
        '=',
        db.raw('?', [true]),
      );
    })
    .leftJoin('cities', 'addresses.city_id', '=', 'cities.id')
    .leftJoin('states', 'addresses.state_id', '=', 'states.id')
    .leftJoin('countries', 'addresses.country_id', '=', 'countries.id');

const SELLER_ADDRESS_SELECT = [
  'addresses.address_line_1',
  'addresses.address_line_2',
  'addresses.pincode',
  'addresses.country_id',
  'addresses.state_id',
  'addresses.city_id',
  'cities.name as city',
  'states.name as state',
  'countries.name as country',
];

/**
 * Format a product row for API responses.
 * Resolves thumbnail to a full URL.
 * Adds extended product fields with null / [] when not stored.
 */
const formatRow = (row) => {
  if (!row) return null;
  const formatted = {
    ...row,
    user_id: row.seller_id ?? row.user_id ?? undefined,
    thumbnail: resolveMediaUrl(row.thumbnail),
    verified: row.verified !== undefined ? !!row.verified : undefined,
    is_trending: row.is_trending !== undefined ? !!row.is_trending : undefined,
    is_active: row.is_active !== undefined ? !!row.is_active : undefined,
    approval_status: row.approval_status ?? undefined,
    review_version:
      row.review_version !== undefined && row.review_version !== null
        ? parseInt(row.review_version, 10)
        : undefined,
    submitted_at: row.submitted_at ?? undefined,
    resubmitted_at: row.resubmitted_at ?? undefined,
    reviewed_at: row.reviewed_at ?? undefined,
    reviewed_by: row.reviewed_by ?? undefined,
    latest_review_remarks: row.latest_review_remarks ?? undefined,
    price: row.price !== undefined ? parseFloat(row.price) : undefined,
    rating: row.rating !== undefined ? parseFloat(row.rating) : undefined,
    short_description: row.short_description ?? null,
    description: row.description ?? null,
    material: row.material ?? null,
    country_of_origin: row.country_of_origin ?? null,
    product_condition: row.product_condition ?? null,
    stock_status: row.stock_status ?? null,
    stock_quantity:
      row.stock_quantity !== undefined && row.stock_quantity !== null
        ? parseInt(row.stock_quantity, 10)
        : null,
    warranty: row.warranty ?? null,
    hsn_code: row.hsn_code ?? null,
    gst_percentage:
      row.gst_percentage !== undefined && row.gst_percentage !== null
        ? parseFloat(row.gst_percentage)
        : null,
    show_price: row.show_price !== undefined && row.show_price !== null ? !!row.show_price : null,
    accept_inquiry:
      row.accept_inquiry !== undefined && row.accept_inquiry !== null ? !!row.accept_inquiry : null,
    search_tags: formatSearchTags(row.search_tags),
    specifications: parseStoredJson(row.specifications, []),
    category_id: row.category_id ?? null,
    subcategory_id: row.subcategory_id ?? null,
    is_wishlist: row.is_wishlist !== undefined ? !!row.is_wishlist : false,
    address: formatAddressResponse(row),
  };
  return stripSellerAddressRowFields(formatted);
};

/** Named entity with id + name; always returned as an object in product detail. */
const formatNamedEntity = (id, name) => ({
  id: id ?? null,
  name: name ?? null,
});

/** Seller block with a stable key set for product detail responses. */
const formatSellerDetail = (row) => ({
  id: row?.seller_id ?? null,
  user_id: row?.seller_id ?? null,
  company: {
    name: row?.seller_name ?? null,
    logo: row?.company_logo ? resolveMediaUrl(row.company_logo) : null,
    business_type: row?.business_type_name ?? null,
    year_established: null,
    experience_years:
      row?.years_in_business !== undefined && row?.years_in_business !== null
        ? parseInt(row.years_in_business, 10)
        : null,
  },
  rating: {
    average:
      row?.seller_rating !== undefined && row?.seller_rating !== null
        ? parseFloat(row.seller_rating)
        : null,
    total_reviews: null,
  },
  contact: {
    show_phone: null,
    show_email: null,
    phone: row?.seller_phone ?? null,
    whatsapp: null,
    email: row?.seller_email ?? null,
    website: null,
  },
  address: formatAddressResponse(row),
  social_links: {
    website: null,
    facebook: null,
  },
});

/** Build nested product detail response with a consistent key set. */
const formatProductDetail = (row, images = [], videos = []) => {
  if (!row) return null;

  return {
    id: row.id ?? null,
    slug: row.slug ?? null,
    category_id: row.category_id ?? null,
    subcategory_id: row.subcategory_id ?? null,
    basic_details: {
      name: row.name ?? null,
      short_description: row.short_description ?? null,
      description: row.description ?? null,
      brand: formatBrandEntity(row),
      category: formatNamedEntity(row.category_id, row.category_name),
      subcategory: formatNamedEntity(row.subcategory_id, row.subcategory_name),
      country_of_origin: row.country_of_origin ?? null,
      material: row.material ?? null,
      product_condition: row.product_condition ?? null,
    },
    pricing: {
      price: row.price !== undefined && row.price !== null ? parseFloat(row.price) : null,
      currency: row.currency ?? null,
      price_type: null,
      minimum_order_quantity:
        row.moq !== undefined && row.moq !== null ? parseInt(row.moq, 10) : null,
      unit: row.unit ?? null,
      gst_percentage:
        row.gst_percentage !== undefined && row.gst_percentage !== null
          ? parseFloat(row.gst_percentage)
          : null,
      gst_included: null,
      hsn_code: row.hsn_code ?? null,
      show_price: row.show_price !== undefined ? !!row.show_price : null,
    },
    inventory: {
      stock_status: row.stock_status ?? null,
      stock_quantity:
        row.stock_quantity !== undefined && row.stock_quantity !== null
          ? parseInt(row.stock_quantity, 10)
          : null,
    },
    images: {
      thumbnail: row.thumbnail ? resolveMediaUrl(row.thumbnail) : null,
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
    seller: formatSellerDetail(row),
    marketplace: {
      is_featured: null,
      is_trending: row.is_trending !== undefined ? !!row.is_trending : null,
      is_related: null,
      share_url: null,
      accept_inquiry: row.accept_inquiry !== undefined ? !!row.accept_inquiry : null,
      is_active: row.is_active !== undefined ? !!row.is_active : null,
    },
    approval: {
      status: row.approval_status ?? null,
      review_version:
        row.review_version !== undefined && row.review_version !== null
          ? parseInt(row.review_version, 10)
          : null,
      submitted_at: row.submitted_at ?? null,
      resubmitted_at: row.resubmitted_at ?? null,
      reviewed_at: row.reviewed_at ?? null,
      reviewed_by: row.reviewed_by ?? null,
      latest_review_remarks: row.latest_review_remarks ?? null,
      can_resubmit: row.approval_status === 'revision_required', // seller should PUT /products/:id to resubmit
    },
    user_actions: {
      is_favourite: false,
      is_wishlist: false,
      is_inquiry_sent: null,
      can_contact_seller: null,
      can_buy: null,
    },
    ratings: {
      average:
        row.rating !== undefined && row.rating !== null ? parseFloat(row.rating) : null,
      total_reviews: null,
      breakdown: null,
    },
    reviews: [],
    warranty: row.warranty ?? null,
    search_tags: formatSearchTags(row.search_tags),
    specifications: parseStoredJson(row.specifications, []),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
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
  updated_at: 'products.updated_at',
  submitted_at: 'products.submitted_at',
  reviewed_at: 'products.reviewed_at',
  seller_name: 'company_details.company_name',
};

/** Apply field-wise sort (default: id desc). */
const applyProductListSort = (q, filters) => {
  const sortBy =
    filters.sort_by && PRODUCT_SORT_FIELDS[filters.sort_by] ? filters.sort_by : 'id';
  const sortOrder = filters.sort_order === 'asc' ? 'asc' : 'desc';
  q.orderBy(PRODUCT_SORT_FIELDS[sortBy], sortOrder);
};

/**
 * Filter products by whether they are in the user's wishlist.
 * Requires authenticated user_id in filters.
 */
const applyWishlistFilterToQuery = (q, userId, isWishlist) => {
  if (isWishlist) {
    q.innerJoin('wishlist as user_wishlist', function () {
      this.on('user_wishlist.product_id', '=', 'products.id').andOn(
        'user_wishlist.user_id',
        '=',
        db.raw('?', [userId]),
      );
    });
    return;
  }

  q.whereNotExists(function () {
    this.select(db.raw('1'))
      .from('wishlist as user_wishlist')
      .whereRaw('user_wishlist.product_id = products.id')
      .where('user_wishlist.user_id', userId);
  });
};

/**
 * Find a product by ID with seller, category, brand, and location joins.
 * @param {number} id - Product ID
 * @param {{ raw?: boolean }} [options] - Return raw DB row when raw=true
 * @returns {Promise<Object|null>}
 */
const findProductById = async (id, options = {}) => {
  const result = await applySellerPrimaryAddressJoins(
    db('products')
      .leftJoin('users as sellers', 'products.seller_id', '=', 'sellers.id')
      .leftJoin('company_details', 'sellers.id', '=', 'company_details.user_id')
      .leftJoin('categories as subcategories', 'products.subcategory_id', '=', 'subcategories.id')
      .leftJoin('categories', 'products.category_id', '=', 'categories.id')
      .leftJoin('brands', 'products.brand_id', '=', 'brands.id'),
  )
    .where('products.id', id)
    .whereNull('products.deleted_at')
    .select(
      'products.*',
      'company_details.company_name as seller_name',
      'sellers.is_verified as verified',
      'categories.name as category_name',
      'subcategories.name as subcategory_name',
      'brands.name as brand_name',
      ...SELLER_ADDRESS_SELECT,
    )
    .first();

  if (!result || options.raw) return result;
  return formatRow(result);
};

/** Base product detail query with seller, category, brand, and address joins. */
const buildProductDetailQuery = () =>
  applySellerPrimaryAddressJoins(
    db('products')
      .leftJoin('users as sellers', 'products.seller_id', '=', 'sellers.id')
      .leftJoin('company_details', 'sellers.id', '=', 'company_details.user_id')
      .leftJoin('business_types', 'company_details.business_type_id', '=', 'business_types.id')
      .leftJoin('categories as subcategories', 'products.subcategory_id', '=', 'subcategories.id')
      .leftJoin('categories', 'products.category_id', '=', 'categories.id')
      .leftJoin('brands', 'products.brand_id', '=', 'brands.id'),
  ).whereNull('products.deleted_at');

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
      'company_details.company_name as seller_name',
      'company_details.company_logo',
      'company_details.years_in_business',
      'company_details.rating as seller_rating',
      'sellers.mobile_number as seller_phone',
      'sellers.email as seller_email',
      'categories.name as category_name',
      'subcategories.name as subcategory_name',
      'brands.name as brand_name',
      'brands.slug as brand_slug',
      'brands.description as brand_description',
      'brands.website as brand_website',
      'brands.country as brand_country',
      'brands.logo as brand_logo',
      'brands.is_popular as brand_is_popular',
      'brands.is_featured as brand_is_featured',
      'brands.is_active as brand_is_active',
      'business_types.name as business_type_name',
      ...SELLER_ADDRESS_SELECT,
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

/** Count gallery images and videos stored for a product. */
const countProductMedia = async (productId) => {
  const [imageCount, videoCount] = await Promise.all([
    db('product_images').where({ product_id: productId }).count('* as count').first(),
    db('product_videos').where({ product_id: productId }).count('* as count').first(),
  ]);

  return {
    images: parseInt(imageCount?.count || 0, 10),
    videos: parseInt(videoCount?.count || 0, 10),
  };
};

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
 * @param {Object} [filters] - Query filters (search, category_id, subcategory_id, city_id, brand_id, price range, sort)
 * @returns {Promise<Object>}
 */
const findProducts = async (filters = {}) => {
  const q = applySellerPrimaryAddressJoins(
    db('products')
      .leftJoin('users as sellers', 'products.seller_id', '=', 'sellers.id')
      .leftJoin('company_details', 'sellers.id', '=', 'company_details.user_id')
      .leftJoin('categories as subcategories', 'products.subcategory_id', '=', 'subcategories.id')
      .leftJoin('categories', 'products.category_id', '=', 'categories.id')
      .leftJoin('brands', 'products.brand_id', '=', 'brands.id'),
  )
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
      'products.seller_id',
      'products.category_id',
      'products.subcategory_id',
      'company_details.company_name as seller_name',
      'categories.name as category_name',
      'subcategories.name as subcategory_name',
      'sellers.is_verified as verified',
      'products.rating',
      ...SELLER_ADDRESS_SELECT,
      'products.is_trending',
      'products.is_active',
      'products.approval_status',
      'products.review_version',
      'products.submitted_at',
      'products.resubmitted_at',
      'products.reviewed_at',
      'products.reviewed_by',
      'products.latest_review_remarks',
      'products.created_at',
    );

  if (filters.search) {
    const term = `%${filters.search}%`;
    if (filters.admin_search) {
      q.where(function () {
        this.where('products.name', 'like', term)
          .orWhere('products.id', parseInt(filters.search, 10) || 0)
          .orWhere('company_details.company_name', 'like', term)
          .orWhere('sellers.full_name', 'like', term)
          .orWhere('categories.name', 'like', term)
          .orWhere('brands.name', 'like', term);
      });
    } else {
      q.where('products.name', 'like', term);
    }
  }

  if (filters.category_id) {
    q.where('products.category_id', filters.category_id);
  }

  if (filters.subcategory_id) {
    q.where('products.subcategory_id', filters.subcategory_id);
  }

  if (filters.city_id) {
    q.where('addresses.city_id', filters.city_id);
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

  // Public marketplace: only approved products (is_active usually also applied by caller)
  if (filters.public_only) {
    q.where('products.approval_status', 'approved');
  } else if (filters.approval_status) {
    // Seller my-list / admin queue status filter
    q.where('products.approval_status', filters.approval_status);
  }

  if (filters.seller_id) {
    q.where('products.seller_id', filters.seller_id);
  }

  if (filters.exclude_seller_id) {
    q.whereNot('products.seller_id', filters.exclude_seller_id);
  }

  if (filters.exclude_product_id) {
    q.whereNot('products.id', filters.exclude_product_id);
  }

  if (filters.is_wishlist !== undefined && filters.user_id) {
    applyWishlistFilterToQuery(q, filters.user_id, filters.is_wishlist);
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

const buildProductPayload = (data, { forCreate = false } = {}) => {
  const payload = {};

  if (data.name !== undefined) {
    payload.name = data.name;
    if (forCreate || !data.slug) payload.slug = slugify(data.slug || data.name);
  } else if (data.slug !== undefined) {
    payload.slug = slugify(data.slug);
  }

  const assign = (field, transform = (v) => v) => {
    if (data[field] !== undefined) payload[field] = transform(data[field]);
  };

  assign('thumbnail');
  assign('price');
  assign('currency');
  assign('moq');
  assign('unit');
  assign('seller_id');
  assign('category_id');
  assign('subcategory_id');
  assign('brand_id');
  assign('short_description');
  assign('description');
  assign('material');
  assign('country_of_origin');
  assign('product_condition');
  assign('stock_status');
  assign('warranty');
  assign('stock_quantity');
  assign('hsn_code');
  assign('gst_percentage');
  assign('search_tags');
  assign('specifications');
  assign('is_trending', (v) => !!v);
  assign('show_price', (v) => !!v);
  assign('accept_inquiry', (v) => !!v);
  assign('is_active', (v) => !!v);
  assign('rating');
  // approval_status / review_* are owned by productReviewService — never set from client body

  return payload;
};

const resolveProductCategoryId = async (data) => {
  if (data.category_id !== undefined) {
    await categoryModel.validateCategorySubcategoryMatch(data.category_id, data.subcategory_id);
    return data.category_id;
  }
  const subcategory = await categoryModel.validateSubcategoryForProduct(data.subcategory_id);
  return subcategory.parent_id;
};

/**
 * Insert a new product after validating its subcategory.
 * @param {Object} data - Product creation payload
 * @param {number|null} [userId] - Acting user ID for audit fields
 * @returns {Promise<Object>}
 */
const createProduct = async (data, userId = null) => {
  const categoryId = await resolveProductCategoryId(data);

  const payload = {
    ...buildProductPayload(data, { forCreate: true }),
    category_id: categoryId,
    currency: data.currency || 'INR',
    moq: data.moq !== undefined ? data.moq : 1,
    unit: data.unit || 'pcs',
    is_trending: data.is_trending !== undefined ? !!data.is_trending : false,
    rating: data.rating !== undefined ? data.rating : 0.0,
    is_active: data.is_active !== undefined ? !!data.is_active : true,
    show_price: data.show_price !== undefined ? !!data.show_price : true,
    accept_inquiry: data.accept_inquiry !== undefined ? !!data.accept_inquiry : true,
    stock_status: data.stock_status || 'IN_STOCK',
    approval_status: 'in_review',
    review_version: 1,
    submitted_at: db.fn.now(),
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
  const payload = buildProductPayload(data);

  if (data.subcategory_id !== undefined) {
    payload.category_id = await resolveProductCategoryId(data);
  } else if (data.category_id !== undefined) {
    const existing = await db('products').where({ id }).select('subcategory_id').first();
    if (existing?.subcategory_id) {
      await categoryModel.validateCategorySubcategoryMatch(data.category_id, existing.subcategory_id);
    }
    payload.category_id = data.category_id;
  }

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
  countProductMedia,
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
