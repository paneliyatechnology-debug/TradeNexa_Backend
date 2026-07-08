const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { AppError } = require('../utils/response');
const { resolveMediaUrl } = require('../utils/media');

// ==========================================
// Formatting helpers
// ==========================================

/** Convert a name to a URL-safe slug. */
const slugify = (text) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-+/g, '-');

/**
 * Format a category/subcategory row for API responses.
 * Resolves icon/image to full URLs and normalizes counts.
 */
const formatRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    icon: resolveMediaUrl(row.icon),
    image: resolveMediaUrl(row.image),
    is_active: row.is_active !== undefined ? !!row.is_active : undefined,
    product_count: row.product_count !== undefined ? parseInt(row.product_count, 10) || 0 : undefined,
    subcategory_count:
      row.subcategory_count !== undefined ? parseInt(row.subcategory_count, 10) || 0 : undefined,
  };
};

/**
 * Format a subcategory row — same as formatRow but exposes category_id instead of parent_id.
 */
const formatSubcategoryRow = (row) => {
  if (!row) return null;
  const formatted = formatRow(row);
  if (formatted.parent_id !== undefined && formatted.parent_id !== null) {
    formatted.category_id = formatted.category_id ?? formatted.parent_id;
  }
  delete formatted.parent_id;
  return formatted;
};

const CATEGORY_SORT_FIELDS = {
  id: 'categories.id',
  name: 'categories.name',
  slug: 'categories.slug',
  is_active: 'categories.is_active',
  subcategory_count: 'subcategory_count',
  product_count: 'product_count',
};

const SUBCATEGORY_SORT_FIELDS = {
  id: 'categories.id',
  name: 'categories.name',
  slug: 'categories.slug',
  is_active: 'categories.is_active',
  product_count: 'product_count',
};

/** Apply list filters shared by category and subcategory queries. */
const applyListFilters = (q, filters, prefix = 'categories') => {
  if (filters.search) {
    q.where(`${prefix}.name`, 'like', `%${filters.search}%`);
  }
  if (filters.slug) {
    q.where(`${prefix}.slug`, filters.slug);
  }
  if (filters.is_active !== undefined) {
    q.where(`${prefix}.is_active`, filters.is_active);
  }
};

/** Apply field-wise sort (default: id desc). */
const applyListSort = (q, filters, sortFieldMap) => {
  const sortBy = filters.sort_by && sortFieldMap[filters.sort_by] ? filters.sort_by : 'id';
  const sortOrder = filters.sort_order === 'asc' ? 'asc' : 'desc';
  q.orderBy(sortFieldMap[sortBy], sortOrder);
};

// ==========================================
// Lookups & guards
// ==========================================

/** Find a main category by ID (parent_id must be null). */
const findCategoryById = (id) =>
  db('categories').where({ id }).whereNull('parent_id').whereNull('deleted_at').first();

/** Find a subcategory by ID, optionally scoped to a parent category. */
const findSubcategoryById = (id, parentId = null) => {
  const q = db('categories').where({ id }).whereNotNull('parent_id').whereNull('deleted_at');
  if (parentId) q.where({ parent_id: parentId });
  return q.first();
};

/** Throw 404 if the record is not a valid main category. */
const assertMainCategory = async (id) => {
  const category = await findCategoryById(id);
  if (!category) throw new AppError('Category not found', 404);
  return category;
};

/** Throw 404 if the record is not a valid subcategory under the given parent. */
const assertSubcategory = async (subcategoryId, parentId) => {
  const parent = await assertMainCategory(parentId);
  const subcategory = await findSubcategoryById(subcategoryId, parentId);
  if (!subcategory) throw new AppError('Subcategory not found', 404);
  return { parent, subcategory };
};

/** Check name uniqueness within the same parent scope. */
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

// ==========================================
// List & read queries
// ==========================================

/** Paginated list of main categories with subcategory and product counts. */
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

  applyListFilters(q, filters);
  applyListSort(q, filters, CATEGORY_SORT_FIELDS);

  const paginated = await paginate(q, filters.page, filters.limit);
  paginated.results = paginated.results.map(formatRow);
  return paginated;
};

