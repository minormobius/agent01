// civ — shared request logic for the run / frames / sweep endpoints.
//
// This is the single source of truth for "params → chronicle payload", imported BOTH by the
// Cloudflare Worker (civ/worker.js, the API) AND by the browser bundle (civ/lib/civ-engine.js,
// client-side compute). The engine is deterministic pure JS, so a run computed in the browser is
// bit-identical to one computed on the edge — same chronicleHash — which is what lets the client
// run the sim locally (no Worker CPU limit, no 503) while every permalink/hash stays valid.

import { createSim } from './engine.js';
import { buildTimeline } from './timeline.js';
import { civSignals } from './signals.js';
import { sweep } from './qd.js';
import { loadWorldSpec, chronicleHash } from './chronicle.js';
import { decodeCivConfig, normalizeConfig, encodeCivConfig } from './config.js';

// Bounds. The Worker passes these (edge CPU is finite); the browser can pass a larger cap since
// it runs on the user's machine with no edge limit.
// maxFrames 300: a 1500-tick run captures every 5 ticks (~3.5 MB JSON, and the client
// computes frames locally by default, so dense capture doesn't lean on the edge).
export const CAP = { runTicks: 1500, runN: 1200, sweepBudget: 40, sweepTicks: 700, frameTicks: 1500, maxFrames: 300 };

