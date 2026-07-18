// chronicle.js — run a whole history on a region mesh, ice age → future, and record
// it for replay. Per tick it advances the climate (sea level + temperature), the tech
// clock (with discrete Kondratiev waves), NUCLEATES towns as land becomes habitable
// and tech unlocks their engine, grows each town's economy (reusing economy.js), and
// grows the inter-town artery field. Everything precomputed once → the viewer just
// indexes by tick (smooth scrubbing both directions).
//
// Pure + deterministic; node + browser.

import { hash2 } from './prng.js';
import { habitable, moistAt, computeRivers } from './mesh.js';
import { makeArteries } from './arteries.js';
import { step as growStep, conquer, flourish, tierOf } from './economy.js';
import { buildClimate } from '../mappa/climate-forcing.js';

const KPP = 2600, IMPORT_PP = 9000;
// the causal claim: cities nucleate as the ice retreats (end of the ice age), not
// during the glacial maximum. Gate ALL founding on regional ice volume dropping past
// this (a cross-world signal — every world deglaciates past it), so a warm-cell town
// can't seed under the ice sheets. Markets keep an additional warmth gate on top.
const ICE_FOUND = 0.65;

// the calendar: deep time fast, recent centuries slow, so the high-tech eras land in
// CE (not anachronistic BCE) — a concave map from -12000 BCE → +2100 CE. Matches the
// climate-forcing window, so forcingAt(year) covers every tick.
function yearAt(f) { return Math.round(-12000 + 14100 * (1 - Math.pow(1 - f, 2.5))); }
// the tech clock is ORTHOGONAL to climate (technology, not weather): late-accelerating.
function techAt(f) { return 1 / (1 + Math.exp(-(f - 0.62) / 0.12)); }

// A CLIMATE CATASTROPHE hits the live urban system: a super-eruption / volcanic winter
// / grand solar minimum. Size-dependent, like conquest — a diversified metropolis
// endures on locational inertia; a small mono-functional town can be cast back to
// nothing (the dark age). Deterministic (the shock is scheduled from the seed).
function applyClimateShock(k, sh, towns, events) {
  const alive = towns.filter((t) => t.alive && t.pop > 0);
  if (!alive.length) return;
  const sev = sh.kind === 'super-eruption' ? Math.min(0.85, 0.30 + sh.mag * 0.055)
            : sh.kind === 'eruption' ? Math.min(0.5, 0.10 + sh.mag * 0.06)
            : Math.min(0.35, 0.08 + sh.mag * 0.16);                        // grand-minimum: milder, broad
  for (const t of alive) {
    const diversify = Math.min(1, t.trade * 0.4 + Math.min(1, t.pop / 4e4)); // trade + scale = resilience
    t.pop *= 1 - sev * (1 - 0.7 * diversify);
    const mono = (t.engine === 'staple' || t.engine === 'fortress' || t.engine === 'market');
    if (sh.kind === 'super-eruption' && mono && t.pop < 900) t.alive = t.pop > 40;  // cast back to nothing
  }
  const focus = alive.slice().sort((a, b) => b.pop - a.pop)[0];
  const note = sh.kind === 'super-eruption' ? 'super-eruption · volcanic winter'
             : sh.kind === 'eruption' ? 'volcanic winter' : 'grand solar minimum';
  events.push({ tick: k, type: sh.kind, cell: focus.cell, note });
}

// A shock delivered from the WORLD BEYOND — the civ run this city lives inside
// (Phase III/VI of civ/STRATEGY.md: polis is a client of global events, not their
// author). 'sack': a host from the wider world falls on the biggest town. 'drought':
// a global-climate forcing peak (civ's climate.pulse) pressing on the whole region.
function applyWorldShock(k, sh, towns, events) {
  const alive = towns.filter((t) => t.alive && t.pop > 0);
  if (!alive.length) return;
  if (sh.kind === 'sack') {
    const big = alive.slice().sort((a, b) => b.pop - a.pop)[0];
    const diversify = Math.min(1, big.trade * 0.4 + Math.min(1, big.pop / 4e4));
    big.pop *= 0.45 + 0.25 * diversify;
    for (const t of alive) if (t !== big) t.pop *= 0.96;      // the hinterland shelters refugees, loses trade
    events.push({ tick: k, type: 'sack', cell: big.cell, note: 'sacked — a host from the world beyond' });
  } else { // 'drought' — broad, milder, resilience helps less (weather ignores walls)
    const sev = Math.min(0.3, 0.10 + (sh.mag || 0.5) * 0.18);
    for (const t of alive) t.pop *= 1 - sev * (1 - 0.4 * Math.min(1, t.trade * 0.4));
    const focus = alive.slice().sort((a, b) => b.pop - a.pop)[0];
    events.push({ tick: k, type: 'drought', cell: focus.cell, note: 'drought — the world’s climate turns' });
  }
}

