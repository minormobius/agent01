// tjs/brut/roller.js — THE ROLLER, COUPLED TO THE SOLVER. Pure, DOM-free.
//
// Until now the roll and the solve did not speak. `rollSeed()` picked a word,
// the generator made a building out of it, and then the engineer looked at it
// and said no — and about half the time it said no, which meant half of every
// session was spent rolling past buildings nobody could build.
//
// The fix is not to make the generator timid. It is to notice that the solver
// already emits a GRADIENT and nobody was reading it. `verify()` does not
// return a boolean; it returns every check with a utilisation and it names the
// GOVERNING one — the single constraint that binds. That is a direction. An
// engineer handed "core wall shear at 1.89" does not roll the dice again, they
// change the lateral system; handed "floor span at 1.4" they shorten the bay.
// So the roller does the same thing, and the ladder of repairs below is that
// knowledge written down.
//
// Three things this must not become:
//
//   · IT MUST NOT BREAK THE PERMALINK. A rolled building is still exactly its
//     parameters, so it still encodes to a link. The repairs move parameters,
//     which the codec already carries — `?s=x&n=12&lat=outrigger` is a link
//     that has always been legal.
//
//   · IT MUST NOT LIE. A roll that could not find a workable building returns
//     the closest thing it found, marked as failing, with the governing check
//     still attached. A roller that quietly returns something broken is worse
//     than one that fails, because the whole point is trust in the verdict.
//
//   · IT MUST NOT PRETEND WORKABILITY IS A PROPERTY OF THE BUILDING. It is not.
//     The same concrete stands in Kent and falls in Kobe, which is why the
//     hazard has always been kept out of the seed's permalink — so a roll is
//     workable AGAINST A STATED HAZARD, the roll records which, and changing
//     the earthquake afterwards can absolutely turn it red again. That is
//     correct behaviour and the UI says so rather than hiding it.

import {
  generate, resolveParams, paramsToQuery, deriveParams, rollSeed,
  TYPOLOGY_IDS, FLOOR_IDS, LATERAL_IDS,
} from './arch.js';
import { verify } from './struct.js';

export const VERSION = 'roller/1';

/* ═══════════════════════════════ the ladder ════════════════════════════════
   Keyed by the id of the check that GOVERNS. Each entry is an ordered list of
   moves to try, cheapest and least destructive first — because the point is to
   find a workable building near the one the seed asked for, not to flatten
   every roll into the same safe box.

   Every move says what it is doing structurally, because that is the part worth
   knowing: this table is a small piece of engineering judgement, and judgement
   written as a bare lookup rots into superstition. */

