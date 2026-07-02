/**
 * Seed supported application languages.
 */
const { LANGUAGE_CODES } = require('../../constants');

// ==========================================
// Seed data
// ==========================================

/**
 * @param { import("knex").Knex } knex
 */
exports.seed = async function (knex) {
  await knex('languages').del();

  await knex('languages').insert([
    { code: LANGUAGE_CODES.ENGLISH, name: 'English', is_active: true },
    { code: LANGUAGE_CODES.HINDI, name: 'Hindi', is_active: true },
    { code: LANGUAGE_CODES.GUJARATI, name: 'Gujarati', is_active: true },
  ]);
};