// mesh-aware hinterland surplus: fertility summed over cells within `hops` of a cell
function surplusAround(mesh, cellId, env, hops = 5) {
  const seen = new Set([cellId]); let frontier = [cellId], sum = 0;
  for (let h = 0; h <= hops; h++) {
    const next = [];
    for (const id of frontier) {
      const c = mesh.cells[id];
      if (c.elev >= env.seaLevel) {
        const above = Math.min(1, (c.elev - env.seaLevel) * 2.2), M = moistAt(c, env);
        let fert = Math.max(0, M * (1 - above));
        // river IRRIGATION: a flowing channel waters dry land (the Nile in the desert).
        // Scales with discharge, matters most where rain is scarce — and VANISHES when the
        // river dies, so an aridification collapses the irrigation civilization's food base.
        const rw = env.riverW ? env.riverW[c.id] : 0;
        if (rw > 0) fert += Math.min(0.7, rw * 0.16) * (1 - M) * (1 - above);
        sum += fert;
      }
      for (const n of c.neigh) if (!seen.has(n)) { seen.add(n); next.push(n); }
    }
    frontier = next;
  }
  return sum;
}

function engineOf(mesh, c) {
  let coast = 0, waterNb = 0; for (const n of c.neigh) { if (mesh.cells[n].elev < mesh.baseSea) { coast = 1; waterNb++; } }
  if (c.river && coast) return 'gateway';
  if (c.res === 'ore') return 'staple';
  if (c.river && c.flow > 30) return 'break-of-bulk';
  // prominence: higher than most neighbours
  let higher = 0; for (const n of c.neigh) if (c.elev > mesh.cells[n].elev) higher++;
  if (higher >= c.neigh.length - 1 && c.elev > mesh.baseSea + 0.12) return 'fortress';
  return 'market';
}

function baseAndTrade(mesh, c, engine, surplus) {
  let coast = 0; for (const n of c.neigh) if (mesh.cells[n].elev < mesh.baseSea) coast = 1;
  const fl = Math.min(5, c.flow / 25);
  let base, trade = 0;
  switch (engine) {
    case 'gateway': base = 7000 + 1400 * fl + 4000 * coast; trade = 1.0 + 0.4 * fl + 0.6 * coast; break;
    case 'break-of-bulk': base = 5000 + 1200 * fl; trade = 0.5 + 0.3 * fl; break;
    case 'staple': base = 6500; break;
    case 'fortress': base = 2600; break;
    default: base = 700 + 130 * surplus;
  }
  return { base, trade };
}

// pick a stratified set of candidate town cells (best of each engine + fill by score)
function candidates(mesh, count) {
  const score = [];
  for (const c of mesh.cells) {
    if (c.elev < mesh.baseSea) continue;
    let coast = 0, waterNb = 0; for (const n of c.neigh) if (mesh.cells[n].elev < mesh.baseSea) { coast = 1; waterNb++; }
    let higher = 0; for (const n of c.neigh) if (c.elev > mesh.cells[n].elev) higher++;
    const above = c.elev - mesh.baseSea;
    const site = 0.45 * c.moist + 0.8 * (higher / Math.max(1, c.neigh.length)) + 0.9 * Math.max(0, c.moist * (1 - above * 2));
    const sit = 1.0 * (c.river ? 1 : 0) + 0.7 * coast + 0.6 * Math.min(1, c.flow / 40) + 0.8 * (waterNb >= 2 ? 1 : 0);
    score.push({ id: c.id, v: site + sit, engine: engineOf(mesh, c), x: c.wx, y: c.wy });
  }
  score.sort((a, b) => b.v - a.v);
  const sp2 = 4.0 ** 2, chosen = [];
  const far = (s) => chosen.every((d) => (d.x - s.x) ** 2 + (d.y - s.y) ** 2 >= sp2);
  for (const ty of ['gateway', 'market', 'break-of-bulk', 'fortress', 'staple']) {
    const s = score.find((s) => s.engine === ty && far(s)); if (s && chosen.length < count) chosen.push(s);
  }
  // fill by score, but cap each engine so the map keeps variety (not all gateways)
  const cap = Math.max(2, Math.ceil(count / 3)), eng = {};
  chosen.forEach((s) => { eng[s.engine] = (eng[s.engine] || 0) + 1; });
  for (const s of score) { if (chosen.length >= count) break; if (chosen.some((d) => d.id === s.id) || !far(s) || (eng[s.engine] || 0) >= cap) continue; chosen.push(s); eng[s.engine] = (eng[s.engine] || 0) + 1; }
  for (const s of score) { if (chosen.length >= count) break; if (chosen.some((d) => d.id === s.id) || !far(s)) continue; chosen.push(s); } // relax if caps left us short
  return chosen;
}