export const REPAIRS = {
  wall: {
    what: 'the cores are taking more shear than their walls can carry',
    moves: [
      { p: 'lateral', to: 'outrigger', why: 'tie the core to the perimeter columns so they share the overturning couple instead of the core taking all of it' },
      { p: 'lateral', to: 'framed-tube', why: 'move the lateral system out to the facade entirely, where the lever arm is the whole plan' },
      { p: 'lateral', to: 'diagrid', why: 'triangulate the perimeter so the envelope carries shear axially rather than in bending' },
      { p: 'levels', by: -0.15, why: 'less height is less base shear, and it falls faster than linearly' },
    ],
  },
  col: {
    what: 'the columns are carrying more axial load than their section allows',
    moves: [
      { p: 'bay', by: -0.12, why: 'a shorter bay is more columns over the same plate, so each carries a smaller tributary area' },
      { p: 'floor', to: 'pt-flat', why: 'a post-tensioned plate is the lightest slab that spans this far, and slab weight is most of the axial load' },
      { p: 'floor', to: 'hollow-core', why: 'precast hollow-core, lighter still, where the span allows it' },
      { p: 'levels', by: -0.15, why: 'fewer floors above is less load at the bottom' },
    ],
  },
  span: {
    what: 'the bay is longer than this floor system will economically span',
    moves: [
      { p: 'floor', to: 'one-way', why: 'a one-way slab on beams spans further than a flat plate, at the cost of depth' },
      { p: 'floor', to: 'composite', why: 'composite metal deck on steel, which spans furthest of anything here' },
      { p: 'bay', by: -0.15, why: 'or simply ask the floor to span less' },
    ],
  },
  clear: {
    what: 'the floor system is too deep for the storey height, so nobody can stand up under it',
    moves: [
      { p: 'floor', to: 'pt-flat', why: 'the shallowest slab available — a post-tensioned plate has no downstands at all' },
      { p: 'floor', to: 'flat-slab', why: 'a flat slab, also with nothing hanging below it' },
      { p: 'floorH', by: 0.12, why: 'or give the storey the height the structure needs' },
    ],
  },
  bearing: {
    what: 'the ground under the foundation is being asked for more pressure than it will give',
    moves: [
      { p: 'bx', by: 0.2, why: 'a wider footprint spreads the same load over more ground, which is the whole of what a raft is for' },
      { p: 'levels', by: -0.2, why: 'or put less on it, since bearing pressure is the weight above divided by the area under' },
      { p: 'floor', to: 'hollow-core', why: 'a lighter floor system is less load all the way down' },
    ],
  },
  settle: {
    what: 'the foundation settles more than the frame will tolerate',
    moves: [
      { p: 'bx', by: 0.2, why: 'a wider raft spreads the same load over more ground, and settlement follows the pressure rather than the total' },
      { p: 'levels', by: -0.2, why: 'or put less on it — elastic settlement is very nearly proportional to the load above' },
    ],
  },
  sliding: {
    what: 'the base slides before friction can hold it',
    moves: [
      { p: 'bx', by: 0.2, why: 'more footprint is more friction, because friction is proportional to the weight on the ground' },
      { p: 'levels', by: -0.15, why: 'less base shear to resist' },
    ],
  },
  ot: {
    what: 'the building overturns — it is too slender for its own base',
    moves: [
      { p: 'bz', by: 0.3, why: 'widen the plate in the direction it is tipping — the restoring moment is the weight times half the width' },
      { p: 'bx', by: 0.25, why: 'or widen it the other way, if that is the axis the wind is pushing on' },
      { p: 'levels', by: -0.25, why: 'or stop being so tall: overturning grows with the square of the height and restraint does not' },
    ],
  },
  eqdrift: {
    what: 'the storeys shear past each other further than the code allows in an earthquake',
    moves: [
      { p: 'lateral', to: 'outrigger', why: 'outriggers cut drift more than anything else per tonne of steel' },
      { p: 'lateral', to: 'core-frame', why: 'let the frame take a share of the shear' },
      { p: 'levels', by: -0.15, why: 'drift accumulates up the height' },
    ],
  },
  wdrift: {
    what: 'the top sways further than serviceability allows',
    moves: [
      { p: 'lateral', to: 'outrigger', why: 'outriggers cut top drift more per tonne than anything else, because they work on the lever arm rather than the section' },
      { p: 'lateral', to: 'diagrid', why: 'or stiffen the envelope instead, so the whole plan depth resists the sway rather than the core alone' },
    ],
  },
  comfort: {
    what: 'the building is comfortable to look at and unpleasant to occupy — it accelerates too much in wind',
    moves: [
      { p: 'tmd', to: true, why: 'a tuned mass damper: the cheapest acceleration you will ever buy, because it adds damping rather than stiffness' },
      { p: 'lateral', to: 'outrigger', why: 'or add the stiffness instead of the damping — acceleration falls with the square root of it, which is why damping is usually the better buy' },
      { p: 'levels', by: -0.15, why: 'acceleration grows fast with height' },
    ],
  },
  vortex: {
    what: 'the wind is shedding vortices at the building’s own frequency, which is the resonance that eats towers',
    moves: [
      { p: 'tmd', to: true, why: 'a damper detunes the response; you cannot easily stop the shedding, only stop caring about it' },
      { p: 'massing', to: 'setback', why: 'or break the shedding up — a stepped profile does not shed coherently, which is why tall towers taper' },
      { p: 'massing', to: 'ziggurat', why: 'the same idea, harder' },
    ],
  },
  uplift: {
    what: 'the windward side of the foundation is being pulled off the ground',
    moves: [
      { p: 'bz', by: 0.25, why: 'a wider base is a longer lever for the weight that is holding it down' },
      { p: 'bx', by: 0.2, why: 'or wider the other way, whichever axis the uplift is being taken about' },
      { p: 'levels', by: -0.2, why: 'less overturning moment to resist' },
      { p: 'floor', to: 'flat-slab', why: 'a heavier floor is more counterweight — the one check where weight helps' },
    ],
  },
  // and the one the lift kernel raises rather than the structural one
  plate: {
    what: 'the floorplate will not hold the lift shafts this population needs',
    moves: [
      { p: 'bx', by: 0.25, why: 'a wider plate has room for the bank beside the stair' },
      { p: 'bz', by: 0.2, why: 'or a deeper one, which gives the bank somewhere to face across a lobby instead of standing in a row' },
      { p: 'levels', by: -0.2, why: 'or fewer floors, which is fewer people, which is fewer lifts' },
    ],
  },
};

