// civ — the civilization-evolution API (civ.mino.mobi)
//
// A headless coevolutionary agent-based civilization simulation on a mappa world,
// exposed as a CORS-open, edge-cached, no-key API (same posture as /api/world). The
// engine lives in mappa/civ/ and is imported unchanged — the worker just parses
// params, caps CPU (ticks/n bounded here; the browser/CLI runs bigger), runs the sim,
// and returns the chronicle + civ-signals score. Content-addressed by its params, so a
// response edge-caches forever after first render.

import { createSim } from '../mappa/civ/engine.js';
import { civSignals } from '../mappa/civ/signals.js';
import { sweep } from '../mappa/civ/qd.js';
import { loadWorldSpec, chronicleHash } from '../mappa/civ/chronicle.js';
import { decodeCivConfig, normalizeConfig, encodeCivConfig } from '../mappa/civ/config.js';

// CPU-cap: the API server is bounded; the browser/CLI build runs larger.
const CAP = { runTicks: 1500, runN: 1200, sweepBudget: 40, sweepTicks: 700, frameTicks: 1500, maxFrames: 60 };

// inlined presets (mirror mappa/civ/configs/*.json) so the endpoint can take ?preset=.
const PRESETS = {
  neolithic:    { agent: { b0: 0.42, dispersalGain: 1.7, subWeight: 1.5 }, culture: { subsistence: 0, seedTech: ['fire'], normWeights: [0.6, 0.45, 0.55, 0.5, 0.35, 0.4, 0.55, 0.6], innovationBase: 0.006 }, seeding: { nucleusCount: 2, founders: 120 }, climate: { preset: 'stable' }, popScale: 650 },
  kurgan:       { agent: { b0: 0.4, dispersalGain: 2.4, corridorWeight: 1.2, densityWeight: 1.0 }, culture: { subsistence: 0, seedTech: ['fire', 'herding'], normWeights: [0.5, 0.35, 0.5, 0.85, 0.72, 0.5, 0.5, 0.4], innovationBase: 0.005 }, seeding: { nucleusCount: 1, founders: 70 }, climate: { preset: 'kurgan' }, popScale: 620 },
  bantu:        { agent: { b0: 0.46, dispersalGain: 2.2, subWeight: 1.7, corridorWeight: 1.0 }, culture: { subsistence: 0, seedTech: ['fire', 'horticulture'], normWeights: [0.65, 0.55, 0.6, 0.7, 0.3, 0.45, 0.5, 0.7], innovationBase: 0.006 }, seeding: { nucleusCount: 1, founders: 70 }, climate: { preset: 'stable' }, popScale: 700 },
  austronesian: { agent: { b0: 0.44, dispersalGain: 2.0, corridorWeight: 1.4 }, culture: { subsistence: 0, seedTech: ['fire', 'sail'], normWeights: [0.6, 0.5, 0.55, 0.9, 0.35, 0.45, 0.55, 0.6], innovationBase: 0.006 }, seeding: { nucleusCount: 1, founders: 60 }, climate: { preset: 'stable' }, popScale: 650 },
  americas:     { agent: { b0: 0.45, dispersalGain: 2.6, corridorWeight: 1.1, densityWeight: 1.4 }, culture: { subsistence: 0, seedTech: ['fire'], normWeights: [0.6, 0.45, 0.55, 0.85, 0.35, 0.35, 0.5, 0.55], innovationBase: 0.0045 }, seeding: { nucleusCount: 1, founders: 60 }, climate: { preset: 'beringia' }, popScale: 600 },
};

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
function json(obj, status = 200, cache = false) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache ? 'public, max-age=31536000, immutable' : 'no-store', ...CORS },
  });
}

function resolveConfig(params) {
  const preset = params.get('preset');
  if (preset && PRESETS[preset]) return normalizeConfig(PRESETS[preset]);
  const token = params.get('config');
  if (token) { const dec = decodeCivConfig(token); if (dec) return dec; }
  return normalizeConfig(null);
}
function resolveWorld(params) {
  const world = params.get('world') ?? '1';
  const n = clamp(Math.round(num(params.get('n'), 900)), 500, CAP.runN);
  return loadWorldSpec(world, { n });
}

