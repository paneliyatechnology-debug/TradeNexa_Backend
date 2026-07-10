const config = require('../config');
const logger = require('../utils/logger');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseCitiesPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

/**
 * Fetch cities for a state from CountryStateCity API.
 * @param {string} countryCode - e.g. IN
 * @param {string} stateCode - e.g. MH
 * @returns {Promise<Array<{ id?: number, name: string }>>}
 */
const fetchCitiesByState = async (countryCode, stateCode, attempt = 1) => {
  const { baseUrl, apiKey, requestDelayMs, maxRetries } = config.cscApi;

  if (!apiKey) {
    throw new Error('CSC_API_KEY is not configured');
  }

  if (attempt === 1 && requestDelayMs > 0) {
    await sleep(requestDelayMs);
  }

  const url = `${baseUrl}/countries/${countryCode}/states/${stateCode}/cities`;
  const response = await fetch(url, {
    headers: {
      'X-CSCAPI-KEY': apiKey,
      Accept: 'application/json',
    },
  });

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after') || 60);
    if (attempt <= maxRetries) {
      logger.warn('CSC API rate limited — retrying', {
        stateCode,
        retryAfter,
        attempt,
      });
      await sleep(retryAfter * 1000);
      return fetchCitiesByState(countryCode, stateCode, attempt + 1);
    }
    throw new Error(`CSC API rate limit exceeded for state ${stateCode}`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`CSC API error ${response.status} for ${stateCode}: ${body.slice(0, 200)}`);
  }

  const payload = await response.json();
  return parseCitiesPayload(payload);
};

module.exports = {
  fetchCitiesByState,
};
