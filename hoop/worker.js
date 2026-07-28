// hoop worker — static assets + the HoopRoom presence Durable Object.
//
// Two tiers of state (see /mmo for the precedent):
//   • HOT / ephemeral  → this DO. Live player positions + who's online, held in
//     memory, broadcast over WebSockets. Nothing persists; disconnect = you fade
//     from the map. This is what makes "I see you on the map, you see me" work.
//   • COLD / durable   → ATProto lexicons (com.minomobi.hoop.place / .message),
//     written to each user's PDS. Presence is deliberately NOT a lexicon: you
//     can't write a permanent firehose record on every footstep.
//
// v096 adds an ADDITIVE, fully-guarded story-generation API (/api/story/*): the
// segregated inference adapter (story/llm) generates personal side-quests on
// demand, gated by review.js/gates.js/validate.js before the BROWSER freezes them
// to the player's own repo. Every path is try/catch-wrapped so a model/PDS hiccup
// can never break asset serving — and with no GEMINI_API_KEY the adapter is the
// disabled stub and the game stays purely procedural (the borges discipline).

import { makeLLM } from './story/llm/index.js';
import { generateSidequest } from './story/sidequest.js';
import { resolveHandle, resolvePds } from '../packages/atproto/pds.js';
import { PULSE_NSID, readSummary } from './story/director.js';
import { worldExternal } from './story/import.js';

let _bible = null;   // module-cached bible text (fetched once from ASSETS)
async function getBible(env, origin) {
  if (_bible != null) return _bible;
  try {
    const r = await env.ASSETS.fetch(new Request(origin + '/story/bible.md'));
    _bible = r.ok ? await r.text() : '';
  } catch { _bible = ''; }
  return _bible;
}

// THE STEER (Director-steers, authoritative): read the world pulse from the service repo and cache it
// ~5 min. Fully guarded — if the Director hasn't run yet (no record) or the service handle is unset,
// this resolves null and generation simply proceeds with no steer. HOOP_SERVICE_HANDLE/_DID override
// the morphyx default (where the seeder + director write).
let _pulse = { at: 0, summary: null };
async function getPulse(env) {
  if (Date.now() - _pulse.at < 5 * 60 * 1000) return _pulse.summary;
  _pulse.at = Date.now();
  try {
    const did = env.HOOP_SERVICE_DID || await resolveHandle(env.HOOP_SERVICE_HANDLE || 'morphyxmino.bsky.social');
    const pds = await resolvePds(did);
    const q = '?repo=' + encodeURIComponent(did) + '&collection=' + PULSE_NSID + '&rkey=self';
    const r = await fetch(pds + '/xrpc/com.atproto.repo.getRecord' + q);
    _pulse.summary = r.ok ? readSummary((await r.json()).value) : null;
  } catch { _pulse.summary = null; }
  return _pulse.summary;
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } });

// The whole /api/story surface — isolated so any throw returns a JSON error, never touching asset serving.
async function handleStory(request, env, url) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const llm = makeLLM(env);

  if (url.pathname === '/api/story/health') {
    return json({ ok: true, service: 'hoop-story', provider: llm.provider, enabled: llm.enabled });
  }
  if (url.pathname === '/api/story/embed' && request.method === 'POST') {
    if (!llm.enabled) return json({ enabled: false, vectors: null }, 503);   // browser falls back to lexicalEmbed
    const body = await request.json().catch(() => ({}));
    const vectors = await llm.embed(body.texts || body.text || []);
    return json({ enabled: true, provider: llm.provider, vectors });
  }
  if (url.pathname === '/api/story/sidequest' && request.method === 'POST') {
    if (!llm.enabled) return json({ ok: false, verdict: 'SKIP', reason: 'inference not configured', items: [], beats: [] }, 503);
    const body = await request.json().catch(() => ({}));
    const bible = await getBible(env, url.origin);
    // The browser sends the chunk profile + the nearby pool/features for the gate; the worker generates +
    // validates and returns the arc. Persistence to the player's OWN repo is the browser's job (AuthClient.pds).
    const result = await generateSidequest(llm, {
      bible, profile: body.profile || {}, existing: body.existing || [], features: body.features || [],
      match: body.match || {}, descriptor: body.descriptor,
      pulse: body.pulse || await getPulse(env),   // the Director's pulse steers the arc (browser may override)
      // world/runtime flags so generated gates aren't false orphans. Passing the nearby pool slice
      // unions in the DERIVED boundary (flags the pool requires but never produces — runtime-set),
      // so arcs chaining onto the 600-record corpus's journey-flag gates aren't falsely blocked.
      external: body.external || worldExternal(body.existing || []),
    });
    return json(result, result.ok ? 200 : 200);   // a clean BLOCK is a 200 with verdict — not an error
  }
  return json({ error: 'unknown story route' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Live presence socket — one global room for the whole world.
    if (url.pathname === '/ws') {
      const id = env.HOOP_ROOM.idFromName('world');
      return env.HOOP_ROOM.get(id).fetch(request);
    }

    if (url.pathname === '/api/presence/health') {
      return new Response(JSON.stringify({ ok: true, service: 'hoop' }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    // v096 story-generation API — additive + fully guarded (never breaks assets).
    if (url.pathname.startsWith('/api/story/')) {
      try { return await handleStory(request, env, url); }
      catch (err) { return json({ ok: false, error: 'story api error', detail: String(err && err.message || err) }, 500); }
    }

    // v099 — kept in mainline as THE ENGINE SNAPSHOT: nave/rind/forge/chunkroller import its
    // chunkgen/manager/econ/rooms/skin modules at runtime. Its own pages stay served too.
    if (url.pathname === '/v099/records' || url.pathname === '/v099/records/') {
      return env.ASSETS.fetch(new Request(new URL('/v099/records.html', url), request));
    }
    if (url.pathname === '/v099/feed' || url.pathname === '/v099/feed/') {
      return env.ASSETS.fetch(new Request(new URL('/v099/feed.html', url), request));
    }
    // v108 — the CURRENT VERSION, mirrored at the domain root (see THE MIRROR below). Everything
    // older (the first-pass room, v2–v8, v090–v107) lives on hoop-archive.mino.mobi; archived
    // paths 301 there.
    if (url.pathname === '/v108/records' || url.pathname === '/v108/records/') {
      return env.ASSETS.fetch(new Request(new URL('/v108/records.html', url), request));
    }
    if (url.pathname === '/v108/feed' || url.pathname === '/v108/feed/') {
      return env.ASSETS.fetch(new Request(new URL('/v108/feed.html', url), request));
    }
    if (url.pathname === '/v108/spine' || url.pathname === '/v108/spine/') {
      return env.ASSETS.fetch(new Request(new URL('/v108/story/spine.html', url), request));
    }
    // quests — the QUEST SPINE board (bare alias tracks the current dev surface — now v108).
    if (url.pathname === '/v108/quests' || url.pathname === '/v108/quests/' || url.pathname === '/quests' || url.pathname === '/quests/') {
      return env.ASSETS.fetch(new Request(new URL('/v108/quests.html', url), request));
    }
    // plan — THE SEVEN: the unified design-language plan (3 factions × 7 planets = 21 identities).
    if (url.pathname === '/v108/plan' || url.pathname === '/v108/plan/' || url.pathname === '/plan' || url.pathname === '/plan/') {
      return env.ASSETS.fetch(new Request(new URL('/v108/plan.html', url), request));
    }
    // garden/plot — the high-detail GARDEN PLOT demo: the soil substrate (grain/moisture/cracks) + the
    // flora grown on it, each plant coloured by its Galenic temperament. The plants-first design toy.
    // (Bare dev aliases track the current development surface — now v106.)
    if (url.pathname === '/garden/plot' || url.pathname === '/garden/plot/') {
      return env.ASSETS.fetch(new Request(new URL('/v108/garden/plot.html', url), request));
    }
    // over — the OVERWORLD: the ship's outer grow-deck, the whole curated ecology grown wild across
    // terrain bands (meadow/grove/thicket/heath/fen/water), each plant a silhouette keeping its
    // growth-form + Galenic palette. The landscape cousin of the garden plot; pan/zoom, seed permalink.
    if (url.pathname === '/over' || url.pathname === '/over/') {
      return env.ASSETS.fetch(new Request(new URL('/v108/over/index.html', url), request));
    }
    // over/demo — the STANDING DEMO: a self-touring attract-mode over the overworld (auto-pan camera
    // drifting across the bands, cycling seeds, naming what it passes). Runs itself, no input; a screen.
    if (url.pathname === '/over/demo' || url.pathname === '/over/demo/') {
      return env.ASSETS.fetch(new Request(new URL('/v108/over/demo.html', url), request));
    }
    // alch — the ALCHEMIST'S COOKBOOK: the correspondence→effect grammar (humour/planet/metal/vessel),
    // every live reagent with its derived effect + pairings, and exemplar recipes computed by actually
    // running the alchemy kernel. Mechanism reference for the bench in the make rooms.
    if (url.pathname === '/alch' || url.pathname === '/alch/' || url.pathname === '/cookbook' || url.pathname === '/cookbook/') {
      return env.ASSETS.fetch(new Request(new URL('/v108/alch/index.html', url), request));
    }
    // smith — the SMITHY testbed: craft equipment from the ship's commodities (the item genome + the
    // material→commodity economy + tech-era gating). The design page before the make-room wall fixture.
    if (url.pathname === '/smith' || url.pathname === '/smith/') {
      return env.ASSETS.fetch(new Request(new URL('/v108/craft/index.html', url), request));
    }
    // docs — the WORLD-SIDE documentation: the whole scope of the world (decks, systems, minigames),
    // every workflow that feeds it, the v101 audit findings, and the roadmap. The examination surface.
    if (url.pathname === '/docs' || url.pathname === '/docs/') {
      return env.ASSETS.fetch(new Request(new URL('/docs/index.html', url), request));
    }
    // chunkroller — the chunk-design tool (a /econ cousin for chunks): total view + civic readout + NPC stats + biome sliders.
    if (url.pathname === '/chunkroller' || url.pathname === '/chunkroller/') {
      return env.ASSETS.fetch(new Request(new URL('/chunkroller/index.html', url), request));
    }
    // chunkroller/tess — the tessellation editor (drag edges into shapes that still tile; export JSON).
    if (url.pathname === '/chunkroller/tess' || url.pathname === '/chunkroller/tess/') {
      return env.ASSETS.fetch(new Request(new URL('/chunkroller/tess.html', url), request));
    }
    // nave — floor 1: a central commons ringed by six faction wards in three two-chunk lobes.
    if (url.pathname === '/nave' || url.pathname === '/nave/') {
      return env.ASSETS.fetch(new Request(new URL('/nave/index.html', url), request));
    }
    // nave/slots — the content-slot manifest report (what the story engine fills; the pool-authoring target).
    if (url.pathname === '/nave/slots' || url.pathname === '/nave/slots/') {
      return env.ASSETS.fetch(new Request(new URL('/nave/slots.html', url), request));
    }
    // v099/spine — the flag-spine spec: load-bearing NPC deck quests + the live deck-stacking demo.
    if (url.pathname === '/v099/spine' || url.pathname === '/v099/spine/') {
      return env.ASSETS.fetch(new Request(new URL('/v099/story/spine.html', url), request));
    }
    // rind — floor 2: the structural underworld (shaft-foot hub + Navigation / Drum / Signal stations).
    if (url.pathname === '/rind' || url.pathname === '/rind/') {
      return env.ASSETS.fetch(new Request(new URL('/rind/index.html', url), request));
    }
    // forge — the production-flow graph: the ship's industrial metabolism (named steps, recycling, bio-regen).
    if (url.pathname === '/forge' || url.pathname === '/forge/') {
      return env.ASSETS.fetch(new Request(new URL('/forge/index.html', url), request));
    }
    // forge/elements — the periodic table → looping-Sankey: every element's closed cycle (biome ⊕ forge).
    if (url.pathname === '/forge/elements' || url.pathname === '/forge/elements/') {
      return env.ASSETS.fetch(new Request(new URL('/forge/elements.html', url), request));
    }
    // forge/facilities — the eight production engines fit into the ship's voronoi foam (1–3 per chunk).
    if (url.pathname === '/forge/facilities' || url.pathname === '/forge/facilities/') {
      return env.ASSETS.fetch(new Request(new URL('/forge/facilities.html', url), request));
    }
    // forge/region — a coherent multi-chunk rind region: physarum-grown conduits + inter-engine supply.
    if (url.pathname === '/forge/region' || url.pathname === '/forge/region/') {
      return env.ASSETS.fetch(new Request(new URL('/forge/region.html', url), request));
    }
    // forge/walk — the playable upper-rind proto: walk an @ around the production floor.
    if (url.pathname === '/forge/walk' || url.pathname === '/forge/walk/') {
      return env.ASSETS.fetch(new Request(new URL('/forge/walk.html', url), request));
    }
    // forge/stack — the two-deck factory: material floor + pedestrian mezzanine, isometric.
    if (url.pathname === '/forge/stack' || url.pathname === '/forge/stack/') {
      return env.ASSETS.fetch(new Request(new URL('/forge/stack.html', url), request));
    }
    // forge/foam3d — the volumetric foamview: two non-touching physarum species in a 3D chamber foam.
    if (url.pathname === '/forge/foam3d' || url.pathname === '/forge/foam3d/') {
      return env.ASSETS.fetch(new Request(new URL('/forge/foam3d.html', url), request));
    }
    // forge/tower — factory formation in 3D: the supply chain stratified into a vertical tower.
    if (url.pathname === '/forge/tower' || url.pathname === '/forge/tower/') {
      return env.ASSETS.fetch(new Request(new URL('/forge/tower.html', url), request));
    }
    // forge/slices — presenting a 3D chunk to the player: plan + section (floor slices + the elevation).
    if (url.pathname === '/forge/slices' || url.pathname === '/forge/slices/') {
      return env.ASSETS.fetch(new Request(new URL('/forge/slices.html', url), request));
    }
    // forge/ship — the INFINITE production layer: fly through the ship's circulation, naves as organs.
    if (url.pathname === '/forge/ship' || url.pathname === '/forge/ship/') {
      return env.ASSETS.fetch(new Request(new URL('/forge/ship.html', url), request));
    }
    // forge/micro — one chunk floor: the office→transit→lower-rind gradient + the capillary structure.
    if (url.pathname === '/forge/micro' || url.pathname === '/forge/micro/') {
      return env.ASSETS.fetch(new Request(new URL('/forge/micro.html', url), request));
    }

    // ── THE MIRROR + THE MUSEUM DOOR ────────────────────────────────────────
    // The current version (v108) IS the main site. Kept surface dirs serve
    // as themselves; any other path is tried as /v108/<path> (so the game and
    // all its relative assets serve at the domain root); a miss there means an
    // archived path — 301 to the museum, which serves every pre-v108 URL
    // (the first-pass room at /, v2–v8, v090–v107) with frozen copies of the
    // shared dirs. To promote a future v109: change LIVE and the /v108 blocks.
    const LIVE = '/v108';
    const KEPT = ['/v099/', '/v108/', '/nave/', '/rind/', '/forge/', '/chunkroller/',
      '/paint/', '/econ/', '/docs/', '/story/', '/vendor/', '/lexicons/', '/test/', '/scripts/'];
    const p = url.pathname;
    if (KEPT.some((k) => p === k.slice(0, -1) || p.startsWith(k))) {
      return env.ASSETS.fetch(request);
    }
    const mirrored = await env.ASSETS.fetch(new Request(new URL(LIVE + (p === '/' ? '/' : p), url), request));
    if (mirrored.status !== 404) return mirrored;
    return Response.redirect('https://hoop-archive.mino.mobi' + url.pathname + url.search, 301);
  },
};

// ── HoopRoom: the per-world WebSocket coordinator ──────────────────────────
// Identity is borrowed from the shared auth worker: the browser carries an
// opaque session token (mino_auth_session) which we pass as ?session=… and
// validate against auth.mino.mobi/api/me. The .mino.mobi SSO cookie is also
// forwarded as a fallback, so a session minted on another mino.mobi site works.
export class HoopRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set(); // { ws, did, handle, x, y }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected WebSocket', { status: 426 });
    }
    const id = await this.validate(request, url);
    if (!id) return new Response('unauthorized', { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.accept(server, id);
    return new Response(null, { status: 101, webSocket: client });
  }

  async validate(request, url) {
    try {
      const token = url.searchParams.get('session');
      const cookie = request.headers.get('Cookie');
      if (!token && !cookie) return null;
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (cookie) headers['Cookie'] = cookie;
      const r = await fetch('https://auth.mino.mobi/api/me', { headers });
      if (!r.ok) return null;
      const u = await r.json();
      if (!u || !u.did) return null;
      return { did: u.did, handle: u.handle || u.did };
    } catch {
      return null;
    }
  }

  accept(ws, id) {
    ws.accept();
    const meta = { ws, did: id.did, handle: id.handle, x: 24, y: 14 };
    this.sockets.add(meta);

    ws.addEventListener('message', (e) => this.onMessage(meta, e));
    const cleanup = () => {
      if (this.sockets.delete(meta)) this.broadcast({ type: 'leave', did: meta.did }, meta);
    };
    ws.addEventListener('close', cleanup);
    ws.addEventListener('error', cleanup);

    // Greet the joiner with everyone currently here.
    this.send(ws, { type: 'welcome', self: { did: meta.did, handle: meta.handle }, peers: this.peers(meta) });
  }

  onMessage(meta, e) {
    let msg;
    try { msg = JSON.parse(typeof e.data === 'string' ? e.data : ''); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'hello' || msg.type === 'move') {
      if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
        meta.x = msg.x | 0;
        meta.y = msg.y | 0;
      }
      // First position announcement is a 'join' for peers; subsequent are 'move'.
      this.broadcast(
        { type: msg.type === 'hello' ? 'join' : 'move', did: meta.did, handle: meta.handle, x: meta.x, y: meta.y },
        meta
      );
    } else if (msg.type === 'emote') {
      // Ephemeral speech bubble over a node — transient, never persisted.
      this.broadcast(
        { type: 'emote', did: meta.did, handle: meta.handle, placeId: String(msg.placeId || ''), text: String(msg.text || '').slice(0, 280) },
        null
      );
    } else if (msg.type === 'ping') {
      this.send(meta.ws, { type: 'pong' });
    }
  }

  peers(exclude) {
    const out = [];
    for (const m of this.sockets) if (m !== exclude) out.push({ did: m.did, handle: m.handle, x: m.x, y: m.y });
    return out;
  }

  broadcast(obj, exclude) {
    const s = JSON.stringify(obj);
    for (const m of this.sockets) {
      if (m === exclude) continue;
      try { m.ws.send(s); } catch { /* drop */ }
    }
  }

  send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch { /* drop */ }
  }
}
