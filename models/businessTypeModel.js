const db = require('../database/knex');
const { ROLE_CODES } = require('../constants');

const slugify = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

const baseQuery = () =>
  db('business_types')
    .join('roles', 'business_types.role_id', 'roles.id')
    .select(
      'business_types.id',
      'business_types.name',
      'business_types.code',
      'business_types.role_id',
      'business_types.is_active',
      'business_types.created_at',
      'business_types.updated_at',
      'roles.code as role_code',
      'roles.name as role_name',
    );

const findById = (id) => baseQuery().where('business_types.id', id).first();

const findByRoleId = async (roleId, isActive = true) => {
  const role = await db('roles').where({ id: roleId, is_active: true }).first();
  if (!role) return [];

  const q = baseQuery()
    .where('business_types.role_id', roleId)
    .orderBy('business_types.name', 'asc');

  if (isActive !== undefined) {
    q.where('business_types.is_active', isActive);
  }

  return q;
};

const isValidForRole = async (businessTypeId, roleId) => {
  const type = await findById(businessTypeId);
  if (!type || !type.is_active) return false;

  return type.role_id === roleId;
};

const create = async (data) => {
  const role = await db('roles').where({ id: data.role_id, is_active: true }).first();
  if (!role) throw new Error('INVALID_ROLE');
  if (![ROLE_CODES.BUYER, ROLE_CODES.SELLER, ROLE_CODES.BUYER_SELLER].includes(role.code)) {
    throw new Error('INVALID_ROLE_FOR_BUSINESS_TYPE');
  }

  const code = data.code ? slugify(data.code) : slugify(data.name);
  const [id] = await db('business_types').insert({
    name: data.name.trim(),
    code,
    role_id: data.role_id,
    is_active: data.is_active !== undefined ? data.is_active : true,
  });

  return findById(id);
};

const update = async (id, data) => {
  const existing = await db('business_types').where({ id }).first();
  if (!existing) return null;

  const payload = {};
  if (data.name) payload.name = data.name.trim();
  if (data.code) payload.code = slugify(data.code);
  if (data.is_active !== undefined) payload.is_active = data.is_active;

  if (data.role_id) {
    const role = await db('roles').where({ id: data.role_id, is_active: true }).first();
    if (!role || ![ROLE_CODES.BUYER, ROLE_CODES.SELLER, ROLE_CODES.BUYER_SELLER].includes(role.code)) {
      throw new Error('INVALID_ROLE_FOR_BUSINESS_TYPE');
    }
    payload.role_id = data.role_id;
  }

  if (Object.keys(payload).length) {
    await db('business_types').where({ id }).update(payload);
  }

  return findById(id);
};

const softDelete = async (id) => {
  const existing = await db('business_types').where({ id }).first();
  if (!existing) return null;
  await db('business_types').where({ id }).update({ is_active: false });
  return findById(id);
};

module.exports = {
  findById,
  findByRoleId,
  isValidForRole,
  create,
  update,
  softDelete,
};
