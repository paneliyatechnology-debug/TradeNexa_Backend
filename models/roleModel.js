const db = require('../database/knex');

const findAll = () =>
  db('roles')
    .select('id', 'code', 'name', 'description', 'is_active', 'created_at', 'updated_at')
    .where('is_active', true)
    .orderBy('id', 'asc');

module.exports = {
  findAll,
};
