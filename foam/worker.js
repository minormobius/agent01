// foam worker — static assets + the DUNGEON API for foam.mino.mobi.
//
// foam is the first-person interactive space inside the rind's voronoi foam:
// the pocket generator, the walker and the shiva tools all run client-side
// (foamworld.js + app.js). The dungeon layer is pure, dependency-free,
// deterministic ESM — so this worker can also run it SERVER-SIDE and serve
// maps to any client that speaks HTTP, no JS required:
//
//   GET /api/dungeon?seed=5&n=3&shape=hex&scale=0.35&size=m&twin=1
//     → the canonical foam-dungeon JSON (dungeon/FORMAT.md is the contract)
//   GET /api/content?seed=5&…&roll=7&tune=lo,tr,ob,en,tf,gr
//     → the content roll for that map (a SEPARATE document, bound to the
//       map by layout signature — same as the pages)
//   GET /api  → usage
//
// Determinism is the whole trick: (params) → byte-identical JSON, forever
// under one DUNGEON_VERSION. So every response is edge-cached immutable,
// keyed on the NORMALIZED params + the generator versions — the first
// summon of a given dungeon pays the CPU, every repeat is a cache hit.
//
// No D1, no Durable Object, no secrets beyond the shared Cloudflare deploy creds.

import { generateDungeon, TILE_SHAPES, SIZES, DUNGEON_VERSION } from './dungeon.mjs';
import { dungeonToJSON, layoutSignature } from './dungeon-export.mjs';
import { rollContent, CONTENT_VERSION, tuningFromParam } from './dungeon-content.mjs';

const CORS = { 'access-control-allow-origin': '*' };

// ------------------------------------------------------ version pinning ----
// A consumer that SAVED something derived from a dungeon (floor plans,
// placements, anything keyed to geometry) needs the generator to be a
// contract, not a moving target. Stamping the version in the response is
// only advisory — by the time a client reads it, it has already been
// handed geometry it did not ask for. So `v` (and `cv` for content rolls)
// PIN the request:
//
//   v absent      → whatever is current (the old behaviour, unchanged)
//   v = a version we can build → that version, exactly
//   v = anything else          → 409, naming what IS available
//
// Never a silent substitution. A pinned request either gets the geometry
// it asked for or an error it can act on.
//
// THE FREEZE POLICY, which is what makes pinning mean anything later:
// bumping DUNGEON_VERSION must FREEZE the outgoing generator — copy the
// modules to a versioned path (dungeon-v4.mjs …), import them here, and
// register them below. The registry is the list of versions this service
// can honestly serve; preflight asserts every advertised version has an
// implementation. Until a bump happens there is exactly one entry, and
// `v=4` is a strict guard: the day v5 ships, a client pinned to v4 keeps
// getting v4 if it was frozen, and a loud 409 if it was not — never
// relocated floors.
const GENERATORS = {
  [DUNGEON_VERSION]: { generateDungeon, dungeonToJSON },
};
const CONTENT_ROLLERS = {
  [CONTENT_VERSION]: { rollContent },
};
// exported so CI can assert the policy holds: the current version is always
// servable, and every version this service advertises has an implementation
// behind it (see test/dungeon.selftest.mjs).
// The response ENVELOPE's revision. Entries are cached immutable for a
// year, so a change to the headers a response carries (not just its body)
// must invalidate them — otherwise clients keep getting last month's
// envelope from the edge. Bump on any change to what handleApi returns
// around the body.
const API_REV = 2;
export const API_VERSIONS = {
  dungeon: Object.keys(GENERATORS).map(Number),
  content: Object.keys(CONTENT_ROLLERS).map(Number),
};

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', ...CORS, ...extra },
});

