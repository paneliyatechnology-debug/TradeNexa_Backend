/**
 * k6 load — distribute TOTAL_REQUESTS across all selected APIs with VUS concurrency.
 *
 *   k6 run --vus 50 --iterations 500 load-tests/k6/load.js
 *   k6 run --vus 100 --iterations 1000 load-tests/k6/load.js
 *   k6 run -e GROUP=products,sellers --vus 50 --iterations 500 load-tests/k6/load.js
 *   k6 run -e INCLUDE_WRITES=true --vus 20 --iterations 200 load-tests/k6/load.js
 */
import { sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { callEndpoint, getConfig, getTokens, selectedCatalog } from './helpers.js';

const endpoints = new SharedArray('endpoints', () => selectedCatalog());

const totalRequests = Number(__ENV.TOTAL_REQUESTS || 500);
const vus = Number(__ENV.VUS || 50);

export const options = {
  vus,
  iterations: Math.max(vus, totalRequests),
  maxDuration: __ENV.MAX_DURATION || '10m',
  thresholds: {
    http_req_failed: ['rate<0.3'],
    http_req_duration: ['p(95)<3000', 'p(99)<8000'],
    errors: ['rate<0.3'],
  },
};

export function setup() {
  if (!endpoints.length) {
    throw new Error('No endpoints selected. Check GROUP / INCLUDE_WRITES filters.');
  }
  console.log(`k6 load: ${endpoints.length} endpoints, iterations=${options.iterations}, vus=${options.vus}`);
  return {
    cfg: getConfig(),
    tokens: getTokens(),
  };
}

export default function (data) {
  const ep = endpoints[__ITER % endpoints.length];
  callEndpoint(ep, data.cfg, data.tokens);
  if (data.cfg.thinkMs > 0) sleep(data.cfg.thinkMs / 1000);
}
