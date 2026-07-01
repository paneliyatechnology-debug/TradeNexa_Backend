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
    const category = await categoryModel.getCategoryWithSubcategories(req.params.id);
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
    await categoryModel.deleteCategory(req.params.id, req.user?.id);
    return success(res, 'Category deleted successfully');
  } catch (err) {
    next(err);
  }
};

const createSubcategory = async (req, res, next) => {
  try {
    const subcategory = await categoryModel.createSubcategory(
      req.params.categoryId,
      req.body,
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

const getSubcategory = async (req, res, next) => {
  try {
    const subcategory = await categoryModel.findSubcategoryById(
      req.params.id,
      req.params.categoryId,
    );
    if (!subcategory) {
      return next(new AppError('Subcategory not found', HTTP_STATUS.NOT_FOUND));
    }
    return success(res, 'Subcategory details retrieved successfully', subcategory);
  } catch (err) {
    next(err);
  }
};

const getSubcategories = async (req, res, next) => {
  try {
    const filters = {
      q: req.query.q,
      page: req.query.page,
      limit: req.query.limit,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
    };
    const data = await categoryModel.findSubcategories(req.params.categoryId, filters);
    return success(res, 'Subcategories list retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

const updateSubcategory = async (req, res, next) => {
  try {
    const subcategory = await categoryModel.updateSubcategory(
      req.params.categoryId,
      req.params.id,
      req.body,
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
