// Cloudflare Worker — CORS proxy for FRED's fredgraph.csv endpoint.
//
// FRED's public CSV endpoint doesn't send Access-Control-Allow-Origin,
// so browsers can't read responses via fetch(). This worker fetches
// server-side (where CORS doesn't apply) and returns the same body
// with permissive CORS headers and 1-hour edge caching.
//
//   GET /?id=UNRATE                  -> CSV for that series
//   GET /?id=UNRATE,LNS14027689,...  -> multi-series CSV (FRED-native)
//   OPTIONS *                        -> CORS preflight
//
// Allowlist: only proxies fred.stlouisfed.org/graph/fredgraph.csv — this
// is not a general open CORS proxy.

const FRED_BASE = 'https://fred.stlouisfed.org/graph/fredgraph.csv';
const ID_RE = /^[A-Za-z0-9_,]+$/;
const CACHE_TTL = 3600; // 1h — FRED data refreshes monthly so this is generous

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function withCors(headers = {}) {
  return { ...headers, ...CORS };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }
    if (request.method === 'GET' && new URL(request.url).pathname === '/') {
      // health/landing — friendly text
      const url = new URL(request.url);
      if (!url.searchParams.get('id')) {
        return new Response(
          'fred-proxy · GET /?id=UNRATE\n\n' +
          'CORS-enabled mirror of fred.stlouisfed.org/graph/fredgraph.csv.\n' +
          'Multi-series via comma-separated ids (e.g. ?id=UNRATE,LNS14027659).\n' +
          'Edge-cached 1h. Allowlist: fred.stlouisfed.org only.\n',
          { headers: withCors({ 'Content-Type': 'text/plain; charset=utf-8' }) }
        );
      }
    }
    if (request.method !== 'GET') {
      return new Response('GET only', { status: 405, headers: CORS });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return new Response('missing id', { status: 400, headers: CORS });
    }
    if (!ID_RE.test(id)) {
      return new Response('invalid id (must match [A-Za-z0-9_,]+)', { status: 400, headers: CORS });
    }

    // Edge cache lookup. Key by id only (one URL per series set).
    const cacheKey = new Request(`https://fred-proxy-cache/${encodeURIComponent(id)}`, { method: 'GET' });
    const cache = caches.default;
    let cached = await cache.match(cacheKey);
    if (cached) {
      // Decorate with CORS in case the cached entry's headers drift.
      const fresh = new Response(cached.body, cached);
      for (const [k, v] of Object.entries(CORS)) fresh.headers.set(k, v);
      fresh.headers.set('X-Cache', 'HIT');
      return fresh;
    }

    // Fetch from FRED (server-side, no CORS in play)
    let upstream;
    try {
      upstream = await fetch(`${FRED_BASE}?id=${encodeURIComponent(id)}`);
    } catch (e) {
      return new Response('upstream fetch failed: ' + e.message, { status: 502, headers: CORS });
    }
    if (!upstream.ok) {
      return new Response(`FRED returned ${upstream.status}`, { status: upstream.status, headers: CORS });
    }
    const body = await upstream.text();

    const response = new Response(body, {
      status: 200,
      headers: withCors({
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
        'X-Cache': 'MISS',
        'X-Proxy-Source': 'fred.stlouisfed.org',
      }),
    });

    // Store in edge cache. waitUntil keeps the put alive after we respond.
    if (ctx?.waitUntil) ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
