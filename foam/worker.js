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
import { dungeonToJSON } from './dungeon-export.mjs';
import { rollContent, CONTENT_VERSION, tuningFromParam } from './dungeon-content.mjs';

const CORS = { 'access-control-allow-origin': '*' };

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
    roll: Math.max(1, parseInt(sp.get('roll') ?? '1', 10) || 1),
    tune: sp.get('tune') ?? '',
  };
  // reject typos loudly rather than silently defaulting the two enums
  if (sp.get('shape') && !TILE_SHAPES.includes(sp.get('shape'))) {
    return { error: 'unknown shape "' + sp.get('shape') + '" — one of: ' + TILE_SHAPES.join(', ') };
  }
  if (sp.get('size') && !SIZES[sp.get('size')]) {
    return { error: 'unknown size "' + sp.get('size') + '" — one of: ' + Object.keys(SIZES).join(', ') };
  }
  const canon = 'seed=' + p.seed + '&n=' + p.n + '&shape=' + p.shape + '&scale=' + p.scale +
    '&size=' + p.size + (p.twin ? '&twin=1' : '');
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
      },
      versions: { dungeon: DUNGEON_VERSION },
    },
    '/api/content': {
      returns: 'foam-dungeon-content JSON (the roll) for the same map params',
      params: {
        roll: 'int ≥1 (default 1) — reroll without touching the map',
        tune: 'lo,tr,ob,en,tf,gr — the forge tuning block (optional)',
        '…': 'plus every /api/dungeon param, to name the map',
      },
      versions: { dungeon: DUNGEON_VERSION, content: CONTENT_VERSION },
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

  // edge cache, keyed on normalized params + the versions that pin meaning
  const key = new Request(url.origin + path + '?' + canon +
    (wantContent ? '&roll=' + params.roll + (params.tune ? '&tune=' + params.tune : '') : '') +
    '&v=' + DUNGEON_VERSION + (wantContent ? '.' + CONTENT_VERSION : ''));
  const cache = globalThis.caches?.default;
  const hit = await cache?.match(key);
  if (hit) {
    const out = new Response(hit.body, hit);
    out.headers.set('x-cache', 'hit');
    return out;
  }

  const t0 = Date.now();
  const dungeon = generateDungeon({
    seed: params.seed, endpoints: params.n, tileShape: params.shape,
    tileScale: params.scale, size: params.size, twin: params.twin,
  });
  const doc = dungeonToJSON(dungeon);
  const body = wantContent
    ? rollContent(doc, { roll: params.roll, tuning: tuningFromParam(params.tune) })
    : doc;
  const res = json(body, 200, {
    'cache-control': 'public, max-age=31536000, immutable',
    'x-dungeon-version': String(DUNGEON_VERSION) + (wantContent ? ' content ' + CONTENT_VERSION : ''),
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
