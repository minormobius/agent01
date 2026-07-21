// civ — the civilization-evolution API (civ.mino.mobi)
//
// A headless coevolutionary agent-based civilization simulation on a mappa world, exposed as a
// CORS-open, edge-cached, no-key API (same posture as /api/world). The request logic (params →
// chronicle payload) lives in mappa/civ/api.js and is SHARED with the browser bundle
// (civ/lib/civ-engine.js), so a run computed client-side is bit-identical to one from the edge.
// The worker just does HTTP: parse, dispatch, serialize, and fall through to static assets.

import { CAP, PRESETS, doRun, doFrames, doSweep, doSites, doTimeline } from '../mappa/civ/api.js';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
function json(obj, status = 200, cache = false) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache ? 'public, max-age=31536000, immutable' : 'no-store', ...CORS },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    try {
      // Fine meshes are browser-compute only: reject instead of silently clamping n to
      // the edge cap — a clamped n would generate a DIFFERENT world than requested.
      if (p.startsWith('/api/civ/')) {
        const nReq = Math.round(parseFloat(url.searchParams.get('n') || '0'));
        if (nReq > CAP.runN) return json({ error: 'mesh too fine for the edge', detail: `n=${nReq} exceeds the edge cap (${CAP.runN}); this resolution computes client-side — load the run in a civ.mino.mobi page and it runs in your browser` }, 400);
      }
      if (p === '/api/civ/health') return json({ ok: true, site: 'civ', caps: CAP, presets: Object.keys(PRESETS) });
      if (p === '/api/civ/run') return json(doRun(url.searchParams), 200, true);
      if (p === '/api/civ/sites') return json(doSites(url.searchParams), 200, true);
      if (p === '/api/civ/timeline') return json(doTimeline(url.searchParams), 200, true);
      if (p === '/api/civ/frames') return json(doFrames(url.searchParams), 200, true);
      if (p === '/api/civ/sweep') {
        let body = null;
        if (request.method === 'POST') { try { body = await request.json(); } catch { /* fall back to query params */ } }
        return json(doSweep(url.searchParams, body), 200, true);
      }
    } catch (e) {
      return json({ error: 'sim failed', detail: String(e && e.message || e) }, 400);
    }
    // Legacy permalinks: the dashboard used to live at `/`, so shared run URLs look like
    // /?world=7&preset=kurgan… — `/` is now the suite hub, the dashboard is /dash/.
    // Redirect any root request carrying run params so old permalinks keep resolving.
    if (p === '/' && ['world', 'config', 'preset'].some((k) => url.searchParams.has(k))) {
      return Response.redirect(url.origin + '/dash/' + url.search, 301);
    }
    // everything else → static assets (landing page)
    return env.ASSETS.fetch(request);
  },
};
