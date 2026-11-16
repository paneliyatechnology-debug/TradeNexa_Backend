/**
 * Media route handler — serves uploaded files from the local uploads directory.
 */
const express = require('express');
const mediaController = require('../controllers/mediaController');

const router = express.Router();

router.get(/.*/, mediaController.serveMedia);

module.exports = router;
