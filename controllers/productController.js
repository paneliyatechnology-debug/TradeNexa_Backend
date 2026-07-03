// Product CRUD handlers with multipart thumbnail upload support.

const productModel = require('../models/productModel');
const productService = require('../services/productService');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

// ==========================================
// Product Operations
// ==========================================

/** Shared search, filter, sort, and pagination params for product list endpoints. */
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

/** Ensure the user may modify a product (assigned supplier or admin). */
const assertCanModifyProduct = async (productId, user) => {
  const existing = await productModel.findProductById(productId, { raw: true });
  if (!existing) {
    throw new AppError('Product not found', HTTP_STATUS.NOT_FOUND);
  }

  const isAdmin = user.role === 'admin';
  if (!isAdmin && String(existing.supplier_id) !== String(user.id)) {
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
    return success(res, 'Product details retrieved successfully', product);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /products
 * List products with search, filters, and pagination.
 */
const getProducts = async (req, res, next) => {
  try {
    const filters = {
      search: req.query.search,
      category_id: req.query.category_id,
      subcategory_id: req.query.subcategory_id,
      brand_id: req.query.brand_id,
      min_price: req.query.min_price,
      max_price: req.query.max_price,
      page: req.query.page,
      limit: req.query.limit,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
    };
    const data = await productModel.findProducts(filters);
    return success(res, 'Products list retrieved successfully', data);
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
    const filters = pickProductListFilters(req, {
      is_trending: true,
      is_active: true,
      category_id: req.query.category_id,
      subcategory_id: req.query.subcategory_id,
    });
    const data = await productModel.findProducts(filters);

    const formatted = data.results.map((p) => ({
      id: p.id,
      name: p.name,
      thumbnail: p.thumbnail,
      price: p.price,
      currency: p.currency,
      moq: p.moq,
      unit: p.unit,
      supplier_name: p.supplier_name,
      verified: p.verified,
      rating: p.rating,
      city: p.city,
      state: p.state,
    }));

    return success(res, 'Trending products retrieved successfully', {
      ...data,
      results: formatted,
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
    const filters = pickProductListFilters(req, {
      subcategory_id: req.query.subcategory_id,
      is_active: true,
    });

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
      supplier_name: p.supplier_name,
      verified: p.verified,
    }));

    return success(res, 'Related products retrieved successfully', {
      ...data,
      results: formatted,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /products/:id
 * Update an existing product with optional thumbnail upload.
 * Only the assigned supplier or admin may update the product.
 */
const updateProduct = async (req, res, next) => {
  try {
    const existing = await assertCanModifyProduct(req.params.id, req.user);

    const isAdmin = req.user.role === 'admin';
    if (
      !isAdmin &&
      req.body.supplier_id !== undefined &&
      String(req.body.supplier_id) !== String(existing.supplier_id)
    ) {
      return next(new AppError('Forbidden: Cannot change product supplier', HTTP_STATUS.FORBIDDEN));
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
 * Remove gallery images and/or videos by ID (DB + S3). Supplier or admin only.
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
  getTrendingProducts,
  getRelatedProducts,
  updateProduct,
  deleteProductMedia,
  deleteProduct,
};
