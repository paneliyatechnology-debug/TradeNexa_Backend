/**
 * Testing Controller for Automatic Product Translation.
 *
 * NOTE: This is exclusively for isolated testing and development.
 * It does NOT modify the database or touch production product APIs.
 */

const translationTestService = require('../services/translationTestService');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

/**
 * POST /api/v1/test/translate-product
 *
 * Test product translation into Hindi and Gujarati (or custom target languages).
 */
const translateProductTest = async (req, res, next) => {
  try {
    const {
      name,
      description,
      source_language = 'en',
      target_languages = ['hi', 'gu', "kn"],
      provider,
      apiKey,
      baseUrl,
      timeoutMs,
    } = req.body;

    const validationErrors = [];

    // 1. Validate name
    if (name === undefined || name === null || (typeof name === 'string' && !name.trim())) {
      validationErrors.push({ field: 'name', message: 'Product name is required and cannot be empty' });
    } else if (typeof name !== 'string') {
      validationErrors.push({ field: 'name', message: 'Product name must be a string' });
    }

    // 2. Validate description
    if (description === undefined || description === null || (typeof description === 'string' && !description.trim())) {
      validationErrors.push({ field: 'description', message: 'Product description is required and cannot be empty' });
    } else if (typeof description !== 'string') {
      validationErrors.push({ field: 'description', message: 'Product description must be a string' });
    }

    // 3. Validate source_language
    if (source_language && typeof source_language !== 'string') {
      validationErrors.push({ field: 'source_language', message: 'source_language must be a string code (e.g. en)' });
    }

    // 4. Validate target_languages
    if (!Array.isArray(target_languages) || target_languages.length === 0) {
      validationErrors.push({ field: 'target_languages', message: 'target_languages must be a non-empty array of language codes (e.g. ["hi", "gu"])' });
    } else {
      const invalidCodes = target_languages.filter(
        (code) => typeof code !== 'string' || !code.trim() || !translationTestService.SUPPORTED_LANGUAGES[code.toLowerCase()]
      );
      if (invalidCodes.length > 0) {
        validationErrors.push({
          field: 'target_languages',
          message: `Unsupported target language code(s): ${invalidCodes.join(', ')}. Supported codes: ${Object.keys(
            translationTestService.SUPPORTED_LANGUAGES
          ).join(', ')}`,
        });
      }
    }

    if (validationErrors.length > 0) {
      return next(new AppError('Validation failed for product translation test', HTTP_STATUS.BAD_REQUEST, validationErrors));
    }

    // Execute translation via testing service
    const result = await translationTestService.translateProduct({
      name: name.trim(),
      description: description.trim(),
      source_language: source_language.toLowerCase().trim(),
      target_languages: target_languages.map((l) => l.toLowerCase().trim()),
      options: {
        provider,
        apiKey,
        baseUrl,
        timeoutMs,
      },
    });

    const statusCode = result.status === 'failed' ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.OK;
    const message =
      result.status === 'success'
        ? 'Product translated successfully'
        : result.status === 'partial_success'
          ? 'Product translated with partial errors'
          : 'Product translation failed';

    return success(res, message, result, statusCode);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/test/products
 *
 * Fetches products from database and translates them into the requested language (e.g., ?lang=hi or ?lang=gu or ?lang=kn).
 * Supports search, category filter, pagination, and sorting.
 */
const getTestProducts = async (req, res, next) => {
  try {
    const productModel = require('../models/productModel');
    const targetLang = (req.query.lang || req.query.language || 'en').toLowerCase().trim();
    const sourceLang = (req.query.source_lang || 'en').toLowerCase().trim();

    // Validate target language code
    if (targetLang !== 'en' && !translationTestService.SUPPORTED_LANGUAGES[targetLang]) {
      return next(
        new AppError(
          `Unsupported language code '${targetLang}'. Supported codes: ${Object.keys(
            translationTestService.SUPPORTED_LANGUAGES
          ).join(', ')}`,
          HTTP_STATUS.BAD_REQUEST
        )
      );
    }

    const filters = {
      search: req.query.search,
      category_id: req.query.category_id,
      subcategory_id: req.query.subcategory_id,
      city_id: req.query.city_id,
      brand_id: req.query.brand_id,
      is_trending: req.query.is_trending !== undefined ? req.query.is_trending === 'true' : undefined,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
      min_price: req.query.min_price,
      max_price: req.query.max_price,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      page: req.query.page || 1,
      limit: req.query.limit || 10,
    };

    const paginated = await productModel.findProducts(filters);

    // If language is English (source language), return raw products directly
    if (targetLang === 'en' || targetLang === sourceLang) {
      return success(res, `Products retrieved successfully in English (${targetLang})`, {
        language: targetLang,
        source_language: sourceLang,
        ...paginated,
      });
    }

    // Translate each product into requested targetLang with full field support
    const translatedResults = await Promise.all(
      paginated.results.map(async (product) => {
        try {
          return await translationTestService.translateProductListItem(product, targetLang, sourceLang);
        } catch (err) {
          return {
            ...product,
            translation_error: err.message,
            translated_language: targetLang,
          };
        }
      })
    );

    return success(res, `Products retrieved and translated to ${translationTestService.SUPPORTED_LANGUAGES[targetLang] || targetLang} successfully`, {
      language: targetLang,
      language_name: translationTestService.SUPPORTED_LANGUAGES[targetLang] || targetLang,
      source_language: sourceLang,
      page: paginated.page,
      limit: paginated.limit,
      total: paginated.total,
      total_pages: paginated.total_pages,
      results: translatedResults,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/test/products/:id
 *
 * Fetches a single product by ID and translates ALL details (basic, category, brand, pricing, seller, etc.) into the requested language (e.g. ?lang=hi).
 */
const getTestProductById = async (req, res, next) => {
  try {
    const productModel = require('../models/productModel');
    const { id } = req.params;
    const targetLang = (req.query.lang || req.query.language || 'en').toLowerCase().trim();
    const sourceLang = (req.query.source_lang || 'en').toLowerCase().trim();

    if (targetLang !== 'en' && !translationTestService.SUPPORTED_LANGUAGES[targetLang]) {
      return next(
        new AppError(
          `Unsupported language code '${targetLang}'. Supported codes: ${Object.keys(
            translationTestService.SUPPORTED_LANGUAGES
          ).join(', ')}`,
          HTTP_STATUS.BAD_REQUEST
        )
      );
    }

    const product = await productModel.findProductDetailById(id);
    if (!product) {
      return next(new AppError('Product not found', HTTP_STATUS.NOT_FOUND));
    }

    if (targetLang === 'en' || targetLang === sourceLang) {
      return success(res, 'Product details retrieved successfully in English', {
        language: targetLang,
        source_language: sourceLang,
        product,
      });
    }

    // Translate all fields in full product detail
    const translatedProduct = await translationTestService.translateFullProductDetail(
      product,
      targetLang,
      sourceLang
    );

    return success(
      res,
      `Product details retrieved and translated to ${translationTestService.SUPPORTED_LANGUAGES[targetLang] || targetLang} successfully`,
      translatedProduct
    );
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/test/translation-languages
 *
 * Helper endpoint to inspect supported test translation languages and providers.
 */
const getSupportedLanguagesTest = async (req, res, next) => {
  try {
    const data = {
      default_source: 'en',
      default_targets: ['hi', 'gu'],
      supported_languages: translationTestService.SUPPORTED_LANGUAGES,
      supported_providers: ['free_google', 'google', 'gemini', 'openai', 'libre'],
    };
    return success(res, 'Supported translation metadata retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  translateProductTest,
  getTestProducts,
  getTestProductById,
  getSupportedLanguagesTest,
};
