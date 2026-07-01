const db = require('../database/knex');
const { paginate } = require('../utils/pagination');

const findBrandById = (id) =>
  db('brands').where({ id }).whereNull('deleted_at').first();

const findBrands = async (filters = {}) => {
  const q = db('brands').whereNull('deleted_at');

  if (filters.q) {
    q.where('name', 'like', `%${filters.q}%`);
  }

  if (filters.is_popular !== undefined) {
    q.where('is_popular', filters.is_popular);
  }

  if (filters.is_active !== undefined) {
    q.where('is_active', filters.is_active);
  }

  q.orderBy('name', 'asc');

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  return paginate(q, page, limit);
};

const createBrand = async (data, userId = null) => {
  const payload = {
    name: data.name,
    logo: data.logo || null,
    is_popular: data.is_popular !== undefined ? data.is_popular : false,
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_by: userId,
  };

  const [id] = await db('brands').insert(payload);
  return findBrandById(id);
};

const updateBrand = async (id, data, userId = null) => {
  const payload = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.logo !== undefined) payload.logo = data.logo;
  if (data.is_popular !== undefined) payload.is_popular = data.is_popular;
  if (data.is_active !== undefined) payload.is_active = data.is_active;

  if (Object.keys(payload).length === 0) return findBrandById(id);

  payload.updated_by = userId;
  payload.updated_at = db.fn.now();

  await db('brands').where({ id }).update(payload);
  return findBrandById(id);
};

const deleteBrand = async (id, userId = null) => {
  await db('brands')
    .where({ id })
    .update({
      deleted_at: db.fn.now(),
      updated_by: userId,
    });
};

module.exports = {
  findBrandById,
  findBrands,
  createBrand,
  updateBrand,
  deleteBrand,
};
