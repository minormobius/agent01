// Cloudflare Worker — CORS proxy for the Duffel flight-search API.
//
// Replaces the Amadeus Self-Service proxy (that tier is folding into Duffel-
// style enterprise channels). Duffel uses a Bearer token (held here as a
// Cloudflare secret, never exposed to the browser) plus a version header.
//
//   GET /search?origin=JFK&destination=LHR&date=2026-06-01[&return=2026-06-10]
//       [&adults=1&children=0&infants=0&cabin=economy&maxConnections=1]
//                                  -> Duffel offers (raw JSON, { offers: [...] })
//   GET /places?query=lon          -> place/airport autocomplete
//   OPTIONS *                      -> CORS preflight
//
// The browser sends simple GET params; the worker translates /search into
// Duffel's POST /air/offer_requests (with ?return_offers=true so offers come
// back inline). Booking is intentionally NOT proxied — search only.

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

function duffelHeaders(env) {
  if (!env.DUFFEL_TOKEN) throw new Error('DUFFEL_TOKEN not configured');
  return {
    Authorization: `Bearer ${env.DUFFEL_TOKEN}`,
    'Duffel-Version': env.DUFFEL_VERSION || 'v2',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// Build a Duffel offer-request body from simple query params.
function buildOfferRequest(q) {
  const origin = q.get('origin');
  const destination = q.get('destination');
  const date = q.get('date');
  if (!origin || !destination || !date) {
    return { error: 'origin, destination, and date are required' };
  }

  const slices = [
    { origin: origin.toUpperCase(), destination: destination.toUpperCase(), departure_date: date },
  ];
  if (q.get('return')) {
    slices.push({
      origin: destination.toUpperCase(),
      destination: origin.toUpperCase(),
      departure_date: q.get('return'),
    });
  }

  const passengers = [];
  const adults = Math.max(1, parseInt(q.get('adults') || '1', 10) || 1);
  for (let i = 0; i < adults; i++) passengers.push({ type: 'adult' });
  const children = parseInt(q.get('children') || '0', 10) || 0;
  for (let i = 0; i < children; i++) passengers.push({ type: 'child' });
  const infants = parseInt(q.get('infants') || '0', 10) || 0;
  for (let i = 0; i < infants; i++) passengers.push({ type: 'infant_without_seat' });

  const data = { slices, passengers };
  const cabin = (q.get('cabin') || '').toLowerCase();
  if (['economy', 'premium_economy', 'business', 'first'].includes(cabin)) {
    data.cabin_class = cabin;
  }
  const maxConnections = q.get('maxConnections');
  if (maxConnections !== null && maxConnections !== '') {
    data.max_connections = Math.max(0, parseInt(maxConnections, 10) || 0);
  }
  return { body: { data } };
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

    if (url.pathname === '/' && !q.get('query') && !q.get('origin')) {
      return new Response(
        'duffel-proxy · GET /search?origin=JFK&destination=LHR&date=2026-06-01\n' +
        '             · GET /places?query=lon\n\n' +
        'CORS-enabled, search-only proxy for the Duffel flight API.\n' +
        'Booking is not proxied.\n',
        { headers: withCors({ 'Content-Type': 'text/plain; charset=utf-8' }) }
      );
    }

    try {
      if (url.pathname === '/places') {
        const query = q.get('query');
        if (!query || query.length < 2) {
          return jsonResponse({ error: 'query (>= 2 chars) required' }, 400);
        }
        const res = await fetch(
          `${env.DUFFEL_BASE}/places/suggestions?query=${encodeURIComponent(query)}`,
          { headers: duffelHeaders(env) }
        );
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch { json = { raw: text }; }
        return jsonResponse(json, res.ok ? 200 : res.status);
      }

      if (url.pathname === '/search') {
        const built = buildOfferRequest(q);
        if (built.error) return jsonResponse({ error: built.error }, 400);

        const res = await fetch(
          `${env.DUFFEL_BASE}/air/offer_requests?return_offers=true&supplier_timeout=15000`,
          { method: 'POST', headers: duffelHeaders(env), body: JSON.stringify(built.body) }
        );
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch { json = { raw: text }; }
        if (!res.ok) {
          return jsonResponse({ error: 'duffel error', status: res.status, detail: json }, res.status);
        }
        // return_offers=true puts offers inline on data.offers
        const offers = json?.data?.offers || [];
        return jsonResponse({ offers, offerRequestId: json?.data?.id || null });
      }

      return jsonResponse({ error: 'not found' }, 404);
    } catch (e) {
      return jsonResponse({ error: e.message }, 502);
    }
  },
};