// engine → tech gate for founding (when the era can support it)
const TECH_GATE = { gateway: 0, staple: 0.02, fortress: 0, 'break-of-bulk': 0.05, market: 0.12 };

// worldShocks: [{frac, kind:'sack'|'drought', mag}] — events delivered from the civ
// run this city lives inside (frac = position in the run, 0..1, mapped onto ticks).
export function runChronicle(seed, mesh, { ticks = 160, count = 15, r = 0.18, world = null, climate = null, worldShocks = null } = {}) {
  // the CAUSAL climate: a deglaciation backbone with volcanic/solar oscillations,
  // driven by this planet's own tilt + volcanoes. Passed a world → eruptions are
  // sourced from its real volcanoes; without one, a deterministic default still runs.
  const clim = climate || buildClimate(world, { seed });
  const env = [];
  for (let k = 0; k < ticks; k++) {
    const f = k / (ticks - 1), year = yearAt(f), fo = clim.forcingAt(year);
    env.push({ f, year, seaLevel: fo.seaLevelOffset, tempShift: fo.tempOffset, humidity: fo.humidity, tech: techAt(f), ice: fo.ice, regime: fo.regime });
  }
  // per-era river discharge (mass-conserving, wetness-driven) — precomputed once per tick
  // so rivers swell, shrink and die as the climate turns. Attached to each era for the
  // renderer (cellState reads env.riverW) and for river-fed fertility below.
  const NC = mesh.cells.length, riverW = new Float32Array(ticks * NC);
  for (let k = 0; k < ticks; k++) { riverW.set(computeRivers(mesh, env[k]), k * NC); env[k].riverW = riverW.subarray(k * NC, (k + 1) * NC); }
  // schedule climate catastrophes onto ticks (nearest-year). Only NOTABLE eruptions
  // (and every super-eruption / grand minimum) become discrete shocks.
  const yearToTick = (yr) => { let bk = 0, bd = Infinity; for (let k = 0; k < ticks; k++) { const d = Math.abs(env[k].year - yr); if (d < bd) { bd = d; bk = k; } } return bk; };
  const climateShocks = [];
  for (const ev of clim.events) {
    if (ev.year < env[0].year || ev.year > env[ticks - 1].year) continue;
    if (ev.kind === 'eruption' && ev.mag < 2.4) continue;
    climateShocks.push({ tick: yearToTick(ev.year), kind: ev.kind, mag: ev.mag || ev.depth || 1 });
  }
  const cand = candidates(mesh, count);

  // build town shells; found them lazily when habitable + tech-gated
  const towns = cand.map((s) => ({
    cell: s.id, x: mesh.cells[s.id].wx, y: mesh.cells[s.id].wy, gx: mesh.cells[s.id].gx,
    engine: s.engine, founded: -1, alive: false, pop: 0, s: 0.45, tributary: false,
    history: new Array(ticks).fill(0), flourishHist: new Array(ticks).fill(0),
    base: 0, trade: 0, K0: 0, surplus: 0,
  }));

  const art = makeArteries(mesh);
  const E = art.E;
  const artStrength = new Uint8Array(ticks * E);
  const waves = [];
  let lastWaveTech = -1;
  const events = [];

  // the discrete shocks the smooth clocks can't produce — plague, conquest, crisis.
  // deterministic from (seed, tick); they dip a town's population (which then recovers
  // logistically), with size-dependence: a metropolis shrugs, a mono-functional town dies.
  function applyEvents(k, e) {
    const alive = towns.filter((t) => t.alive && t.pop > 0);
    if (alive.length < 2) return;
    const total = alive.reduce((s, t) => s + t.pop, 0);
    const r1 = hash2(k, 1, seed), r2 = hash2(k, 2, seed), r3 = hash2(k, 3, seed), r4 = hash2(k, 4, seed), r5 = hash2(k, 5, seed);
    // PLAGUE — denser, bigger urban systems are likelier and hit harder
    if (e.f > 0.18 && r1 < 0.02 + 0.05 * Math.min(1, total / 1.5e5)) {
      for (const t of alive) t.pop *= 1 - (0.16 + 0.24 * Math.min(1, t.pop / 6e4));
      events.push({ tick: k, type: 'plague', cell: alive.sort((a, b) => b.pop - a.pop)[0].cell, note: 'plague' });
    }
    // CONQUEST — a wealthy town changes hands (sack/tribute/elite/absorb), size-dependent
    if (r2 < 0.028 && e.f > 0.08) {
      const ranked = alive.slice().sort((a, b) => b.pop - a.pop);
      const target = ranked[Math.floor(r4 * Math.min(3, ranked.length))];
      const oc = r5 < 0.14 ? 'sack' : r5 < 0.48 ? 'tribute' : r5 < 0.72 ? 'elite' : 'absorb';
      conquer(target, oc);
      events.push({ tick: k, type: 'conquest', cell: target.cell, ti: towns.indexOf(target), note: 'conquest · ' + oc, outcome: oc });
    }
    // FINANCIAL CRISIS — only once mature finance exists (tech>0.7 → early-modern+); hits the big centres
    if (e.tech > 0.7 && r3 < 0.07) {
      const top = alive.slice().sort((a, b) => b.pop - a.pop).slice(0, 3);
      for (const t of top) t.pop *= 0.82;
      if (top.length) events.push({ tick: k, type: 'crisis', cell: top[0].cell, note: 'financial crisis' });
    }
  }

  for (let k = 0; k < ticks; k++) {
    const e = env[k];
    // 1 — nucleation, gated by a rising settlement frontier (townships appear over time)
    const allowed = Math.round(2 + (count - 2) * Math.min(1, e.f / 0.7));
    let aliveCount = towns.filter((t) => t.alive).length;
    for (const t of towns) {
      if (t.alive || aliveCount >= allowed) continue;
      const c = mesh.cells[t.cell];
      if (e.ice < ICE_FOUND && habitable(c, e) && e.tech >= (TECH_GATE[t.engine] || 0) && (t.engine !== 'market' || e.tempShift > -0.05)) {
        t.surplus = surplusAround(mesh, t.cell, e);
        const bt = baseAndTrade(mesh, c, t.engine, t.surplus);
        t.base = bt.base; t.trade = bt.trade; t.K0 = t.surplus * KPP * 0.5; t.pop = 6; t.alive = true; t.founded = k; aliveCount++;
      }
    }
    // 2 — growth
    for (const t of towns) if (t.alive) {
      if (k % 12 === 0) { t.surplus = surplusAround(mesh, t.cell, e); t.K0 = t.surplus * KPP * 0.5; }
      growStep(t, { r, tech: e.tech });
    }
    // 3 — the shocks (mutate pops; logistic recovery resumes next tick)
    applyEvents(k, e);
    for (const sh of climateShocks) if (sh.tick === k) applyClimateShock(k, sh, towns, events);
    if (worldShocks) for (const sh of worldShocks) if (Math.round(sh.frac * (ticks - 1)) === k) applyWorldShock(k, sh, towns, events);
    // 4 — record
    for (const t of towns) if (t.alive) { t.history[k] = Math.max(0, Math.round(t.pop)); t.flourishHist[k] = Math.round(t.flourishVal || flourish(t)); }
    // 5 — arteries grow on the live town field
    const live = towns.filter((t) => t.alive && t.pop > 0).map((t) => ({ cell: t.cell, pop: t.pop }));
    if (live.length >= 2) art.step(live);
    const cond = art.cond; for (let i = 0; i < E; i++) artStrength[k * E + i] = Math.min(255, Math.round(cond[i] / 40 * 255));
    // 6 — tech waves: each time tech crosses a 0.2 band, a wave springs from the biggest live town
    const band = Math.floor(e.tech / 0.2);
    if (band > lastWaveTech && live.length) {
      lastWaveTech = band;
      const big = towns.filter((t) => t.alive).sort((a, b) => b.pop - a.pop)[0];
      if (big) waves.push({ tick: k, origin: big.cell, x: mesh.cells[big.cell].wx, y: mesh.cells[big.cell].wy, tech: e.tech });
    }
  }
  // final tiers + ranking
  for (const t of towns) { t.pop = Math.round(t.pop); t.tier = tierOf(t.pop); t.flourishVal = Math.round(t.flourishVal || 0); }
  return { seed, ticks, env, towns, edges: { ea: art.ea, eb: art.eb }, E, artStrength, waves, events, mesh };
}
