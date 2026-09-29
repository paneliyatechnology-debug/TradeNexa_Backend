/**
 * Dedicated Testing Router.
 *
 * Exclusively used for local testing and validation of features (e.g. automatic product translation)
 * before production integration.
 */

const express = require('express');
const testTranslationController = require('../controllers/testTranslationController');

const router = express.Router();

// ==========================================
// Translation test endpoints
// ==========================================

/**
 * POST /api/v1/test/translate-product
 * Translates product name and description into target languages (default: Hindi & Gujarati).
 */
router.post('/translate-product', testTranslationController.translateProductTest);

/**
 * GET /api/v1/test/products
 * Fetches products from database and returns them translated into the requested language (e.g. ?lang=hi, ?lang=gu, ?lang=kn).
 */
router.get('/products', testTranslationController.getTestProducts);

/**
 * GET /api/v1/test/products/:id
 * Fetches a single product by ID and returns its details translated into the requested language (e.g. ?lang=hi).
 */
router.get('/products/:id', testTranslationController.getTestProductById);

/**
 * GET /api/v1/test/translation-languages
 * Lists supported translation languages and provider options.
 */
router.get('/translation-languages', testTranslationController.getSupportedLanguagesTest);

module.exports = router;
