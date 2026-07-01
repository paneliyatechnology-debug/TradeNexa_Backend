const db = require('../database/knex');

const findServiceById = (id) =>
  db('services').where({ id }).whereNull('deleted_at').first();

const findServices = async (filters = {}) => {
  const q = db('services').whereNull('deleted_at');

  if (filters.q) {
    q.where('name', 'like', `%${filters.q}%`);
  }

  if (filters.is_active !== undefined) {
    q.where('is_active', filters.is_active);
  }

  q.orderBy('name', 'asc');

  return q;
};

const createService = async (data, userId = null) => {
  const payload = {
    name: data.name,
    icon: data.icon || null,
    description: data.description || null,
    is_active: data.is_active !== undefined ? data.is_active : true,
    created_by: userId,
  };

  const [id] = await db('services').insert(payload);
  return findServiceById(id);
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

const deleteService = async (id, userId = null) => {
  await db('services')
    .where({ id })
    .update({
      deleted_at: db.fn.now(),
      updated_by: userId,
    });
};

module.exports = {
  findServiceById,
  findServices,
  createService,
  updateService,
  deleteService,
};
