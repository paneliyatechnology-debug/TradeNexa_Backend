const categoryModel = require('../models/categoryModel');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

const createCategory = async (req, res, next) => {
  try {
    const category = await categoryModel.createCategory(req.body, req.user?.id);
    return success(res, 'Category created successfully', category, HTTP_STATUS.CREATED);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Category name already exists', HTTP_STATUS.CONFLICT));
    }
    next(err);
  }
};

const getCategory = async (req, res, next) => {
  try {
    const category = await categoryModel.findCategoryById(req.params.id);
    if (!category) {
      return next(new AppError('Category not found', HTTP_STATUS.NOT_FOUND));
    }
    return success(res, 'Category details retrieved successfully', category);
  } catch (err) {
    next(err);
  }
};

const getCategories = async (req, res, next) => {
  try {
    const filters = {
      q: req.query.q,
      page: req.query.page,
      limit: req.query.limit,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
    };
    const data = await categoryModel.findCategories(filters);
    return success(res, 'Categories list retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const existing = await categoryModel.findCategoryById(req.params.id);
    if (!existing) {
      return next(new AppError('Category not found', HTTP_STATUS.NOT_FOUND));
    }
    const category = await categoryModel.updateCategory(req.params.id, req.body, req.user?.id);
    return success(res, 'Category updated successfully', category);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('Category already exists', HTTP_STATUS.CONFLICT));
    }
    next(err);
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    const existing = await categoryModel.findCategoryById(req.params.id);
    if (!existing) {
      return next(new AppError('Category not found', HTTP_STATUS.NOT_FOUND));
    }
    await categoryModel.deleteCategory(req.params.id, req.user?.id);
    return success(res, 'Category deleted successfully');
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
};
