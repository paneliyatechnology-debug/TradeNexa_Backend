/**
 * Shared address formatting for API responses (profile, product seller address, etc.)
 */

/**
 * @param {Object|null|undefined} row - Row with address fields and optional country/state/city names
 * @returns {Object|null}
 */
const formatAddressResponse = (row) => {
  if (!row) return null;

  const hasAddress =
    row.address_line_1 != null ||
    row.address_line_2 != null ||
    row.pincode != null ||
    row.country_id != null ||
    row.state_id != null ||
    row.city_id != null;

  if (!hasAddress) return null;

  return {
    address_line_1: row.address_line_1 ?? null,
    address_line_2: row.address_line_2 ?? null,
    pincode: row.pincode ?? null,
    country_id: row.country_id != null ? Number(row.country_id) : null,
    state_id: row.state_id != null ? Number(row.state_id) : null,
    city_id: row.city_id != null ? Number(row.city_id) : null,
    country: row.country ?? null,
    state: row.state ?? null,
    city: row.city ?? null,
  };
};

module.exports = { formatAddressResponse };
