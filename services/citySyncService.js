const citySyncModel = require('../models/citySyncModel');
const { fetchCitiesByState } = require('./cscApiClient');
const config = require('../config');
const logger = require('../utils/logger');

const BATCH_SIZE = 200;

const normalizeCityName = (name) => String(name || '').trim().slice(0, 100);

/**
 * Initialize sync log rows for all active states in configured country.
 */
const initializeSyncQueue = async () => {
  const states = await citySyncModel.listStatesForSync(config.cscApi.countryCode);

  for (const state of states) {
    await citySyncModel.upsertPendingLog(state);
  }

  return states.length;
};

/**
 * Import cities for a single state from CSC API.
 * @param {{ id: number, code: string, country_code: string, name: string }} state
 */
const syncStateCities = async (state) => {
  const stateCode = String(state.code).toUpperCase();
  const countryCode = String(state.country_code || config.cscApi.countryCode).toUpperCase();

  await citySyncModel.markInProgress(state.id);

  const apiCities = await fetchCitiesByState(countryCode, stateCode);
  if (!apiCities.length) {
    throw new Error(`No cities returned from CSC API for ${state.name} (${stateCode})`);
  }

  const uniqueNames = new Map();
  for (const city of apiCities) {
    const name = normalizeCityName(city.name);
    if (name) uniqueNames.set(name.toLowerCase(), name);
  }

  const rows = [...uniqueNames.values()].map((name) => ({
    state_id: state.id,
    name,
    is_active: true,
  }));

  let insertedTotal = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    insertedTotal += await citySyncModel.insertCitiesBatch(chunk);
  }

  const dbCountRow = await citySyncModel.countCitiesByStateId(state.id);
  const dbCityCount = Number(dbCountRow?.total || 0);
  const apiCityCount = rows.length;

  if (dbCityCount < apiCityCount) {
    throw new Error(
      `City count mismatch for ${state.name}: API=${apiCityCount}, DB=${dbCityCount}`,
    );
  }

  await citySyncModel.markCompleted(state.id, {
    apiCityCount,
    importedCount: insertedTotal,
    dbCityCount,
  });

  logger.info('City sync completed for state', {
    state: state.name,
    stateCode,
    apiCityCount,
    insertedTotal,
    dbCityCount,
  });

  return {
    stateId: state.id,
    stateName: state.name,
    stateCode,
    apiCityCount,
    insertedTotal,
    dbCityCount,
  };
};

/**
 * Sync the next pending/failed state. Returns null when queue is empty.
 */
const syncNextState = async () => {
  const state = await citySyncModel.getNextPendingState();
  if (!state) return null;

  try {
    return await syncStateCities(state);
  } catch (error) {
    await citySyncModel.markFailed(state.id, error.message);
    logger.error('City sync failed for state', {
      state: state.name,
      stateCode: state.code,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Sync all remaining states sequentially until done or fatal error.
 */
const syncAllPendingStates = async () => {
  await initializeSyncQueue();

  const results = [];

  while (true) {
    const state = await citySyncModel.getNextPendingState();
    if (!state) break;

    try {
      const result = await syncStateCities(state);
      results.push(result);
    } catch (error) {
      results.push({
        stateId: state.id,
        stateName: state.name,
        stateCode: state.code,
        error: error.message,
      });
    }
  }

  return getSyncSummary(results);
};

const getSyncSummary = async (latestResults = []) => {
  const [completed, failed, pending, inProgress] = await Promise.all([
    citySyncModel.countByStatus('completed'),
    citySyncModel.countByStatus('failed'),
    citySyncModel.countByStatus('pending'),
    citySyncModel.countByStatus('in_progress'),
  ]);

  const completedCount = Number(completed?.total || 0);
  const failedCount = Number(failed?.total || 0);
  const pendingCount = Number(pending?.total || 0);
  const inProgressCount = Number(inProgress?.total || 0);
  const totalStates = await citySyncModel.listStatesForSync(config.cscApi.countryCode);
  const isComplete = pendingCount === 0 && inProgressCount === 0 && failedCount === 0;

  return {
    isComplete,
    totalStates: totalStates.length,
    completedStates: completedCount,
    failedStates: failedCount,
    pendingStates: pendingCount,
    inProgressStates: inProgressCount,
    latestResults,
  };
};

const isSyncComplete = async () => {
  const summary = await getSyncSummary();
  return summary.isComplete && summary.completedStates === summary.totalStates;
};

module.exports = {
  initializeSyncQueue,
  syncStateCities,
  syncNextState,
  syncAllPendingStates,
  getSyncSummary,
  isSyncComplete,
};
