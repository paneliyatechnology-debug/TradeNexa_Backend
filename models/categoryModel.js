const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { AppError } = require('../utils/response');

const slugify = (text) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-+/g, '-');

const formatRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    is_active: row.is_active !== undefined ? !!row.is_active : undefined,
    product_count: row.product_count !== undefined ? parseInt(row.product_count, 10) || 0 : undefined,
    subcategory_count:
      row.subcategory_count !== undefined ? parseInt(row.subcategory_count, 10) || 0 : undefined,
  };
};

const findCategoryById = (id) =>
  db('categories').where({ id }).whereNull('parent_id').whereNull('deleted_at').first();

const findSubcategoryById = (id, parentId = null) => {
  const q = db('categories').where({ id }).whereNotNull('parent_id').whereNull('deleted_at');
  if (parentId) q.where({ parent_id: parentId });
  return q.first();
};

const assertMainCategory = async (id) => {
  const category = await findCategoryById(id);
  if (!category) throw new AppError('Category not found', 404);
  return category;
};

const assertSubcategory = async (subcategoryId, parentId) => {
  const parent = await assertMainCategory(parentId);
  const subcategory = await findSubcategoryById(subcategoryId, parentId);
  if (!subcategory) throw new AppError('Subcategory not found', 404);
  return { parent, subcategory };
};

const nameExists = async (name, parentId = null, excludeId = null) => {
  const q = db('categories')
    .where({ name })
    .whereNull('deleted_at')
    .modify((builder) => {
      if (parentId === null) builder.whereNull('parent_id');
      else builder.where({ parent_id: parentId });
      if (excludeId) builder.whereNot({ id: excludeId });
    });
  const row = await q.first();
  return Boolean(row);
};

const findCategories = async (filters = {}) => {
  const q = db('categories')
    .whereNull('categories.parent_id')
    .whereNull('categories.deleted_at')
    .leftJoin('categories as subcategories', function () {
      this.on('subcategories.parent_id', '=', 'categories.id').andOnNull('subcategories.deleted_at');
    })
    .leftJoin('products', function () {
      this.on('products.subcategory_id', '=', 'subcategories.id').andOnNull('products.deleted_at');
    })
    .groupBy('categories.id')
    .select(
      'categories.id',
      'categories.name',
      'categories.icon',
      'categories.image',
      'categories.slug',
      'categories.is_active',
      db.raw('count(distinct subcategories.id) as subcategory_count'),
      db.raw('count(products.id) as product_count'),
    );

  if (filters.q) q.where('categories.name', 'like', `%${filters.q}%`);
  if (filters.is_active !== undefined) q.where('categories.is_active', filters.is_active);

  q.orderBy('categories.name', 'asc');
  const paginated = await paginate(q, filters.page, filters.limit);
  paginated.results = paginated.results.map(formatRow);
  return paginated;
};

const findSubcategories = async (parentId, filters = {}) => {
  await assertMainCategory(parentId);

  const q = db('categories')
    .where({ 'categories.parent_id': parentId })
    .whereNull('categories.deleted_at')
    .leftJoin('products', function () {
      this.on('products.subcategory_id', '=', 'categories.id').andOnNull('products.deleted_at');
    })
    .groupBy('categories.id')
    .select(
      'categories.id',
      'categories.parent_id',
      'categories.name',
      'categories.icon',
      'categories.image',
      'categories.slug',
      'categories.is_active',
      db.raw('count(products.id) as product_count'),
    );

  if (filters.q) q.where('categories.name', 'like', `%${filters.q}%`);
  if (filters.is_active !== undefined) q.where('categories.is_active', filters.is_active);

  q.orderBy('categories.name', 'asc');
  const paginated = await paginate(q, filters.page, filters.limit);
  paginated.results = paginated.results.map(formatRow);
  return paginated;
};

const getCategoryWithSubcategories = async (id) => {
  const category = await findCategoryById(id);
  if (!category) return null;

  const subcategories = await db('categories')
    .where({ parent_id: id })
    .whereNull('deleted_at')
    .select('id', 'parent_id', 'name', 'icon', 'image', 'slug', 'is_active')
    .orderBy('name', 'asc');

  return {
    ...formatRow(category),
    subcategories: subcategories.map((row) => formatRow(row)),
  };
};