// parse + clamp the shared params exactly the way the pages do; returns
// { params, canon } — canon is the normalized cache-key query string
function readParams(sp) {
  const p = {
    seed: Math.max(1, parseInt(sp.get('seed') ?? '1', 10) || 1),
    n: Math.min(6, Math.max(1, parseInt(sp.get('n') ?? '3', 10) || 3)),
    shape: TILE_SHAPES.includes(sp.get('shape')) ? sp.get('shape') : 'grid',
    scale: Math.min(1, Math.max(0.08, parseFloat(sp.get('scale') ?? '0.35') || 0.35)),
    size: SIZES[sp.get('size')] ? sp.get('size') : 'm',
    twin: sp.get('twin') === '1',
    starts: Math.min(4, Math.max(1, parseInt(sp.get('starts') ?? '1', 10) || 1)),
    roll: Math.max(1, parseInt(sp.get('roll') ?? '1', 10) || 1),
    tune: sp.get('tune') ?? '',
    v: sp.get('v') === null || sp.get('v') === 'latest' ? null : parseInt(sp.get('v'), 10),
    cv: sp.get('cv') === null || sp.get('cv') === 'latest' ? null : parseInt(sp.get('cv'), 10),
  };
  // reject typos loudly rather than silently defaulting the two enums
  if (sp.get('shape') && !TILE_SHAPES.includes(sp.get('shape'))) {
    return { error: 'unknown shape "' + sp.get('shape') + '" — one of: ' + TILE_SHAPES.join(', ') };
  }
  if (sp.get('size') && !SIZES[sp.get('size')]) {
    return { error: 'unknown size "' + sp.get('size') + '" — one of: ' + Object.keys(SIZES).join(', ') };
  }
  const canon = 'seed=' + p.seed + '&n=' + p.n + '&shape=' + p.shape + '&scale=' + p.scale +
    '&size=' + p.size + (p.twin ? '&twin=1' : '') + (p.starts > 1 ? '&starts=' + p.starts : '');
  return { params: p, canon };
}

const USAGE = {
  service: 'foam-dungeon api',
  contract: 'https://foam.mino.mobi/dungeon/FORMAT.md',
  endpoints: {
    '/api/dungeon': {
      returns: 'canonical foam-dungeon JSON (the map)',
      params: {
        seed: 'int ≥1 (default 1)',
        n: 'endpoints 1–6 (default 3)',
        shape: TILE_SHAPES.join('|') + ' (default grid)',
        scale: 'tile scale 0.08–1 (default 0.35)',
        size: Object.keys(SIZES).join('|') + ' (default m)',
        twin: '1 = the intertwined pair (two disjoint dungeons, one foam)',
        starts: '2–4 = confluence: k far-apart starts descending to ONE shared chamber, ' +
          'routes sharing no chamber until they arrive. CPU-heavy (the generator searches ' +
          'foams until one can carry k disjoint descents) — often exceeds the edge limit; ' +
          'import the modules for this mode.',
      },
      versions: { dungeon: DUNGEON_VERSION, servable: Object.keys(GENERATORS).map(Number) },
      pinning: 'v=<version> pins the generator: served exactly, or 409 naming what is ' +
        'available — geometry is never silently substituted. Omit (or v=latest) for current. ' +
        'Every response carries x-dungeon-version and x-layout-signature (the geometry ' +
        'fingerprint) so a saved artefact can detect drift.',
    },
    '/api/content': {
      returns: 'foam-dungeon-content JSON (the roll) for the same map params',
      params: {
        roll: 'int ≥1 (default 1) — reroll without touching the map',
        tune: 'lo,tr,ob,en,tf,gr — the forge tuning block (optional)',
        '…': 'plus every /api/dungeon param, to name the map',
      },
      versions: {
        dungeon: DUNGEON_VERSION, content: CONTENT_VERSION,
        servable: { dungeon: Object.keys(GENERATORS).map(Number), content: Object.keys(CONTENT_ROLLERS).map(Number) },
      },
      pinning: 'v=<version> pins the map generator, cv=<version> the content roller; ' +
        'either unservable is a 409.',
    },
  },
  determinism: 'same params → byte-identical response, immutable per version; responses are edge-cached',
  note: 'generation is CPU-bound: s/m/l summon reliably; xl can exceed the edge CPU limit ' +
    '(a 503 with Cloudflare error 1102 — not retryable, the work is deterministic). For xl, ' +
    'import the modules instead: https://foam.mino.mobi/dungeon.mjs (CORS-open, node ≥18 or browser).',
};

