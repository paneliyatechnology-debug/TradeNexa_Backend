/**
 * k6 smoke — one request to each selected (safe) API.
 *
 *   k6 run load-tests/k6/smoke.js
 *   k6 run -e BUYER_TOKEN=... -e SELLER_TOKEN=... -e ADMIN_TOKEN=... load-tests/k6/smoke.js
 *   k6 run -e GROUP=products,rfqs load-tests/k6/smoke.js
 *   k6 run -e INCLUDE_WRITES=true load-tests/k6/smoke.js
 */
import { sleep } from 'k6';
import { callEndpoint, getConfig, getTokens, selectedCatalog } from './helpers.js';

const endpoints = selectedCatalog();

export const options = {
  vus: 1,
  iterations: Math.max(1, endpoints.length),
  thresholds: {
    http_req_failed: ['rate<0.5'],
    http_req_duration: ['p(95)<5000'],
  },
};

export function setup() {
  return {
    cfg: getConfig(),
    tokens: getTokens(),
    endpoints,
  };
}

export default function (data) {
  const i = (__ITER || 0) % data.endpoints.length;
  const ep = data.endpoints[i];
  callEndpoint(ep, data.cfg, data.tokens);
  if (data.cfg.thinkMs > 0) sleep(data.cfg.thinkMs / 1000);
}
