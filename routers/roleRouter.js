/**
 * Role routes.
 *
 * Public read-only endpoint listing available user roles.
 */
const express = require('express');
const roleController = require('../controllers/roleController');
const { validate } = require('../middleware/auth');
const { roleListQuery } = require('../middleware/resourceValidation');

const router = express.Router();

// ==========================================
// Public read routes
// ==========================================

router.get('/', roleListQuery, validate, roleController.getRoles);

module.exports = router;
