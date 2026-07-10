// Product CRUD handlers with multipart thumbnail upload support.

const productModel = require('../models/productModel');
const productService = require('../services/productService');
const wishlistService = require('../services/wishlistService');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

// ==========================================
// Product Operations
// ==========================================

/** Default values for extended product fields (additive only). */
const PRODUCT_EXTENDED_FIELD_DEFAULTS = {
  category_id: null,
  subcategory_id: null,
  short_description: null,
  description: null,
  material: null,
  country_of_origin: null,
  product_condition: null,
  stock_status: null,
  stock_quantity: null,
  warranty: null,
  hsn_code: null,
  gst_percentage: null,
  show_price: null,
  accept_inquiry: null,
  search_tags: [],
  specifications: [],
};

/** Merge extended product fields onto a list/card payload without changing existing keys. */
const withExtendedProductFields = (product = {}) => ({
  ...PRODUCT_EXTENDED_FIELD_DEFAULTS,
  category_id: product.category_id ?? null,
  subcategory_id: product.subcategory_id ?? null,
  short_description: product.short_description ?? null,
  description: product.description ?? null,
  material: product.material ?? null,
  country_of_origin: product.country_of_origin ?? null,
  product_condition: product.product_condition ?? null,
  stock_status: product.stock_status ?? null,
  stock_quantity: product.stock_quantity ?? null,
  warranty: product.warranty ?? null,
  hsn_code: product.hsn_code ?? null,
  gst_percentage: product.gst_percentage ?? null,
  show_price: product.show_price ?? null,
  accept_inquiry: product.accept_inquiry ?? null,
  search_tags: Array.isArray(product.search_tags) ? product.search_tags : [],
  specifications: Array.isArray(product.specifications) ? product.specifications : [],
});
const pickProductListFilters = (req, extra = {}) => ({
  search: req.query.search,
  brand_id: req.query.brand_id,
  min_price: req.query.min_price,
  max_price: req.query.max_price,
  page: req.query.page,
  limit: req.query.limit,
  sort_by: req.query.sort_by,
  sort_order: req.query.sort_order,
  ...extra,
});

/** Merge is_wishlist filter when query param is present (requires authenticated user). */
const withWishlistFilter = (req, filters) => {
  if (req.query.is_wishlist === undefined) return filters;

  if (!req.user?.id) {
    throw new AppError(
      'Authentication required to filter by is_wishlist',
      HTTP_STATUS.UNAUTHORIZED,
    );
  }

  return {
    ...filters,
    is_wishlist: req.query.is_wishlist === 'true',
    user_id: req.user.id,
  };
};

/** Ensure the user may modify a product (assigned seller or admin). */
const assertCanModifyProduct = async (productId, user) => {
  const existing = await productModel.findProductById(productId, { raw: true });
  if (!existing) {
    throw new AppError('Product not found', HTTP_STATUS.NOT_FOUND);
  }

  const isAdmin = user.role === 'admin';
  if (!isAdmin && String(existing.seller_id) !== String(user.id)) {
    throw new AppError('Forbidden: You can only modify your own products', HTTP_STATUS.FORBIDDEN);
  }

  return existing;
};

/**
 * POST /products
 * Create a new product listing with optional thumbnail upload (seller or admin).
 */
