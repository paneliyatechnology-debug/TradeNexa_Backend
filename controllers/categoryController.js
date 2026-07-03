// Category and subcategory CRUD handlers with multipart upload support.

const categoryService = require('../services/categoryService');
const categoryModel = require('../models/categoryModel');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

// ==========================================
// Main categories
// ==========================================

/**
 * POST /categories
 * Create a new main category with optional icon and image uploads.
 */
const createCategory = async (req, res, next) => {
  try {
    const category = await categoryService.createCategory(req.body, req.files, req.user?.id);
    return success(res, 'Category created successfully', category, HTTP_STATUS.CREATED);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Category name already exists', HTTP_STATUS.CONFLICT));
    }
    next(err);
  }
};

/**
 * GET /categories/:id
 * Retrieve a category with its subcategories.
 */
const getCategory = async (req, res, next) => {
  try {
    const category = await categoryModel.getCategoryWithSubcategories(req.params.id);
    if (!category) {
      return next(new AppError('Category not found', HTTP_STATUS.NOT_FOUND));
    }
    return success(res, 'Category details retrieved successfully', category);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /categories
 * List main categories with search and pagination.
 */
const getCategories = async (req, res, next) => {
  try {
    const filters = {
      search: req.query.search,
      slug: req.query.slug,
      page: req.query.page,
      limit: req.query.limit,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
    };
    const data = await categoryModel.findCategories(filters);
    return success(res, 'Categories list retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /categories/:id
 * Update a main category with optional icon and image uploads.
 */
const updateCategory = async (req, res, next) => {
  try {
    const category = await categoryService.updateCategory(
      req.params.id,
      req.body,
      req.files,
      req.user?.id,
    );
    return success(res, 'Category updated successfully', category);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Category already exists', HTTP_STATUS.CONFLICT));
    }
    next(err);
  }
};

/**
 * DELETE /categories/:id
 * Soft-delete a main category (admin only).
 */
const deleteCategory = async (req, res, next) => {
  try {
    await categoryModel.deleteCategory(req.params.id, req.user?.id);
    return success(res, 'Category deleted successfully');
  } catch (err) {
    next(err);
  }
};

// ==========================================
// Subcategories
// ==========================================

/**
 * POST /categories/:categoryId/subcategories
 * Create a subcategory under a main category with optional uploads.
 */
const createSubcategory = async (req, res, next) => {
  try {
    const subcategory = await categoryService.createSubcategory(
      req.params.categoryId,
      req.body,
      req.files,
      req.user?.id,
    );
    return success(res, 'Subcategory created successfully', subcategory, HTTP_STATUS.CREATED);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Subcategory name or slug already exists', HTTP_STATUS.CONFLICT));
    }
    next(err);
  }
};

/**
 * GET /categories/:categoryId/subcategories/:id
 * Retrieve a single subcategory scoped to a parent category.
 */
const getSubcategory = async (req, res, next) => {
  try {
    const subcategory = await categoryModel.getSubcategoryDetail(req.params.id);
    if (!subcategory || String(subcategory.category_id) !== String(req.params.categoryId)) {
      return next(new AppError('Subcategory not found', HTTP_STATUS.NOT_FOUND));
    }
    return success(res, 'Subcategory details retrieved successfully', subcategory);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /categories/:categoryId/subcategories
 * List subcategories for a main category with search and pagination.
 */
const getSubcategories = async (req, res, next) => {
  try {
    const filters = {
      search: req.query.search,
      slug: req.query.slug,
      page: req.query.page,
      limit: req.query.limit,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
    };
    const data = await categoryModel.findSubcategories(req.params.categoryId, filters);
    return success(res, 'Subcategories list retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /categories/:categoryId/subcategories/:id
 * Update a subcategory with optional uploads.
 */
const updateSubcategory = async (req, res, next) => {
  try {
    const subcategory = await categoryService.updateSubcategory(
      req.params.categoryId,
      req.params.id,
      req.body,
      req.files,
      req.user?.id,
    );
    return success(res, 'Subcategory updated successfully', subcategory);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Subcategory already exists', HTTP_STATUS.CONFLICT));
    }
    next(err);
  }
};

/**
 * DELETE /categories/:categoryId/subcategories/:id
 * Soft-delete a subcategory (admin only).
 */
const deleteSubcategory = async (req, res, next) => {
  try {
    await categoryModel.deleteSubcategory(req.params.categoryId, req.params.id, req.user?.id);
    return success(res, 'Subcategory deleted successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createCategory,
  getCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  createSubcategory,
  getSubcategory,
  getSubcategories,
  updateSubcategory,
  deleteSubcategory,
};
