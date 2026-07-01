const productModel = require('../models/productModel');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

const createProduct = async (req, res, next) => {
  try {
    const product = await productModel.createProduct(req.body, req.user?.id);
    return success(res, 'Product created successfully', product, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

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

const getProducts = async (req, res, next) => {
  try {
    const filters = {
      q: req.query.q,
      category_id: req.query.category_id,
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

const getTrendingProducts = async (req, res, next) => {
  try {
    const filters = {
      is_trending: true,
      is_active: true,
      page: req.query.page,
      limit: req.query.limit,
    };
    const data = await productModel.findProducts(filters);
    
    // Format output as per spec: id, name, thumbnail, price, currency, moq, unit, supplier_name, verified, rating, city, state
    const formatted = data.results.map(p => ({
      id: p.id,
      name: p.name,
      thumbnail: p.thumbnail,
      price: parseFloat(p.price),
      currency: p.currency,
      moq: p.moq,
      unit: p.unit,
      supplier_name: p.supplier_name,
      verified: p.verified,
      rating: parseFloat(p.rating),
      city: p.city,
      state: p.state
    }));

    return success(res, 'Trending products retrieved successfully', formatted);
  } catch (err) {
    next(err);
  }
};

const getRecommendedProducts = async (req, res, next) => {
  try {
    const filters = {
      is_recommended: true,
      is_active: true,
      page: req.query.page,
      limit: req.query.limit,
    };
    const data = await productModel.findProducts(filters);

    // Format output as per spec: id, name, thumbnail, price, moq, unit, supplier_name, verified
    const formatted = data.results.map(p => ({
      id: p.id,
      name: p.name,
      thumbnail: p.thumbnail,
      price: parseFloat(p.price),
      moq: p.moq,
      unit: p.unit,
      supplier_name: p.supplier_name,
      verified: p.verified
    }));

    return success(res, 'Recommended products retrieved successfully', formatted);
  } catch (err) {
    next(err);
  }
};

const getLatestProducts = async (req, res, next) => {
  try {
    const filters = {
      is_active: true,
      page: req.query.page,
      limit: req.query.limit,
    };
    const data = await productModel.findProducts(filters);

    // Format output as per spec: id, name, thumbnail, price, created_at, supplier_name
    const formatted = data.results.map(p => ({
      id: p.id,
      name: p.name,
      thumbnail: p.thumbnail,
      price: parseFloat(p.price),
      created_at: p.created_at,
      supplier_name: p.supplier_name
    }));

    return success(res, 'Latest products retrieved successfully', formatted);
  } catch (err) {
    next(err);
  }
};

const updateProduct = async (req, res, next) => {
  try {
    const existing = await productModel.findProductById(req.params.id);
    if (!existing) {
      return next(new AppError('Product not found', HTTP_STATUS.NOT_FOUND));
    }
    const product = await productModel.updateProduct(req.params.id, req.body, req.user?.id);
    return success(res, 'Product updated successfully', product);
  } catch (err) {
    next(err);
  }
};

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
  getLatestProducts,
  updateProduct,
  deleteProduct,
};
