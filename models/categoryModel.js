const db = require('../database/knex');
const { paginate } = require('../utils/pagination');

const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
};

const findCategoryById = (id) =>
  db('categories').where({ id }).whereNull('deleted_at').first();

const findCategoryBySlug = (slug) =>
  db('categories').where({ slug }).whereNull('deleted_at').first();

const findCategories = async (filters = {}) => {
  const q = db('categories')
    .leftJoin('products', function () {
      this.on('categories.id', '=', 'products.category_id').andOnNull('products.deleted_at');
    })
    .whereNull('categories.deleted_at')
    .groupBy('categories.id')
    .select(
      'categories.id',
      'categories.name',
      'categories.icon',
      'categories.image',
      'categories.slug',
      db.raw('count(products.id) as product_count')
    );

  if (filters.q) {
    q.where('categories.name', 'like', `%${filters.q}%`);
  }

  if (filters.is_active !== undefined) {
    q.where('categories.is_active', filters.is_active);
  }

  q.orderBy('categories.name', 'asc');

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  return paginate(q, page, limit);
};

const createCategory = async (data, userId = null) => {
  const slug = data.slug ? slugify(data.slug) : slugify(data.name);
  const payload = {
    name: data.name,
    icon: data.icon || null,
    image: data.image || null,
    slug,
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_by: userId,
  };

  const [id] = await db('categories').insert(payload);
  return findCategoryById(id);
};

const updateCategory = async (id, data, userId = null) => {
  const payload = {};
  if (data.name !== undefined) {
    payload.name = data.name;
    if (!data.slug) {
      payload.slug = slugify(data.name);
    }
  }
  if (data.slug !== undefined) payload.slug = slugify(data.slug);
  if (data.icon !== undefined) payload.icon = data.icon;
  if (data.image !== undefined) payload.image = data.image;
  if (data.is_active !== undefined) payload.is_active = data.is_active;
  
  if (Object.keys(payload).length === 0) return findCategoryById(id);

  payload.updated_by = userId;
  payload.updated_at = db.fn.now();

  await db('categories').where({ id }).update(payload);
  return findCategoryById(id);
};

const deleteCategory = async (id, userId = null) => {
  await db('categories')
    .where({ id })
    .update({
      deleted_at: db.fn.now(),
      updated_by: userId,
    });
};

module.exports = {
  findCategoryById,
  findCategoryBySlug,
  findCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  slugify,
};
