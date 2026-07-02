/**
 * Banner routes.
 *
 * Public read endpoints and admin-only create/update/delete.
 */
const express = require('express');
const bannerController = require('../controllers/bannerController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const { idParam, bannerCreateRules, bannerUpdateRules } = require('../middleware/resourceValidation');

const router = express.Router();

// ==========================================
// Public read routes
// ==========================================

router.get('/', bannerController.getBanners);
router.get('/:id', idParam, validate, bannerController.getBanner);

// ==========================================
// Admin write routes
// ==========================================

router.post('/', authenticate, authorize('admin'), bannerCreateRules, validate, bannerController.createBanner);
router.put('/:id', authenticate, authorize('admin'), idParam, bannerUpdateRules, validate, bannerController.updateBanner);
router.delete('/:id', authenticate, authorize('admin'), idParam, validate, bannerController.deleteBanner);

module.exports = router;