const createProduct = async (req, res, next) => {
  try {
    const product = await productService.createProduct(req.body, req.files, req.user?.id);
    return success(res, 'Product created successfully', product, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /products/:id
 * Retrieve a single product by ID.
 */
const getProduct = async (req, res, next) => {
  try {
    const product = await productModel.findProductDetailById(req.params.id);
    if (!product) {
      return next(new AppError('Product not found', HTTP_STATUS.NOT_FOUND));
    }
    const withWishlist = await wishlistService.attachWishlistToProductDetail(product, req.user?.id);
    return success(res, 'Product details retrieved successfully', withWishlist);
  } catch (err) {
    next(err);
  }
};

const buildProductListFilters = (req, { defaultActiveOnly = true } = {}) => ({
  search: req.query.search,
  category_id: req.query.category_id,
  subcategory_id: req.query.subcategory_id,
  city_id: req.query.city_id,
  brand_id: req.query.brand_id,
  min_price: req.query.min_price,
  max_price: req.query.max_price,
  page: req.query.page,
  limit: req.query.limit,
  sort_by: req.query.sort_by,
  sort_order: req.query.sort_order,
  is_active:
    req.query.is_active !== undefined
      ? req.query.is_active === 'true'
      : defaultActiveOnly
        ? true
        : undefined,
});

/**
 * GET /products
 * List products with search, filters, and pagination.
 */
const getProducts = async (req, res, next) => {
  try {
    const filters = withWishlistFilter(req, buildProductListFilters(req));
    const data = await productModel.findProducts(filters);
    const withWishlist = await wishlistService.attachWishlistToProductList(data, req.user?.id);
    return success(res, 'Products list retrieved successfully', withWishlist);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /products/my
 * List the authenticated seller's own products with the same filters as GET /products.
 */
const getMyProducts = async (req, res, next) => {
  try {
    const filters = withWishlistFilter(req, {
      ...buildProductListFilters(req, { defaultActiveOnly: false }),
      seller_id: req.user.id,
    });
    const data = await productModel.findProducts(filters);
    const withWishlist = await wishlistService.attachWishlistToProductList(data, req.user?.id);
    return success(res, 'Products list retrieved successfully', withWishlist);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /products/trending
 * List products flagged is_trending=true, ordered by id desc (newest first).
 */
const getTrendingProducts = async (req, res, next) => {
  try {
    const filters = withWishlistFilter(
      req,
      pickProductListFilters(req, {
        is_trending: true,
        is_active: true,
        category_id: req.query.category_id,
        subcategory_id: req.query.subcategory_id,
      }),
    );
    const data = await productModel.findProducts(filters);

    const formatted = data.results.map((p) => ({
      id: p.id,
      name: p.name,
      thumbnail: p.thumbnail,
      price: p.price,
      currency: p.currency,
      moq: p.moq,
      unit: p.unit,
      category_id: p.category_id ?? null,
      subcategory_id: p.subcategory_id ?? null,
      seller_id: p.seller_id,
      user_id: p.seller_id,
      seller_name: p.seller_name,
      verified: p.verified,
      rating: p.rating,
      city: p.city,
      state: p.state,
      ...withExtendedProductFields(p),
    }));

    const results = await wishlistService.attachWishlistFlags(formatted, req.user?.id);

    return success(res, 'Trending products retrieved successfully', {
      ...data,
      results,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /products/related
 * List related products for a subcategory (ordered by id desc).
 * Optional product_id excludes that product from results (e.g. current product detail page).
 */
const getRelatedProducts = async (req, res, next) => {
  try {
    const filters = withWishlistFilter(
      req,
      pickProductListFilters(req, {
        subcategory_id: req.query.subcategory_id,
        is_active: true,
      }),
    );

    if (req.query.product_id) {
      filters.exclude_product_id = req.query.product_id;
    }

    const data = await productModel.findProducts(filters);

    const formatted = data.results.map((p) => ({
      id: p.id,
      name: p.name,
      thumbnail: p.thumbnail,
      price: p.price,
      moq: p.moq,
      unit: p.unit,
      category_id: p.category_id ?? null,
      subcategory_id: p.subcategory_id ?? null,
      seller_id: p.seller_id,
      user_id: p.seller_id,
      seller_name: p.seller_name,
      verified: p.verified,
      ...withExtendedProductFields(p),
    }));

    const results = await wishlistService.attachWishlistFlags(formatted, req.user?.id);

    return success(res, 'Related products retrieved successfully', {
      ...data,
      results,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /products/:id
 * Update an existing product with optional thumbnail upload.
 * Only the assigned seller or admin may update the product.
 */
const updateProduct = async (req, res, next) => {
  try {
    const existing = await assertCanModifyProduct(req.params.id, req.user);

    const isAdmin = req.user.role === 'admin';
    if (
      !isAdmin &&
      req.body.seller_id !== undefined &&
      String(req.body.seller_id) !== String(existing.seller_id)
    ) {
      return next(new AppError('Forbidden: Cannot change product seller', HTTP_STATUS.FORBIDDEN));
    }

    const product = await productService.updateProduct(
      req.params.id,
      req.body,
      req.files,
      req.user?.id,
    );
    return success(res, 'Product updated successfully', product);
  } catch (err) {
    next(err);
  }
};

const parseIdArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id));
};

/**
 * DELETE /products/:id/media
 * Remove gallery images and/or videos by ID (DB + S3). Seller or admin only.
 */
const deleteProductMedia = async (req, res, next) => {
  try {
    await assertCanModifyProduct(req.params.id, req.user);

    const result = await productService.deleteProductMedia(req.params.id, {
      imageIds: parseIdArray(req.body.image_ids),
      videoIds: parseIdArray(req.body.video_ids),
    });

    if (!result) {
      return next(new AppError('No matching product media found to delete', HTTP_STATUS.NOT_FOUND));
    }

    return success(res, 'Product media deleted successfully', result);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /products/:id
 * Soft-delete a product (seller or admin).
 */
const deleteProduct = async (req, res, next) => {
  try {
    const existing = await productModel.findProductById(req.params.id);
    if (!existing) {
      return next(new AppError('Product not found', HTTP_STATUS.NOT_FOUND));
    }
    await productModel.deleteProduct(req.params.id, req.user?.id);
    return success(res, 'Product deleted successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createProduct,
  getProduct,
  getProducts,
  getMyProducts,
  getTrendingProducts,
  getRelatedProducts,
  updateProduct,
  deleteProductMedia,
  deleteProduct,
};