// inlined presets (mirror mappa/civ/configs/*.json) so ?preset= resolves without a file read.
export const PRESETS = {
  neolithic:    { agent: { b0: 0.42, dispersalGain: 1.7, subWeight: 1.5 }, culture: { subsistence: 0, seedTech: ['fire'], normWeights: [0.6, 0.45, 0.55, 0.5, 0.35, 0.4, 0.55, 0.6], innovationBase: 0.006 }, seeding: { nucleusCount: 2, founders: 120 }, climate: { preset: 'stable' }, popScale: 650 },
  kurgan:       { agent: { b0: 0.4, dispersalGain: 2.4, corridorWeight: 1.2, densityWeight: 1.0 }, culture: { subsistence: 0, seedTech: ['fire', 'herding'], normWeights: [0.5, 0.35, 0.5, 0.85, 0.72, 0.5, 0.5, 0.4], innovationBase: 0.005 }, seeding: { nucleusCount: 1, founders: 70 }, climate: { preset: 'kurgan' }, popScale: 620 },
  bantu:        { agent: { b0: 0.46, dispersalGain: 2.2, subWeight: 1.7, corridorWeight: 1.0 }, culture: { subsistence: 0, seedTech: ['fire', 'horticulture'], normWeights: [0.65, 0.55, 0.6, 0.7, 0.3, 0.45, 0.5, 0.7], innovationBase: 0.006 }, seeding: { nucleusCount: 1, founders: 70 }, climate: { preset: 'stable' }, popScale: 700 },
  austronesian: { agent: { b0: 0.44, dispersalGain: 2.0, corridorWeight: 1.4 }, culture: { subsistence: 0, seedTech: ['fire', 'sail'], normWeights: [0.6, 0.5, 0.55, 0.9, 0.35, 0.45, 0.55, 0.6], innovationBase: 0.006 }, seeding: { nucleusCount: 1, founders: 60 }, climate: { preset: 'stable' }, popScale: 650 },
  americas:     { agent: { b0: 0.45, dispersalGain: 2.6, corridorWeight: 1.1, densityWeight: 1.4 }, culture: { subsistence: 0, seedTech: ['fire'], normWeights: [0.6, 0.45, 0.55, 0.85, 0.35, 0.35, 0.5, 0.55], innovationBase: 0.0045 }, seeding: { nucleusCount: 1, founders: 60 }, climate: { preset: 'beringia' }, popScale: 600 },
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

function resolveConfig(params) {
  const preset = params.get('preset');
  if (preset && PRESETS[preset]) return normalizeConfig(PRESETS[preset]);
  const token = params.get('config');
  if (token) { const dec = decodeCivConfig(token); if (dec) return dec; }
  return normalizeConfig(null);
}
function resolveWorld(params, cap) {
  const world = params.get('world') ?? '1';
  const n = clamp(Math.round(num(params.get('n'), 900)), 500, cap.runN);
  return loadWorldSpec(world, { n });
}

export function doRun(params, cap = CAP) {
  const world = resolveWorld(params, cap);
  const cfg = resolveConfig(params);
  const civSeed = (Math.round(num(params.get('civSeed') ?? params.get('civseed'), 1)) >>> 0) || 1;
  const ticks = clamp(Math.round(num(params.get('ticks'), 800)), 1, cap.runTicks);
  const t0 = now();
  const ch = createSim(world, cfg, civSeed).run(ticks);
  const sig = civSignals(ch);
  const wantChronicle = params.get('chronicle') !== '0';
  return {
    api: 'mappa.civ/v1',
    world: params.get('world') ?? '1', config: encodeCivConfig(cfg), civSeed, ticks,
    hash: chronicleHash(ch), score: sig.score, descriptor: sig.descriptor, flags: sig.flags,
    highlights: sig.highlights, signals: sig.signals, facts: sig.facts, meta: ch.meta,
    ms: Math.round(now() - t0),
    chronicle: wantChronicle ? ch : undefined,
  };
}

// FOUNDINGS (Phase III of civ/STRATEGY.md): the compact civ → polis handoff. Same run as
// /api/civ/run (same cache key space, same hash), but returns only the city-founding
// contract: every culture that reached statehood, with seat lon/lat (degrees), founding
// tick/year, a toponym in the founder's tongue, and the suite-wide `siteSeed` string
// (org's convention: `${worldSeed}:${cityName}:${cellIndex}` — rite hashes strings, so
// this one string reproducibly seeds a polis city AND an org sited at it).
export function doSites(params, cap = CAP) {
  const world = resolveWorld(params, cap);
  const cfg = resolveConfig(params);
  const civSeed = (Math.round(num(params.get('civSeed') ?? params.get('civseed'), 1)) >>> 0) || 1;
  const ticks = clamp(Math.round(num(params.get('ticks'), 800)), 1, cap.runTicks);
  const t0 = now();
  const ch = createSim(world, cfg, civSeed).run(ticks);
  const worldStr = params.get('world') ?? '1';
  const foundings = (ch.final.foundings || []).map(f => ({ ...f, siteSeed: `${worldStr}:${f.city}:${f.cell}` }));
  // every emergent settlement (population crossed the urban threshold), same siteSeed
  // convention — polis can grow ANY city, not just state seats. Rivers/coasts/resources
  // are the mappa geography that sited each one.
  const cities = (ch.final.cities || []).slice(0, 60).map(c => ({ ...c, siteSeed: `${worldStr}:${c.name}:${c.cell}` }));
  return {
    api: 'mappa.civ/v1', world: worldStr, config: encodeCivConfig(cfg), civSeed, ticks,
    // n = the REQUESTED mesh resolution this run saw (generateWorld's N option; actual
    // cell count comes out slightly higher). Mappa terrain is NOT resolution-stable
    // (same seed, different N → different coastlines), so a consumer siting anything at
    // a founding's lon/lat MUST call generateWorld(seed, { N: n }) with this same value —
    // that reproduces the identical mesh, cell ids and all.
    n: clamp(Math.round(num(params.get('n'), 900)), 500, cap.runN),
    hash: chronicleHash(ch), tickYears: ch.meta.tickYears, foundings, cities,
    landmasses: ch.final.landmasses, ms: Math.round(now() - t0),
  };
}

// THE TIMELINE: one chronicle, two historiographies. ?mode=greatman | forces | both
// (default both). 'greatman' tells the run through named actors (prophets, leaders,
// warlords, the eminent — with their org-person temperaments); 'forces' tells the same
// run as structural sweep (phase transitions, climate pulses, credit cycles, meme
// selection) and exposes what evolution actually selected: belief doctrine vectors and
// the evolved institution rulesets. Same run, same cache keys, same hash as /run.
export function doTimeline(params, cap = CAP) {
  const world = resolveWorld(params, cap);
  const cfg = resolveConfig(params);
  const civSeed = (Math.round(num(params.get('civSeed') ?? params.get('civseed'), 1)) >>> 0) || 1;
  const ticks = clamp(Math.round(num(params.get('ticks'), 800)), 1, cap.runTicks);
  const modeReq = String(params.get('mode') || 'both');
  const t0 = now();
  const ch = createSim(world, cfg, civSeed).run(ticks);
  const timeline = {};
  if (modeReq === 'greatman' || modeReq === 'both' || modeReq === 'all') timeline.greatman = buildTimeline(ch, 'greatman');
  if (modeReq === 'forces' || modeReq === 'both' || modeReq === 'all') timeline.forces = buildTimeline(ch, 'forces');
  if (modeReq === 'tech' || modeReq === 'all') timeline.tech = buildTimeline(ch, 'tech');
  if (!Object.keys(timeline).length) timeline.forces = buildTimeline(ch, 'forces'); // unknown mode → forces
  // ?landmass=<id>: continent filter — keep that continent's entries plus the
  // world-scale ones (lm == null: collapses, credit cycles, closings…)
  const lmSel = params.get('landmass');
  if (lmSel != null && lmSel !== '') {
    const L = Math.round(num(lmSel, -1));
    for (const k of Object.keys(timeline)) {
      const tl = timeline[k];
      tl.entries = tl.entries.filter(e => e.lm == null || e.lm === L);
      tl.count = tl.entries.length;
    }
  }
  return {
    api: 'mappa.civ/v1', world: params.get('world') ?? '1', config: encodeCivConfig(cfg), civSeed, ticks,
    hash: chronicleHash(ch), tickYears: ch.meta.tickYears, mode: modeReq,
    landmasses: ch.final.landmasses, timeline, ms: Math.round(now() - t0),
  };
}

// particle-playback data: world mesh + per-frame per-cell snapshots + events.
export function doFrames(params, cap = CAP) {
  const world = resolveWorld(params, cap);
  const cfg = resolveConfig(params);
  const civSeed = (Math.round(num(params.get('civSeed') ?? params.get('civseed'), 1)) >>> 0) || 1;
  const ticks = clamp(Math.round(num(params.get('ticks'), 1000)), 1, cap.frameTicks);
  const maxFrames = clamp(Math.round(num(params.get('maxFrames'), 48)), 8, cap.maxFrames);
  const every = Math.max(1, Math.ceil(ticks / maxFrames));
  const t0 = now();
  const ch = createSim(world, cfg, civSeed).run(ticks, { frames: true, every });
  const sig = civSignals(ch);
  return {
    api: 'mappa.civ/v1', world: params.get('world') ?? '1', config: encodeCivConfig(cfg), civSeed, ticks,
    tickYears: ch.meta.tickYears, score: sig.score, descriptor: sig.descriptor, flags: sig.flags,
    world_mesh: ch.world, dict: ch.dict, frames: ch.frames, events: ch.events, meta: ch.meta, ms: Math.round(now() - t0),
  };
}

export function doSweep(params, body, cap = CAP) {
  const src = body || {};
  const worldArg = src.world ?? params.get('world') ?? '1';
  const n = clamp(Math.round(num(src.n ?? params.get('n'), 800)), 500, cap.runN);
  const world = loadWorldSpec(worldArg, { n });
  const method = String(src.method || params.get('method') || 'qd');
  const budget = clamp(Math.round(num(src.budget ?? params.get('budget'), 20)), 1, cap.sweepBudget);
  const ticks = clamp(Math.round(num(src.ticks ?? params.get('ticks'), 500)), 1, cap.sweepTicks);
  const civSeed = (Math.round(num(src.civSeed ?? params.get('civSeed'), 1)) >>> 0) || 1;
  const res = sweep(world, { method, budget, ticks, civSeed });
  return { api: 'mappa.civ/v1', world: String(worldArg), ...res };
}