/* ═══════════════════════════ the parameter moves ═══════════════════════════
   Every edit goes through the CODEC rather than being patched onto the object,
   because some parameters derive others — changing the floor system changes the
   structural depth, which changes the storey height it needs. Patching `floor`
   directly leaves a storey height from the old system, and the check that fires
   next is a lie about a building nobody asked for. */

const KEY = {
  levels: 'n', bay: 'bay', bx: 'bx', bz: 'bz', floorH: 'h', corridorW: 'cw',
  massing: 'm', shape: 'sh', towers: 'tw', floor: 'fl', lateral: 'lat',
};
const BOUNDS = {
  levels: [1, 30], bay: [4.2, 11], bx: [3, 20], bz: [2, 18], floorH: [2.6, 30],
};

function toQuery(p) {
  const out = {};
  for (const kv of paramsToQuery(p).split('&')) {
    const i = kv.indexOf('=');
    out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  }
  return out;
}

// Apply one move. Returns null when the move is a no-op or would leave the
// legal range — which is what stops the ladder from grinding a building down to
// one storey and calling it a success.
export function applyMove(p, move) {
  if (!p || !move) return null;          // a move off a dead end is a dead end
  const q = toQuery(p);
  if (move.p === 'tmd') {
    if (p.tmd === move.to) return null;
    q.tmd = move.to ? '1' : '0';
    return resolveParams(q);
  }
  if (move.to != null) {
    if (p[move.p] === move.to) return null;
    if (move.p === 'floor' && !FLOOR_IDS.includes(move.to)) return null;
    if (move.p === 'lateral' && !LATERAL_IDS.includes(move.to)) return null;
    q[KEY[move.p] || move.p] = move.to;
    return resolveParams(q);
  }
  // a proportional nudge, snapped the way the control that owns it snaps
  const cur = p[move.p];
  if (typeof cur !== 'number') return null;
  const [lo, hi] = BOUNDS[move.p] || [-Infinity, Infinity];
  const step = move.p === 'bay' || move.p === 'floorH' ? 0.1 : 1;
  let next = cur * (1 + move.by);
  next = Math.round(next / step) * step;
  if (next === cur) next = cur + Math.sign(move.by) * step;
  next = Math.max(lo, Math.min(hi, Math.round(next / step) * step));
  if (next === cur) return null;
  q[KEY[move.p]] = String(step < 1 ? Math.round(next * 10) / 10 : next);
  return resolveParams(q);
}

