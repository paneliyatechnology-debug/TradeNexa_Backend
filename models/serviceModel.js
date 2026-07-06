/**
 * Marketplace service listing data access — CRUD and icon media path updates.
 */
const db = require('../database/knex');
const { resolveMediaUrl } = require('../utils/media');

// ==========================================
// Formatting helpers
// ==========================================

/** Format a service row for API responses (resolves icon URL). */
const formatRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    icon: row.icon ? resolveMediaUrl(row.icon) : null,
    is_active: row.is_active !== undefined ? !!row.is_active : undefined,
  };
};

// ==========================================
// List & read queries
// ==========================================

const findServiceById = async (id, options = {}) => {
  const row = await db('services').where({ id }).whereNull('deleted_at').first();
  if (!row || options.raw) return row;
  return formatRow(row);
};

const findServices = async (filters = {}) => {
  const q = db('services').whereNull('deleted_at');

  if (filters.search) {
    q.where('name', 'like', `%${filters.search}%`);
  }

  if (filters.is_active !== undefined) {
    q.where('is_active', filters.is_active);
  }

  q.orderBy('services.id', 'desc');

  const rows = await q;
  return rows.map(formatRow);
};

// ==========================================
// Write operations
// ==========================================

const createService = async (data, userId = null) => {
  const payload = {
    name: data.name,
    icon: data.icon || null,
    description: data.description || null,
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_by: userId,
  };

  const [id] = await db('services').insert(payload);
  return db('services').where({ id }).whereNull('deleted_at').first();
};

const updateService = async (id, data, userId = null) => {
  const payload = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.icon !== undefined) payload.icon = data.icon;
  if (data.description !== undefined) payload.description = data.description;
  if (data.is_active !== undefined) payload.is_active = data.is_active;

  if (Object.keys(payload).length === 0) return findServiceById(id);

  payload.updated_by = userId;
  payload.updated_at = db.fn.now();

  await db('services').where({ id }).update(payload);
  return findServiceById(id);
};

/** Apply icon path updates after file upload (create inbox move or update direct). */
const applyServiceMediaUpdates = async (id, updates, userId = null) => {
  if (!updates || !Object.keys(updates).length) {
    return db('services').where({ id }).whereNull('deleted_at').first();
  }

  await db('services')
    .where({ id })
    .update({
      ...updates,
      updated_by: userId,
      updated_at: db.fn.now(),
    });

  return db('services').where({ id }).whereNull('deleted_at').first();
};

const deleteService = async (id, userId = null) => {
  await db('services')
    .where({ id })
    .update({
      deleted_at: db.fn.now(),
      updated_by: userId,
    });
};

module.exports = {
  formatRow,
  findServiceById,
  findServices,
  createService,
  updateService,
  applyServiceMediaUpdates,
  deleteService,
};
