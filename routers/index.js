/**
 * API v1 route aggregator.
 *
 * Mounts all feature routers under their respective path prefixes.
 */
const express = require('express');
const authRouter = require('./authRouter');
const categoryRouter = require('./categoryRouter');
const bannerRouter = require('./bannerRouter');
const productRouter = require('./productRouter');
const supplierRouter = require('./supplierRouter');
const brandRouter = require('./brandRouter');
const offerRouter = require('./offerRouter');
const rfqRouter = require('./rfqRouter');
const serviceRouter = require('./serviceRouter');
const newsRouter = require('./newsRouter');
const businessTypeRouter = require('./businessTypeRouter');
const roleRouter = require('./roleRouter');
const adminAuthRouter = require('./adminAuthRouter');

const router = express.Router();

// ==========================================
// Route mounts
// ==========================================

router.use('/auth', authRouter);
router.use('/admin/auth', adminAuthRouter);
router.use('/roles', roleRouter);
router.use('/business-types', businessTypeRouter);
router.use('/categories', categoryRouter);
router.use('/banners', bannerRouter);
router.use('/products', productRouter);
router.use('/suppliers', supplierRouter);
router.use('/brands', brandRouter);
router.use('/offers', offerRouter);
router.use('/rfqs', rfqRouter);
router.use('/services', serviceRouter);
router.use('/news', newsRouter);

module.exports = router;