async function handleApi(url) {
  const path = url.pathname.replace(/\/$/, '');
  if (path === '/api') return json(USAGE);
  if (path !== '/api/dungeon' && path !== '/api/content') {
    return json({ error: 'no such endpoint', see: '/api' }, 404);
  }
  const r = readParams(url.searchParams);
  if (r.error) return json({ error: r.error }, 400);
  const { params, canon } = r;
  const wantContent = path === '/api/content';

  // resolve the pin BEFORE anything else: an unservable version is a 409,
  // never a silent substitution
  const wantV = params.v ?? DUNGEON_VERSION;
  const gen = GENERATORS[wantV];
  if (!gen) {
    return json({
      error: 'cannot serve dungeon version ' + params.v,
      requested: params.v, current: DUNGEON_VERSION,
      available: Object.keys(GENERATORS).map(Number),
      hint: 'omit v (or v=latest) for the current generator. A pinned version is served ' +
        'only while this service still carries that generator; geometry is never ' +
        'silently substituted.',
    }, 409);
  }
  const wantCV = params.cv ?? CONTENT_VERSION;
  const roller = CONTENT_ROLLERS[wantCV];
  if (wantContent && !roller) {
    return json({
      error: 'cannot serve content version ' + params.cv,
      requested: params.cv, current: CONTENT_VERSION,
      available: Object.keys(CONTENT_ROLLERS).map(Number),
      hint: 'omit cv (or cv=latest) for the current roller.',
    }, 409);
  }

  // edge cache, keyed on normalized params + the RESOLVED versions
  const key = new Request(url.origin + path + '?' + canon +
    (wantContent ? '&roll=' + params.roll + (params.tune ? '&tune=' + params.tune : '') : '') +
    '&v=' + wantV + (wantContent ? '.' + wantCV : '') + '&rev=' + API_REV);
  const cache = globalThis.caches?.default;
  const hit = await cache?.match(key);
  if (hit) {
    const out = new Response(hit.body, hit);
    out.headers.set('x-cache', 'hit');
    return out;
  }

  const t0 = Date.now();
  const dungeon = gen.generateDungeon({
    seed: params.seed, endpoints: params.n, tileShape: params.shape,
    tileScale: params.scale, twin: params.twin, starts: params.starts,
    ...(url.searchParams.get('size') ? { size: params.size } : {}),
  });
  const doc = gen.dungeonToJSON(dungeon);
  const body = wantContent
    ? roller.rollContent(doc, { roll: params.roll, tuning: tuningFromParam(params.tune) })
    : doc;
  const res = json(body, 200, {
    'cache-control': 'public, max-age=31536000, immutable',
    'x-dungeon-version': String(wantV) + (wantContent ? ' content ' + wantCV : ''),
    // the geometry's own fingerprint: hash of the layout-bearing subset of
    // the canonical document, so a saved artefact can detect drift without
    // re-deriving anything (it is what CI pins golden signatures against)
    'x-layout-signature': '0x' + layoutSignature(doc).toString(16),
    'x-generation-ms': String(Date.now() - t0),
    'x-cache': 'miss',
  });
  await cache?.put(key, res.clone());
  return res;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'foam' }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(url);
      } catch (e) {
        return json({ error: 'generation failed', detail: String(e?.message ?? e) }, 500);
      }
    }

    const res = await env.ASSETS.fetch(request);

    // The kernel + dungeon modules are importable by other services
    // (dungeon/FORMAT.md documents the contract) — serve them with CORS.
    if (/\.(mjs|js|json)$/.test(url.pathname)) {
      const open = new Response(res.body, res);
      open.headers.set('access-control-allow-origin', '*');
      return open;
    }
    return res;
  },
};