/* ═════════════════════════════ the score ═══════════════════════════════════
   What "closest to workable" means, so the search has something to descend.
   The WORST utilisation over every check, because a building is as workable as
   its worst constraint and averaging hides the one that matters. A failing lift
   group counts as its own overshoot on the same scale, so the two kernels are
   comparable and a building cannot be structurally perfect and unliftable and
   still win. */

export function scoreOf(b, report, margin = 1) {
  let worst = 0, gov = null;
  for (const c of (report.checks || [])) {
    const u = Number.isFinite(c.util) ? c.util : 0;
    if (u > worst) { worst = u; gov = c; }
  }
  const g = b.liftGroup;
  if (g && g.needed && !g.pass) {
    // a shortfall of shafts, expressed as an overshoot so it is on one scale
    const short = (g.plateShort || 0) / Math.max(1, g.carsTotal);
    const u = 1 + Math.max(0.05, short);
    if (u > worst) { worst = u; gov = g.governing || { id: 'plate', name: 'Lift provision', util: u }; }
  }
  return { worst, governing: gov, pass: worst <= margin + 1e-9 };
}

/* ═══════════════════════════════ the roll ══════════════════════════════════ */

// A seeded word-roll, so the SEARCH is reproducible even though the first roll
// is not. `rollSeed()` stays the one unseeded thing on the surface; everything
// after it is deterministic, which means a roll can be quoted, replayed and
// tested.
function seedStream(rollKey) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < rollKey.length; i++) { h ^= rollKey.charCodeAt(i); h = Math.imul(h, 16777619); }
  // `rollSeed` takes a source of randomness rather than a number, which is what
  // lets the one unseeded thing on the surface be handed a seeded stream here
  // without either side knowing about the other
  let a = h >>> 0;
  const rnd = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => rollSeed(rnd);
}

/**
 * Roll until the solver says yes.
 *
 *   rollKey    the roll's own seed — from rollSeed() in the UI, so each click
 *              is fresh, but any given roll can be replayed exactly
 *   hazard     what it is being judged against. Workability is not a property
 *              of a building alone, so this is required and it is recorded.
 *   typology   pin it, or leave it and let the roll choose
 *   budget     how many candidates to try before giving up
 *   repairs    how many repair moves to try per candidate, 0 for pure rejection
 *   extra      further evaluators, each (building) => ({pass, util, governing}).
 *              Planting will arrive through here rather than by editing this
 *              file — the roller should not need to know what a tree is.
 */
