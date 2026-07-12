// mappa/civ/config.js — the civConfig genome (the outer GA's search space).
//
// A run is FULLY reconstructible from { worldConfig, civConfig, civSeed, ticks } —
// a few hundred bytes. civConfig has three orthogonal blocks (agent / culture /
// seeding) plus a climate hook. Continuous knobs travel as fixed-point ×1000 so a
// config serialises cleanly to a ?w=-style base64url token AND to a DAG-CBOR PDS
// record (com.minomobi.mappa.civ). Mirror of mappa/lib/world-share.js, one level up.

import { toFx, fromFx } from './prng.js';
import { NPKG, PKG_ID } from './caps.js';

// normWeights channels (per culture): the levers of behaviour.
export const NORMS = ['kinship', 'coopRadius', 'fertility', 'mobility', 'xenophobia', 'hierarchy', 'innovation', 'receptivity'];
export const NORM_I = Object.fromEntries(NORMS.map((n, i) => [n, i]));

// ---- default civConfig ---------------------------------------------------------
// Every field is a tunable starting definition. The QD loop mutates these.
export function defaultConfig() {
  return {
    agent: {
      b0: 0.42,                 // base birth rate (per fertile adult per tick, at empty density)
      d0: 0.028,                // base death rate
      dispersalGain: 1.7,       // how hard crowding pushes dispersal
      corridorWeight: 0.9,      // river/coast/pass attraction in the dispersal softmax
      densityWeight: 1.3,       // crowding repulsion in the dispersal softmax
      habWeight: 1.0,           // habitability attraction
      subWeight: 1.4,           // subsistence-viability attraction (drives the ratchet)
      driveWeights: [0.5, 0.3, 0.2], // wealth / health / status weights for the utility policy
      tickYears: 2.5,           // real years per tick (10k-year arc ≈ 4000 ticks)
    },
    culture: {
      subsistence: PKG_ID.forager, // founder package
      seedTech: ['fire'],          // founder capability names
      normWeights: [0.6, 0.4, 0.55, 0.5, 0.4, 0.35, 0.5, 0.55], // parallel to NORMS
      mutationRate: 0.06,          // norm drift + innovation base rate
      splitThreshold: 900,         // members before a culture is prone to fork
      innovationBase: 0.005,       // base per-culture innovation probability scaler
    },
    seeding: {
      founders: 60,             // founder population
      nucleusCount: 1,          // number of nucleation cells (independent homelands)
      // nucleus cells: null → auto-pick most-habitable land; or explicit [cellId,...]
      nucleus: null,
    },
    climate: { preset: 'stable' }, // 'stable' | 'kurgan' | 'beringia' | '4.2ka' | {schedule:[...]}
    popScale: 650,              // K scaling (people per mean cell) → homeland pops 10²–10⁴
    keyframeEvery: 64,          // chronicle keyframe interval (ticks)
  };
}

// merge a (possibly partial) config over the defaults — deep on the three blocks.
export function normalizeConfig(cfg) {
  const d = defaultConfig();
  if (!cfg) return d;
  return {
    agent: { ...d.agent, ...(cfg.agent || {}) },
    culture: { ...d.culture, ...(cfg.culture || {}) },
    seeding: { ...d.seeding, ...(cfg.seeding || {}) },
    climate: cfg.climate || d.climate,
    popScale: cfg.popScale ?? d.popScale,
    keyframeEvery: cfg.keyframeEvery ?? d.keyframeEvery,
  };
}

// ---- base64url token (the ?w= analogue) ----------------------------------------
const b64uEnc = s => {
  const b = (typeof btoa !== 'undefined') ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64');
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64uDec = t => {
  const b = t.replace(/-/g, '+').replace(/_/g, '/');
  return (typeof atob !== 'undefined') ? decodeURIComponent(escape(atob(b))) : Buffer.from(b, 'base64').toString('utf8');
};

// Encode a civConfig to an opaque token. Floats → fixed-point ×1000; arrays kept.
// Only fields that differ from defaults would ideally travel, but for legibility we
// encode the full normalized config compactly (it's still a few hundred bytes).
export function encodeCivConfig(cfg) {
  const c = normalizeConfig(cfg);
  const o = {
    a: {
      b0: toFx(c.agent.b0), d0: toFx(c.agent.d0), dg: toFx(c.agent.dispersalGain),
      cw: toFx(c.agent.corridorWeight), dw: toFx(c.agent.densityWeight),
      hw: toFx(c.agent.habWeight), sw: toFx(c.agent.subWeight),
      drv: c.agent.driveWeights.map(toFx), ty: toFx(c.agent.tickYears),
    },
    c: {
      sub: c.culture.subsistence, st: c.culture.seedTech,
      nw: c.culture.normWeights.map(toFx), mr: toFx(c.culture.mutationRate),
      sp: c.culture.splitThreshold, ib: toFx(c.culture.innovationBase),
    },
    s: { f: c.seeding.founders, nc: c.seeding.nucleusCount, nu: c.seeding.nucleus },
    cl: c.climate, ps: c.popScale, kf: c.keyframeEvery,
  };
  return b64uEnc(JSON.stringify(o));
}
export function decodeCivConfig(token) {
  let o; try { o = JSON.parse(b64uDec(token)); } catch { return null; }
  if (!o || !o.a) return null;
  return normalizeConfig({
    agent: {
      b0: fromFx(o.a.b0), d0: fromFx(o.a.d0), dispersalGain: fromFx(o.a.dg),
      corridorWeight: fromFx(o.a.cw), densityWeight: fromFx(o.a.dw),
      habWeight: fromFx(o.a.hw), subWeight: fromFx(o.a.sw),
      driveWeights: (o.a.drv || []).map(fromFx), tickYears: fromFx(o.a.ty),
    },
    culture: {
      subsistence: o.c.sub, seedTech: o.c.st,
      normWeights: (o.c.nw || []).map(fromFx), mutationRate: fromFx(o.c.mr),
      splitThreshold: o.c.sp, innovationBase: fromFx(o.c.ib),
    },
    seeding: { founders: o.s.f, nucleusCount: o.s.nc, nucleus: o.s.nu },
    climate: o.cl, popScale: o.ps, keyframeEvery: o.kf,
  });
}

// ---- PDS record (com.minomobi.mappa.civ) — floats as fixed-point ints -----------
export const COLLECTION = 'com.minomobi.mappa.civ';
export function configToRecord(run, meta = {}) {
  const rec = {
    $type: COLLECTION,
    world: run.world,               // seed | token string identifying the mappa world
    config: encodeCivConfig(run.config),
    civSeed: run.civSeed >>> 0,
    ticks: run.ticks | 0,
    createdAt: new Date().toISOString(),
  };
  if (meta.title) rec.title = String(meta.title).slice(0, 120);
  if (meta.descriptor) rec.descriptor = String(meta.descriptor).slice(0, 240);
  if (typeof meta.score === 'number') rec.score = Math.max(0, Math.min(100, Math.round(meta.score)));
  if (meta.flags && meta.flags.length) rec.flags = meta.flags.slice(0, 12).map(String);
  return rec;
}
export function recordToRun(rec) {
  if (!rec || rec.config == null) return null;
  return { world: rec.world, config: decodeCivConfig(rec.config), civSeed: (rec.civSeed >>> 0) || 1, ticks: rec.ticks | 0 };
}
