// Cloudflare Worker — CORS proxy + OAuth front for the Amadeus Self-Service API.
//
// Amadeus uses an OAuth2 client_credentials flow: the client_id/secret are
// exchanged for a short-lived (~30 min) bearer token. The secret must never
// reach the browser, so this worker holds it (Cloudflare secret), manages the
// token, and proxies the read-only search endpoints with permissive CORS.
//
//   GET /search?origin=JFK&destination=LHR&date=2026-06-01[&return=2026-06-10]
//       [&adults=1&children=0&cabin=ECONOMY&nonStop=false&maxPrice=2000]
//       [&currency=USD&max=50]
//                                  -> Amadeus flight-offers (raw JSON)
//   GET /locations?keyword=lon     -> airport/city autocomplete
//   OPTIONS *                      -> CORS preflight
//
// Booking is intentionally NOT proxied — that needs accreditation + payment
// handling. This is search only; the frontend deep-links out to book.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function withCors(headers = {}) {
  return { ...headers, ...CORS };
}
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: withCors({ 'Content-Type': 'application/json; charset=utf-8' }),
  });
}

// Token cache lives at module scope: reused across requests within a warm
// isolate (minutes-to-hours), re-fetched on cold start or near expiry.
let tokenCache = null; // { token, expiresAt }

async function getToken(env) {
  const now = Date.now();
  if (tokenCache && now < tokenCache.expiresAt - 60_000) return tokenCache.token;

  const id = env.AMADEUS_CLIENT_ID;
  const secret = env.AMADEUS_CLIENT_SECRET;
  if (!id || !secret) throw new Error('AMADEUS_CLIENT_ID / AMADEUS_CLIENT_SECRET not configured');

  const res = await fetch(`${env.AMADEUS_BASE}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: secret,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`token ${res.status}: ${body.slice(0, 200)}`);
  }
  const j = await res.json();
  tokenCache = { token: j.access_token, expiresAt: now + (j.expires_in || 1800) * 1000 };
  return tokenCache.token;
}

async function amadeusGet(env, path, searchParams) {
  const token = await getToken(env);
  const url = `${env.AMADEUS_BASE}${path}?${searchParams.toString()}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

function buildSearchParams(q) {
  const origin = q.get('origin');
  const destination = q.get('destination');
  const date = q.get('date');
  if (!origin || !destination || !date) {
    return { error: 'origin, destination, and date are required' };
  }
  const p = new URLSearchParams({
    originLocationCode: origin.toUpperCase(),
    destinationLocationCode: destination.toUpperCase(),
    departureDate: date,
    adults: q.get('adults') || '1',
    max: q.get('max') || '50',
    currencyCode: q.get('currency') || 'USD',
  });
  if (q.get('return')) p.set('returnDate', q.get('return'));
  if (q.get('children')) p.set('children', q.get('children'));
  if (q.get('infants')) p.set('infants', q.get('infants'));
  if (q.get('cabin')) p.set('travelClass', q.get('cabin').toUpperCase());
  if (q.get('nonStop') === 'true') p.set('nonStop', 'true');
  if (q.get('maxPrice')) p.set('maxPrice', q.get('maxPrice'));
  return { params: p };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'GET only' }, 405);
    }

    const url = new URL(request.url);
    const q = url.searchParams;

    // Landing / health
    if (url.pathname === '/' && !q.get('keyword') && !q.get('origin')) {
      return new Response(
        'amadeus-proxy · GET /search?origin=JFK&destination=LHR&date=2026-06-01\n' +
        '              · GET /locations?keyword=lon\n\n' +
        'OAuth-fronted, CORS-enabled, search-only proxy for the Amadeus\n' +
        'Self-Service API. Booking is not proxied.\n',
        { headers: withCors({ 'Content-Type': 'text/plain; charset=utf-8' }) }
      );
    }

    try {
      if (url.pathname === '/locations') {
        const keyword = q.get('keyword');
        if (!keyword || keyword.length < 2) {
          return jsonResponse({ error: 'keyword (>= 2 chars) required' }, 400);
        }
        const p = new URLSearchParams({
          subType: 'AIRPORT,CITY',
          keyword,
          'page[limit]': q.get('limit') || '8',
        });
        const { status, json } = await amadeusGet(env, '/v1/reference-data/locations', p);
        return jsonResponse(json, status === 200 ? 200 : status);
      }

      if (url.pathname === '/search') {
        const built = buildSearchParams(q);
        if (built.error) return jsonResponse({ error: built.error }, 400);
        const { status, json } = await amadeusGet(env, '/v2/shopping/flight-offers', built.params);
        return jsonResponse(json, status === 200 ? 200 : status);
      }

      return jsonResponse({ error: 'not found' }, 404);
    } catch (e) {
      return jsonResponse({ error: e.message }, 502);
    }
  },
};
