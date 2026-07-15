/**
 * Product search history business logic.
 *
 * History is recorded only from GET /products with a valid authenticated search.
 */
const db = require('../database/knex');
const productSearchHistoryModel = require('../models/productSearchHistoryModel');
const { AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

const MIN_KEYWORD_LENGTH = 2;

/**
 * Normalize + validate a search keyword for history.
 * @returns {string|null} lowercase trimmed keyword, or null if invalid
 */
const normalizeKeyword = (raw) => {
  if (raw === undefined || raw === null) return null;
  const keyword = String(raw).trim().toLowerCase();
  if (!keyword || keyword.length < MIN_KEYWORD_LENGTH) return null;
  if (keyword.length > 255) return keyword.slice(0, 255);
  return keyword;
};

/**
 * Upsert keyword for user and enforce max 20 rows.
 * Safe to call fire-and-forget from product list (errors should not break list).
 * @param {number} userId
 * @param {string} rawSearch
 */
const recordSearch = async (userId, rawSearch) => {
  if (!userId) return null;

  const keyword = normalizeKeyword(rawSearch);
  if (!keyword) return null;

  return db.transaction(async (trx) => {
    const existing = await productSearchHistoryModel.findByUserAndKeyword(userId, keyword, trx);

    if (existing) {
      await productSearchHistoryModel.touchSearchedAt(existing.id, trx);
      return existing.id;
    }

    const id = await productSearchHistoryModel.insert({ userId, keyword }, trx);
    await productSearchHistoryModel.trimToMax(userId, trx);
    return id;
  });
};

/** GET /products/search-history */
const getHistory = async (userId) => productSearchHistoryModel.listByUser(userId);

/** DELETE /products/search-history/:id */
const deleteOne = async (userId, id) => {
  const existing = await productSearchHistoryModel.findByIdForUser(id, userId);
  if (!existing) {
    throw new AppError('Search history item not found', HTTP_STATUS.NOT_FOUND);
  }

  await productSearchHistoryModel.deleteByIdForUser(id, userId);
  return { id: Number(id) };
};

/** DELETE /products/search-history */
const clearAll = async (userId) => {
  const deleted = await productSearchHistoryModel.deleteAllForUser(userId);
  return { deleted };
};

module.exports = {
  MIN_KEYWORD_LENGTH,
  normalizeKeyword,
  recordSearch,
  getHistory,
  deleteOne,
  clearAll,
};
