const db = require('../database/knex');

// ==========================================
// List & read queries
// ==========================================

/**
 * List all active roles ordered by ID.
 * @returns {Promise<Array>}
 */
const findAll = () =>
  db('roles')
    .select('id', 'code', 'name', 'description', 'is_active', 'created_at', 'updated_at')
    .where('is_active', true)
    .orderBy('id', 'desc');

module.exports = {
  findAll,
};