const createCategory = async (data, userId = null) => {
  if (await nameExists(data.name, null)) {
    const err = new Error('Duplicate category name');
    err.code = 'ER_DUP_ENTRY';
    throw err;
  }

  const slug = data.slug ? slugify(data.slug) : slugify(data.name);
  const [id] = await db('categories').insert({
    name: data.name,
    icon: data.icon || null,
    image: data.image || null,
    slug,
    parent_id: null,
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_by: userId,
  });

  return findCategoryById(id);
};

const createSubcategory = async (parentId, data, userId = null) => {
  const parent = await assertMainCategory(parentId);

  if (await nameExists(data.name, parentId)) {
    const err = new Error('Duplicate subcategory name');
    err.code = 'ER_DUP_ENTRY';
    throw err;
  }

  const baseSlug = data.slug ? slugify(data.slug) : slugify(data.name);
  const slug = `${parent.slug}-${baseSlug}`;

  const [id] = await db('categories').insert({
    name: data.name,
    icon: data.icon || null,
    image: data.image || null,
    slug,
    parent_id: parentId,
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_by: userId,
  });

  return findSubcategoryById(id, parentId);
};

const updateCategory = async (id, data, userId = null) => {
  await assertMainCategory(id);
  return updateCategoryRow(id, data, userId, null);
};

const updateSubcategory = async (parentId, id, data, userId = null) => {
  await assertSubcategory(id, parentId);
  return updateCategoryRow(id, data, userId, parentId);
};

const updateCategoryRow = async (id, data, userId, parentId) => {
  const payload = {};

  if (data.name !== undefined) {
    if (await nameExists(data.name, parentId, id)) {
      const err = new Error('Duplicate name');
      err.code = 'ER_DUP_ENTRY';
      throw err;
    }
    payload.name = data.name;
    if (!data.slug) {
      if (parentId) {
        const parent = await findCategoryById(parentId);
        payload.slug = `${parent.slug}-${slugify(data.name)}`;
      } else {
        payload.slug = slugify(data.name);
      }
    }
  }

  if (data.slug !== undefined) {
    payload.slug = parentId
      ? `${(await findCategoryById(parentId)).slug}-${slugify(data.slug)}`
      : slugify(data.slug);
  }
  if (data.icon !== undefined) payload.icon = data.icon;
  if (data.image !== undefined) payload.image = data.image;
  if (data.is_active !== undefined) payload.is_active = data.is_active;

  if (Object.keys(payload).length === 0) {
    return parentId ? findSubcategoryById(id, parentId) : findCategoryById(id);
  }

  payload.updated_by = userId;
  payload.updated_at = db.fn.now();
  await db('categories').where({ id }).update(payload);

  return parentId ? findSubcategoryById(id, parentId) : findCategoryById(id);
};

const deleteCategory = async (id, userId = null) => {
  await assertMainCategory(id);

  const subCount = await db('categories')
    .where({ parent_id: id })
    .whereNull('deleted_at')
    .count('* as total')
    .first();

  if (parseInt(subCount?.total, 10) > 0) {
    throw new AppError('Cannot delete category with active subcategories', 409);
  }

  await db('categories').where({ id }).update({
    deleted_at: db.fn.now(),
    updated_by: userId,
  });
};

const deleteSubcategory = async (parentId, id, userId = null) => {
  await assertSubcategory(id, parentId);

  const productCount = await db('products')
    .where({ subcategory_id: id })
    .whereNull('deleted_at')
    .count('* as total')
    .first();

  if (parseInt(productCount?.total, 10) > 0) {
    throw new AppError('Cannot delete subcategory linked to products', 409);
  }

  await db('categories').where({ id }).update({
    deleted_at: db.fn.now(),
    updated_by: userId,
  });
};

const validateSubcategoryForProduct = async (subcategoryId) => {
  const subcategory = await db('categories')
    .where({ id: subcategoryId })
    .whereNotNull('parent_id')
    .whereNull('deleted_at')
    .where({ is_active: true })
    .first();

  if (!subcategory) {
    throw new AppError('Invalid or inactive subcategory ID', 400);
  }

  return subcategory;
};

module.exports = {
  findCategoryById,
  findSubcategoryById,
  findCategories,
  findSubcategories,
  getCategoryWithSubcategories,
  createCategory,
  createSubcategory,
  updateCategory,
  updateSubcategory,
  deleteCategory,
  deleteSubcategory,
  validateSubcategoryForProduct,
};