/** Paginated list of subcategories under a main category. */
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

  applyListFilters(q, filters);
  applyListSort(q, filters, SUBCATEGORY_SORT_FIELDS);

  const paginated = await paginate(q, filters.page, filters.limit);
  paginated.results = paginated.results.map(formatSubcategoryRow);
  return paginated;
};

/** Get a main category with its nested subcategories array. */
const getCategoryWithSubcategories = async (id) => {
  const category = await findCategoryById(id);
  if (!category) return null;

  const subcategories = await db('categories')
    .where({ parent_id: id })
    .whereNull('deleted_at')
    .select('id', 'parent_id', 'name', 'icon', 'image', 'slug', 'is_active')
    .orderBy('id', 'desc');

  return {
    ...formatRow(category),
    subcategories: subcategories.map((row) => formatSubcategoryRow(row)),
  };
};

/**
 * Get a single subcategory by ID with parent category name and product count.
 * @param {number} id - Subcategory ID
 * @returns {Promise<Object|null>}
 */
const getSubcategoryDetail = async (id) => {
  const row = await db('categories')
    .where({ 'categories.id': id })
    .whereNotNull('categories.parent_id')
    .whereNull('categories.deleted_at')
    .leftJoin('categories as parent', function () {
      this.on('parent.id', '=', 'categories.parent_id').andOnNull('parent.deleted_at');
    })
    .leftJoin('products', function () {
      this.on('products.subcategory_id', '=', 'categories.id').andOnNull('products.deleted_at');
    })
    .groupBy(
      'categories.id',
      'categories.parent_id',
      'categories.name',
      'categories.icon',
      'categories.image',
      'categories.slug',
      'categories.is_active',
      'parent.id',
      'parent.name',
    )
    .select(
      'categories.id',
      'categories.parent_id',
      'categories.name',
      'categories.icon',
      'categories.image',
      'categories.slug',
      'categories.is_active',
      'parent.id as category_id',
      'parent.name as category_name',
      db.raw('count(products.id) as product_count'),
    )
    .first();

  return formatSubcategoryRow(row);
};

// ==========================================
// Create & update
// ==========================================

/** Insert a new main category (parent_id = null). */
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

/** Insert a new subcategory under a main category. Slug = {parent.slug}-{child.slug}. */
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

/** Update a main category. */
const updateCategory = async (id, data, userId = null) => {
  await assertMainCategory(id);
  return updateCategoryRow(id, data, userId, null);
};

/** Update a subcategory under a main category. */
const updateSubcategory = async (parentId, id, data, userId = null) => {
  await assertSubcategory(id, parentId);
  return updateCategoryRow(id, data, userId, parentId);
};

/** Shared update logic for both main categories and subcategories. */
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

/** Apply icon/image path updates after file upload (used by categoryService). */
const applyCategoryMediaUpdates = async (id, updates, userId = null) => {
  if (!updates || !Object.keys(updates).length) {
    return db('categories').where({ id }).whereNull('deleted_at').first();
  }

  await db('categories')
    .where({ id })
    .update({
      ...updates,
      updated_by: userId,
      updated_at: db.fn.now(),
    });

  return db('categories').where({ id }).whereNull('deleted_at').first();
};

// ==========================================
// Delete (soft)
// ==========================================

/** Soft-delete a main category. Fails if active subcategories exist. */
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

/** Soft-delete a subcategory. Fails if linked to active products. */
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

// ==========================================
// Product validation
// ==========================================

/** Ensure subcategory exists, is active, and has a parent (used by product create). */
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

/** Ensure subcategory belongs to the given parent category. */
const validateCategorySubcategoryMatch = async (categoryId, subcategoryId) => {
  const subcategory = await validateSubcategoryForProduct(subcategoryId);
  if (String(subcategory.parent_id) !== String(categoryId)) {
    throw new AppError('Subcategory does not belong to the selected category', 400);
  }
  return subcategory;
};

module.exports = {
  findCategoryById,
  findSubcategoryById,
  findCategories,
  findSubcategories,
  getCategoryWithSubcategories,
  getSubcategoryDetail,
  createCategory,
  createSubcategory,
  updateCategory,
  updateSubcategory,
  applyCategoryMediaUpdates,
  deleteCategory,
  deleteSubcategory,
  validateSubcategoryForProduct,
  validateCategorySubcategoryMatch,
  formatRow,
  formatSubcategoryRow,
};
