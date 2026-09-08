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
  const languages = [
    { code: LANGUAGE_CODES.ENGLISH, name: 'English', is_active: true },
    { code: LANGUAGE_CODES.HINDI, name: 'Hindi', is_active: true },
    { code: LANGUAGE_CODES.GUJARATI, name: 'Gujarati', is_active: true },
  ];

  for (const lang of languages) {
    const existing = await knex('languages').where({ code: lang.code }).first();
    if (existing) {
      await knex('languages').where({ id: existing.id }).update({ name: lang.name, is_active: lang.is_active });
    } else {
      await knex('languages').insert(lang);
    }
  }
};
