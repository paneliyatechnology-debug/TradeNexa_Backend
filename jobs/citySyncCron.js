/**
 * City sync cron — imports cities state-by-state from CSC API.
 * Automatically stops when all states are synced successfully.
 */
const citySyncService = require('../services/citySyncService');
const config = require('../config');
const logger = require('../utils/logger');

let intervalRef = null;
let isRunning = false;

const stopCitySyncCron = (reason) => {
  if (intervalRef) {
    clearInterval(intervalRef);
    intervalRef = null;
  }
  logger.info('City sync cron stopped', { reason });
};

const runCitySyncTick = async () => {
  if (isRunning) {
    logger.debug('City sync tick skipped — previous run still in progress');
    return;
  }

  if (!(config.cscApi.apiKey)) {
    stopCitySyncCron('CSC_API_KEY missing');
    return;
  }

  isRunning = true;

  try {
    const complete = await citySyncService.isSyncComplete();
    if (complete) {
      const summary = await citySyncService.getSyncSummary();
      stopCitySyncCron('all states synced');
      logger.info('City sync finished for all states', summary);
      return;
    }

    await citySyncService.initializeSyncQueue();
    const result = await citySyncService.syncNextState();

    if (!result) {
      const summary = await citySyncService.getSyncSummary();
      if (summary.isComplete) {
        stopCitySyncCron('all states synced');
        logger.info('City sync finished for all states', summary);
      } else if (summary.failedStates > 0) {
        logger.warn('City sync queue paused — failed states remain', summary);
      }
      return;
    }

    const summary = await citySyncService.getSyncSummary();
    logger.info('City sync progress', summary);

    if (summary.isComplete) {
      stopCitySyncCron('all states synced');
      logger.info('City sync finished for all states', summary);
    }
  } catch (error) {
    logger.error('City sync cron tick failed', { error: error.message });
  } finally {
    isRunning = false;
  }
};

/**
 * Start city sync cron if enabled in config.
 * Processes one state per interval; stops when all states are completed.
 */
const startCitySyncCron = async () => {
  const { cronEnabled, apiKey, cronIntervalMs } = config.cscApi;

  if (!cronEnabled) return;
  if (!apiKey) {
    logger.warn('City sync cron disabled — CSC_API_KEY is not set');
    return;
  }

  if (await citySyncService.isSyncComplete()) {
    logger.info('City sync cron not started — all states already synced');
    return;
  }

  await citySyncService.initializeSyncQueue();

  logger.info('City sync cron started', { intervalMs: cronIntervalMs });
  await runCitySyncTick();

  intervalRef = setInterval(runCitySyncTick, cronIntervalMs);
};

module.exports = {
  startCitySyncCron,
  stopCitySyncCron,
  runCitySyncTick,
};