function doRun(params) {
  const world = resolveWorld(params);
  const cfg = resolveConfig(params);
  const civSeed = (Math.round(num(params.get('civSeed') ?? params.get('civseed'), 1)) >>> 0) || 1;
  const ticks = clamp(Math.round(num(params.get('ticks'), 800)), 1, CAP.runTicks);
  const t0 = Date.now();
  const ch = createSim(world, cfg, civSeed).run(ticks);
  const sig = civSignals(ch);
  const wantChronicle = params.get('chronicle') !== '0';
  return {
    api: 'mappa.civ/v1',
    world: params.get('world') ?? '1', config: encodeCivConfig(cfg), civSeed, ticks,
    hash: chronicleHash(ch), score: sig.score, descriptor: sig.descriptor, flags: sig.flags,
    highlights: sig.highlights, signals: sig.signals, facts: sig.facts, meta: ch.meta,
    ms: Date.now() - t0,
    chronicle: wantChronicle ? ch : undefined,
  };
}

// particle-playback data: world mesh + per-frame per-cell snapshots + events.
function doFrames(params) {
  const world = resolveWorld(params);
  const cfg = resolveConfig(params);
  const civSeed = (Math.round(num(params.get('civSeed') ?? params.get('civseed'), 1)) >>> 0) || 1;
  const ticks = clamp(Math.round(num(params.get('ticks'), 1000)), 1, CAP.frameTicks);
  const maxFrames = clamp(Math.round(num(params.get('maxFrames'), 48)), 8, CAP.maxFrames);
  const every = Math.max(1, Math.ceil(ticks / maxFrames));
  const t0 = Date.now();
  const ch = createSim(world, cfg, civSeed).run(ticks, { frames: true, every });
  const sig = civSignals(ch);
  return {
    api: 'mappa.civ/v1', world: params.get('world') ?? '1', config: encodeCivConfig(cfg), civSeed, ticks,
    tickYears: ch.meta.tickYears, score: sig.score, descriptor: sig.descriptor, flags: sig.flags,
    world_mesh: ch.world, dict: ch.dict, frames: ch.frames, events: ch.events, meta: ch.meta, ms: Date.now() - t0,
  };
}

function doSweep(params, body) {
  const src = body || {};
  const worldArg = src.world ?? params.get('world') ?? '1';
  const n = clamp(Math.round(num(src.n ?? params.get('n'), 800)), 500, CAP.runN);
  const world = loadWorldSpec(worldArg, { n });
  const method = String(src.method || params.get('method') || 'qd');
  const budget = clamp(Math.round(num(src.budget ?? params.get('budget'), 20)), 1, CAP.sweepBudget);
  const ticks = clamp(Math.round(num(src.ticks ?? params.get('ticks'), 500)), 1, CAP.sweepTicks);
  const civSeed = (Math.round(num(src.civSeed ?? params.get('civSeed'), 1)) >>> 0) || 1;
  const res = sweep(world, { method, budget, ticks, civSeed });
  return { api: 'mappa.civ/v1', world: String(worldArg), ...res };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    try {
      if (p === '/api/civ/health') return json({ ok: true, site: 'civ', caps: CAP, presets: Object.keys(PRESETS) });
      if (p === '/api/civ/run') return json(doRun(url.searchParams), 200, true);
      if (p === '/api/civ/frames') return json(doFrames(url.searchParams), 200, true);
      if (p === '/api/civ/sweep') {
        let body = null;
        if (request.method === 'POST') { try { body = await request.json(); } catch { /* fall back to query params */ } }
        return json(doSweep(url.searchParams, body), 200, true);
      }
    } catch (e) {
      return json({ error: 'sim failed', detail: String(e && e.message || e) }, 400);
    }
    // everything else → static assets (landing page)
    return env.ASSETS.fetch(request);
  },
};
