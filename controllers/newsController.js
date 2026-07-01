const newsModel = require('../models/newsModel');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

const createNews = async (req, res, next) => {
  try {
    const news = await newsModel.createNews(req.body, req.user?.id);
    return success(res, 'News article created successfully', news, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

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

const getNewsList = async (req, res, next) => {
  try {
    const filters = {
      q: req.query.q,
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

const updateNews = async (req, res, next) => {
  try {
    const existing = await newsModel.findNewsById(req.params.id);
    if (!existing) {
      return next(new AppError('News article not found', HTTP_STATUS.NOT_FOUND));
    }
    const news = await newsModel.updateNews(req.params.id, req.body, req.user?.id);
    return success(res, 'News article updated successfully', news);
  } catch (err) {
    next(err);
  }
};

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
