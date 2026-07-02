/**
 * Role routes.
 *
 * Public read-only endpoint listing available user roles.
 */
const express = require('express');
const roleController = require('../controllers/roleController');

const router = express.Router();

// ==========================================
// Public read routes
// ==========================================

router.get('/', roleController.getRoles);

module.exports = router;
