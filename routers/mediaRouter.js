/**
 * Public media proxy — streams files from private S3 bucket.
 */
const express = require('express');
const mediaController = require('../controllers/mediaController');

const router = express.Router();

router.get(/.*/, mediaController.serveMedia);

module.exports = router;
