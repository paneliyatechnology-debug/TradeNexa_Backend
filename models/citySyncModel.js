const db = require('../database/knex');

// ==========================================
// City sync log queries
// ==========================================

const findLogByStateId = (stateId) => db('city_sync_logs').where({ state_id: stateId }).first();

const listLogs = () => db('city_sync_logs').orderBy('state_id', 'asc');

const countByStatus = (status) =>
  db('city_sync_logs').where({ status }).count({ total: '*' }).first();

const upsertPendingLog = async (state) => {
  const existing = await findLogByStateId(state.id);
  if (existing) return existing;

  await db('city_sync_logs').insert({
    state_id: state.id,
    state_code: state.code,
    status: 'pending',
  });

  return findLogByStateId(state.id);
};

const markInProgress = (stateId) =>
  db('city_sync_logs').where({ state_id: stateId }).update({
    status: 'in_progress',
    last_error: null,
    updated_at: db.fn.now(),
  });

const markCompleted = (stateId, payload) =>
  db('city_sync_logs').where({ state_id: stateId }).update({
    status: 'completed',
    api_city_count: payload.apiCityCount,
    imported_count: payload.importedCount,
    db_city_count: payload.dbCityCount,
    last_error: null,
    synced_at: db.fn.now(),
    updated_at: db.fn.now(),
  });

const markFailed = (stateId, errorMessage) =>
  db('city_sync_logs').where({ state_id: stateId }).update({
    status: 'failed',
    last_error: errorMessage,
    updated_at: db.fn.now(),
  });

const getNextPendingState = () =>
  db('states')
    .join('countries', 'states.country_id', 'countries.id')
    .leftJoin('city_sync_logs', 'city_sync_logs.state_id', 'states.id')
    .where('states.is_active', true)
    .whereNotNull('states.code')
    .where((builder) => {
      builder.whereNull('city_sync_logs.id').orWhereIn('city_sync_logs.status', ['pending', 'failed']);
    })
    .select(
      'states.id',
      'states.name',
      'states.code',
      'states.country_id',
      'countries.code as country_code',
      'city_sync_logs.status as sync_status',
    )
    .orderBy('states.id', 'asc')
    .first();

const countCitiesByStateId = (stateId) =>
  db('cities').where({ state_id: stateId }).count({ total: '*' }).first();

const listStatesForSync = (countryCode) =>
  db('states')
    .join('countries', 'states.country_id', 'countries.id')
    .where('countries.code', countryCode)
    .where('states.is_active', true)
    .whereNotNull('states.code')
    .select(
      'states.id',
      'states.name',
      'states.code',
      'states.country_id',
      'countries.code as country_code',
    )
    .orderBy('states.id', 'asc');

const insertCitiesBatch = async (rows) => {
  if (!rows.length) return 0;

  const result = await db('cities')
    .insert(rows)
    .onConflict(['state_id', 'name'])
    .ignore();

  return Array.isArray(result) ? result.length : 0;
};

module.exports = {
  findLogByStateId,
  listLogs,
  countByStatus,
  upsertPendingLog,
  markInProgress,
  markCompleted,
  markFailed,
  getNextPendingState,
  countCitiesByStateId,
  listStatesForSync,
  insertCitiesBatch,
};
