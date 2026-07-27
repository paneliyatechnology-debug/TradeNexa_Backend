import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { selectEndpoints } from './endpoints.js';

export const errorRate = new Rate('errors');
export const apiDuration = new Trend('api_duration', true);

export function getConfig() {
  return {
    baseUrl: (__ENV.BASE_URL || 'http://localhost:3000/api/v1').replace(/\/$/, ''),
    origin: (__ENV.ORIGIN || 'http://localhost:3000').replace(/\/$/, ''),
    thinkMs: Number(__ENV.THINK_MS || 0),
  };
}

export function getTokens() {
  const access = __ENV.ACCESS_TOKEN || __ENV.BUYER_TOKEN || '';
  return {
    access,
    buyer: __ENV.BUYER_TOKEN || access,
    seller: __ENV.SELLER_TOKEN || access,
    admin: __ENV.ADMIN_TOKEN || '',
  };
}

function pickToken(auth, tokens) {
  if (!auth) return null;
  if (auth === 'buyer') return tokens.buyer || tokens.access;
  if (auth === 'seller') return tokens.seller || tokens.access;
  if (auth === 'admin') return tokens.admin || tokens.access;
  if (auth === 'any') return tokens.access || tokens.buyer || tokens.seller || tokens.admin;
  return tokens.access;
}

export function buildUrl(ep, cfg) {
  let path = ep.path;
  if (ep.query) {
    const parts = Object.entries(ep.query).map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
    );
    path += (path.includes('?') ? '&' : '?') + parts.join('&');
  }
  if (ep.absolute) return `${cfg.origin}${path.startsWith('/') ? path : `/${path}`}`;
  return `${cfg.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Execute one catalog endpoint. Tags responses with endpoint name for k6 report.
 */
export function callEndpoint(ep, cfg, tokens) {
  const url = buildUrl(ep, cfg);
  const headers = { Accept: 'application/json' };
  const token = pickToken(ep.auth, tokens);
  if (token) headers.Authorization = `Bearer ${token}`;

  const params = {
    headers,
    tags: {
      name: ep.name,
      group: ep.group,
      method: ep.method,
    },
  };

  let res;
  const method = ep.method.toUpperCase();
  if (ep.body != null && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['Content-Type'] = 'application/json';
    res = http.request(method, url, JSON.stringify(ep.body), params);
  } else {
    res = http.request(method, url, null, params);
  }

  const ok = check(res, {
    'status < 400 or expected auth/business error': (r) => r.status > 0,
    'not 5xx': (r) => r.status < 500,
  });

  errorRate.add(!ok || res.status >= 500);
  apiDuration.add(res.timings.duration, { name: ep.name, group: ep.group });

  return res;
}

/**
 * Round-robin pick across selected endpoints for this VU/iteration.
 */
export function nextEndpoint(endpoints, counter) {
  if (!endpoints.length) return null;
  return endpoints[counter % endpoints.length];
}

export function selectedCatalog() {
  return selectEndpoints();
}