export function rollWorkable(o = {}) {
  const {
    rollKey = 'roll', hazard = { seismicScenario: 'high', windScenario: 'cat3' },
    typology = null, budget = 24, repairs = 4, extra = [],
    // What counts as workable. 1.0 is the code's own answer — a utilisation of
    // one is exactly at capacity, which is what every check in here means by
    // "passes". Ask for less and you are asking for headroom, which is a
    // legitimate thing to want and a much slower thing to find.
    margin = 1,
  } = o;
  const nextSeed = seedStream(String(rollKey));
  const t0 = Date.now();

  const evaluate = (p) => {
    const b = generate(p);
    const report = verify(b, hazard);
    let s = scoreOf(b, report, margin);
    for (const fn of extra) {
      const r = fn(b) || {};
      const u = Number.isFinite(r.util) ? r.util : (r.pass === false ? 1.2 : 0);
      if (u > s.worst) s = { worst: u, governing: r.governing || null, pass: u <= margin + 1e-9 };
    }
    return { p, b, report, ...s };
  };

  let best = null, tried = 0, repaired = 0;
  const trail = [];

  for (let i = 0; i < budget; i++) {
    const seed = nextSeed();
    const t = typology || undefined;
    let cand = evaluate(resolveParams({ s: seed, t }));
    tried++;
    if (!best || cand.worst < best.worst) best = cand;
    if (cand.pass) return done(cand, true);

    // THE REPAIR LOOP. The governing check names a direction, so walk it — and
    // take the BEST move on the rung rather than the first that helps at all.
    // Taking the first improvement sounds cheaper and is not: an outrigger that
    // buys 1.6 % gets accepted, the rung is spent, and the framed tube that
    // would have bought 18 % never gets tried. Four solves is fifty milliseconds;
    // a wasted rung is a roll that fails.
    //
    // A move that names a VALUE may be tried once — setting the lateral system
    // to a diagrid twice is a no-op. A move that names a PROPORTION may repeat,
    // because taking another fifteen per cent off the height is a different
    // building each time, and compounding it is exactly how this converges.
    const used = new Map();
    for (let k = 0; k < repairs; k++) {
      const id = cand.governing && cand.governing.id;
      const rec = REPAIRS[id];
      if (!rec) break;

      let stepped = null;
      for (const mv of rec.moves) {
        const key = `${mv.p}:${mv.to != null ? mv.to : 'by'}`;
        const seen = used.get(key) || 0;
        if (seen >= (mv.to != null ? 1 : 3)) continue;
        const np = applyMove(cand.p, mv);
        if (!np) { used.set(key, 99); continue; }
        const next = evaluate(np);
        tried++; repaired++;
        trail.push({ from: id, move: mv, worst: r3(cand.worst), to: r3(next.worst) });
        if (next.worst < cand.worst * 0.98 && (!stepped || next.worst < stepped.next.worst)) {
          stepped = { next, key };
        }
      }
      if (!stepped) break;
      used.set(stepped.key, (used.get(stepped.key) || 0) + 1);
      cand = stepped.next;
      if (!best || cand.worst < best.worst) best = cand;
      if (cand.pass) return done(cand, true);
    }
  }
  return done(best, false);

  function done(cand, pass) {
    return {
      version: VERSION, pass, hazard, margin,
      params: cand.p, building: cand.b, report: cand.report,
      seed: cand.p.seed, query: paramsToQuery(cand.p),
      worst: r3(cand.worst), governing: cand.governing,
      tried, repaired, ms: Date.now() - t0, trail,
      // WHAT WAS MOVED, so the roll can be read rather than trusted. A building
      // that had to be repaired is not the seed's own building any more, and
      // saying which knobs moved is the difference between a search and a
      // black box.
      edits: editsOf(cand.p),
    };
  }
}

const r3 = (v) => Math.round(v * 1000) / 1000;

// The parameters that differ from what the seed itself would have said — which
// is exactly what the permalink already encodes, read back out as prose.
export function editsOf(p) {
  const base = deriveParams(p.seed, p.typology);
  const out = [];
  for (const k of ['levels', 'bay', 'bx', 'bz', 'floorH', 'massing', 'shape', 'floor', 'lateral']) {
    if (p[k] !== base[k]) out.push({ key: k, from: base[k], to: p[k] });
  }
  if (p.tmd !== base.tmd) out.push({ key: 'tmd', from: base.tmd, to: p.tmd });
  return out;
}

/* ════════════════════════════ the honest sweep ═════════════════════════════
   How often does a bare roll actually land a workable building? The answer is
   the reason this file exists, and it is worth being able to measure rather
   than assert — so the selftest and anyone curious can run the same census. */

export function census(o = {}) {
  const { n = 40, hazard = { seismicScenario: 'high', windScenario: 'cat3' }, typology = null, key = 'census' } = o;
  const nextSeed = seedStream(key);
  const out = { n, pass: 0, fail: 0, byGoverning: {} };
  for (let i = 0; i < n; i++) {
    const p = resolveParams({ s: nextSeed(), t: typology || undefined });
    const b = generate(p);
    const s = scoreOf(b, verify(b, hazard));
    if (s.pass) out.pass++;
    else {
      out.fail++;
      const id = (s.governing && s.governing.id) || 'unknown';
      out.byGoverning[id] = (out.byGoverning[id] || 0) + 1;
    }
  }
  out.rate = out.pass / Math.max(1, n);
  return out;
}
