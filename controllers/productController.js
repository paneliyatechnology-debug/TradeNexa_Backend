// Product CRUD handlers with multipart thumbnail upload support.

const productModel = require('../models/productModel');
const productService = require('../services/productService');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

// ==========================================
// Product Operations
// ==========================================

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
    const product = await productModel.findProductById(req.params.id);
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
      q: req.query.q,
      category_id: req.query.category_id,
      subcategory_id: req.query.subcategory_id,
      brand_id: req.query.brand_id,
      min_price: req.query.min_price,
      max_price: req.query.max_price,
      page: req.query.page,
      limit: req.query.limit,
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
 * List trending products ordered by id desc (newest first).
 */
const getTrendingProducts = async (req, res, next) => {
  try {
    const filters = {
      is_trending: true,
      is_active: true,
      page: req.query.page,
      limit: req.query.limit,
    };
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
 * GET /products/recommended
 * List recommended products for a subcategory (ordered by id desc).
 * Optional product_id excludes that product from results (e.g. current product detail page).
 */
const getRecommendedProducts = async (req, res, next) => {
  try {
    const filters = {
      subcategory_id: req.query.subcategory_id,
      is_active: true,
      page: req.query.page,
      limit: req.query.limit,
    };

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

    return success(res, 'Recommended products retrieved successfully', {
      ...data,
      results: formatted,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /products/:id
 * Update an existing product with optional thumbnail upload (seller or admin).
 */
const updateProduct = async (req, res, next) => {
  try {
    const existing = await productModel.findProductById(req.params.id);
    if (!existing) {
      return next(new AppError('Product not found', HTTP_STATUS.NOT_FOUND));
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
  getRecommendedProducts,
  updateProduct,
  deleteProduct,
};
