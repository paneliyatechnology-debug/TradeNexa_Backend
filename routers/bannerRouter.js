const express = require('express');
const bannerController = require('../controllers/bannerController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const { idParam, bannerCreateRules, bannerUpdateRules } = require('../middleware/resourceValidation');

const router = express.Router();

router.get('/', bannerController.getBanners);
router.get('/:id', idParam, validate, bannerController.getBanner);

// Admin-only write/delete endpoints
router.post('/', authenticate, authorize('admin'), bannerCreateRules, validate, bannerController.createBanner);
router.put('/:id', authenticate, authorize('admin'), idParam, bannerUpdateRules, validate, bannerController.updateBanner);
router.delete('/:id', authenticate, authorize('admin'), idParam, validate, bannerController.deleteBanner);

module.exports = router;
