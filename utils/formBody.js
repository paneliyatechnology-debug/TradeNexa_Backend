/**
 * Helpers for parsing multipart/form-data request bodies.
 *
 * Used by resource services to strip file field keys from req.body so media
 * paths are applied only from req.files (never from empty string body values).
 */

// ==========================================
// Body helpers
// ==========================================

/**
 * Remove keys from a body object so upload fields are only applied from req.files.
 * @param {Object} body - Parsed multipart body
 * @param {string[]} keys - Field names to strip (e.g. thumbnail, image, logo)
 * @returns {Object}
 */
const stripFields = (body = {}, keys = []) => {
  const result = { ...body };
  keys.forEach((key) => {
    delete result[key];
  });
  return result;
};

/**
 * True when a value was explicitly sent but is empty (null, blank string, or empty array).
 * @param {*} value
 * @returns {boolean}
 */
const isExplicitlyEmpty = (value) =>
  value === null ||
  value === '' ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);

module.exports = {
  stripFields,
  isExplicitlyEmpty,
};
