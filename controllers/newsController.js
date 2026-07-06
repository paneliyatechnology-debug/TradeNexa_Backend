const newsModel = require('../models/newsModel');
const newsService = require('../services/newsService');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

// ==========================================
// News Operations
// ==========================================

/**
 * POST /news
 * Create a new news article (admin only).
 */
const createNews = async (req, res, next) => {
  try {
    const news = await newsService.createNews(req.body, req.files, req.user?.id);
    return success(res, 'News article created successfully', news, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /news/:id
 * Retrieve a single news article by ID.
 */
const getNewsDetails = async (req, res, next) => {
  try {
    const news = await newsModel.findNewsById(req.params.id);
    if (!news) {
      return next(new AppError('News article not found', HTTP_STATUS.NOT_FOUND));
    }
    return success(res, 'News article details retrieved successfully', news);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /news
 * List news articles with search, pagination, and formatted summary fields.
 */
const getNewsList = async (req, res, next) => {
  try {
    const filters = {
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
    };
    const data = await newsModel.findNewsList(filters);

    // Format output list to match spec fields: id, title, thumbnail, published_at
    const formatted = {
      ...data,
      results: data.results.map(n => ({
        id: n.id,
        title: n.title,
        thumbnail: n.thumbnail,
        published_at: n.published_at
      }))
    };

    return success(res, 'News list retrieved successfully', formatted);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /news/:id
 * Update an existing news article (admin only).
 */
const updateNews = async (req, res, next) => {
  try {
    const existing = await newsModel.findNewsById(req.params.id);
    if (!existing) {
      return next(new AppError('News article not found', HTTP_STATUS.NOT_FOUND));
    }
    const news = await newsService.updateNews(req.params.id, req.body, req.files, req.user?.id);
    return success(res, 'News article updated successfully', news);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /news/:id
 * Soft-delete a news article (admin only).
 */
const deleteNews = async (req, res, next) => {
  try {
    const existing = await newsModel.findNewsById(req.params.id);
    if (!existing) {
      return next(new AppError('News article not found', HTTP_STATUS.NOT_FOUND));
    }
    await newsModel.deleteNews(req.params.id, req.user?.id);
    return success(res, 'News article deleted successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createNews,
  getNewsDetails,
  getNewsList,
  updateNews,
  deleteNews,
};
