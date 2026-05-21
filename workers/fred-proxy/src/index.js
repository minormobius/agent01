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

// Workers default User-Agent ("Cloudflare-Workers") gets blocked or
// throttled by some upstream Cloudflare-protected origins as a bot.
// Send real-looking browser headers so FRED treats us like a regular client.
const UPSTREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; mino.mobi-fred-proxy/1.0)',
  'Accept': 'text/csv, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function withCors(headers = {}) {
  return { ...headers, ...CORS };
}

// Fetch with retry on 5xx and transient network errors. FRED's CDN
// occasionally 520s a request that succeeds on retry.
async function fetchWithRetry(url, init, maxTries = 3) {
  let lastErr;
  for (let i = 0; i < maxTries; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 250 * (1 << i))); // 0, 500ms, 1s
    try {
      const res = await fetch(url, init);
      if (res.status < 500) return res;       // 2xx/3xx/4xx — not a server bug, return as-is
      lastErr = new Error(`upstream ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('upstream failed');
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    // Landing page (no id) — friendly text
    if (request.method === 'GET' && url.pathname === '/' && !id) {
      return new Response(
        'fred-proxy · GET /?id=UNRATE\n\n' +
        'CORS-enabled mirror of fred.stlouisfed.org/graph/fredgraph.csv.\n' +
        'Multi-series via comma-separated ids (e.g. ?id=UNRATE,LNS14027659).\n' +
        'Edge-cached 1h. Allowlist: fred.stlouisfed.org only.\n',
        { headers: withCors({ 'Content-Type': 'text/plain; charset=utf-8' }) }
      );
    }
    if (request.method !== 'GET') {
      return new Response('GET only', { status: 405, headers: CORS });
    }
    if (!id) {
      return new Response('missing id', { status: 400, headers: CORS });
    }
    if (!ID_RE.test(id)) {
      return new Response('invalid id (must match [A-Za-z0-9_,]+)', { status: 400, headers: CORS });
    }

    // Edge cache lookup. Key by id (one URL per series set).
    const cacheKey = new Request(`https://fred-proxy-cache/${encodeURIComponent(id)}`, { method: 'GET' });
    const cache = caches.default;
    let cached = await cache.match(cacheKey);
    if (cached) {
      const fresh = new Response(cached.body, cached);
      for (const [k, v] of Object.entries(CORS)) fresh.headers.set(k, v);
      fresh.headers.set('X-Cache', 'HIT');
      return fresh;
    }

    // Fetch from FRED (server-side, no CORS in play).
    let upstream;
    try {
      upstream = await fetchWithRetry(`${FRED_BASE}?id=${encodeURIComponent(id)}`, {
        headers: UPSTREAM_HEADERS,
        // Cloudflare-specific hints: cache upstream too, follow redirects
        cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
        redirect: 'follow',
      });
    } catch (e) {
      return new Response(`upstream fetch failed: ${e.message}`, { status: 502, headers: CORS });
    }
    if (!upstream.ok) {
      // Surface the upstream body excerpt — FRED sometimes returns an HTML
      // error page that helps diagnose blocks vs throttling vs bad-id.
      let excerpt = '';
      try { excerpt = (await upstream.text()).slice(0, 200); } catch {}
      return new Response(
        `FRED returned ${upstream.status} for ${id}${excerpt ? ': ' + excerpt : ''}`,
        { status: upstream.status, headers: CORS }
      );
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
