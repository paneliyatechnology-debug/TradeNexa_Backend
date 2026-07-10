#!/usr/bin/env node
/**
 * One-shot city import from CountryStateCity API.
 * Run on Railway (or any host that can reach the DB and CSC API).
 *
 * Usage:
 *   npm run sync:cities
 */
require('dotenv').config();

const db = require('../database/knex');
const citySyncService = require('../services/citySyncService');
const logger = require('../utils/logger');

const main = async () => {
  try {
    await db.raw('SELECT 1');
    logger.info('Starting full city sync...');

    const summary = await citySyncService.syncAllPendingStates();

    if (!summary.isComplete) {
      logger.error('City sync incomplete', summary);
      process.exitCode = 1;
      return;
    }

    logger.info('City sync completed successfully', summary);
  } catch (error) {
    logger.error('City sync script failed', { error: error.message });
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
};

main();
