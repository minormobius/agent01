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
function candidates(mesh, count, { spacing = 4.0, engines = null, excludeNear = null } = {}) {
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
  const sp2 = spacing * spacing, chosen = [];
  const far = (s) => chosen.every((d) => (d.x - s.x) ** 2 + (d.y - s.y) ** 2 >= sp2)
    && (!excludeNear || excludeNear.every((d) => (d.x - s.x) ** 2 + (d.y - s.y) ** 2 >= sp2));
  if (engines) for (let i = score.length - 1; i >= 0; i--) if (!engines.includes(score[i].engine)) score.splice(i, 1);
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

// ---- transport eras + commodities (the hinterland reform) ------------------------
// Settlement spacing is SUBORDINATE to the transport tech of the founders: a
// day's-walk lattice under walk, wider market areas under wheel, ports under sail,
// rail junctions under mechanisation. In civ mode the era boundaries come from the
// founder culture's ACTUAL capability unlock ticks (founderTech); standalone they
// fall back to the internal tech clock.
const TRANSPORT = [
  { key: 'walk',  spacing: 3.2, wave: 0 },
  { key: 'wheel', spacing: 4.5, wave: 4 },   // wave: extra towns founded when the era opens
  { key: 'sail',  spacing: 6.0, wave: 4 },   // ports
  { key: 'rail',  spacing: 8.0, wave: 3 },   // junctions
];
function transportLevelAt(f, civ, tech) {
  if (civ && civ.founderTech) {
    const ft = civ.founderTech, fr = cap => (ft[cap] != null ? ft[cap] / Math.max(1, civ.ticks) : 2);
    if (f >= fr('mechanisation')) return 3;
    if (f >= fr('sail')) return 2;
    if (f >= fr('wheel')) return 1;
    return 0;
  }
  return tech >= 0.85 ? 3 : tech >= 0.6 ? 2 : tech >= 0.35 ? 1 : 0;
}
// a town's export commodity, read off its site — what the habitat actually offers
function commodityOf(mesh, c) {
  let coast = 0; for (const n of c.neigh) if (mesh.cells[n].elev < mesh.baseSea) coast = 1;
  if (c.res === 'ore') return 'ore';
  if (c.res === 'clay') return 'clay';
  if (coast) return 'fish';
  if (c.river && c.moist > 0.45) return 'grain';
  if (c.moist > 0.6) return 'timber';
  return 'wool';
}
// cheap slope-penalized path between two mesh cells (greedy descent on distance +
// climb cost) — good enough for rail alignments on a small mesh, and deterministic
function railPath(mesh, a, b) {
  const path = [a]; let cur = a, guard = 0;
  const C = mesh.cells, bx = C[b].wx, by = C[b].wy;
  while (cur !== b && guard++ < 400) {
    let best = -1, bs = Infinity;
    for (const n of C[cur].neigh) {
      const d = Math.hypot(C[n].wx - bx, C[n].wy - by);
      const climb = Math.max(0, C[n].elev - C[cur].elev) * 14 + (C[n].elev < mesh.baseSea ? 8 : 0);
      const s = d + climb;
      if (s < bs) { bs = s; best = n; }
    }
    if (best < 0 || path.includes(best)) break;
    path.push(best); cur = best;
  }
  return cur === b ? path : null;
}

// worldShocks: [{frac, kind:'sack'|'drought', mag}] — events delivered from the civ
// run this city lives inside (frac = position in the run, 0..1, mapped onto ticks).
// civ: the FULL client contract (the hinterland reform) — when present, the
// environment, tech clock, transport eras and demographic envelope all come from
// the civ run instead of the internal deglaciation arc:
//   { ticks, tickYears, preset, pulse: {t:[], data:[]}, founderTech: {cap: tick},
//     envelope: [popSeries], envelopeT: [t] }
export function runChronicle(seed, mesh, { ticks = 160, count = 15, r = 0.18, world = null, climate = null, worldShocks = null, civ = null } = {}) {
  const env = [];
  let clim = null, climateShocks = [];
  if (civ) {
    // ---- civ-client environment: the run happens INSIDE the civ run's window.
    // No deglaciation (that arc pre-dates the founding); sea sits at the modern
    // level; temperature/humidity follow the run's global forcing curve, signed by
    // the preset (kurgan/4.2ka dry the world; beringia warms it).
    const pulseAt = (f) => {
      const P = civ.pulse; if (!P || !P.data || !P.data.length) return 0;
      const i2 = Math.min(P.data.length - 1, Math.max(0, Math.round(f * (P.data.length - 1))));
      return P.data[i2] || 0;
    };
    const dry = civ.preset === 'kurgan' || civ.preset === '4.2ka';
    for (let k = 0; k < ticks; k++) {
      const f = k / (ticks - 1), p = pulseAt(f);
      env.push({ f, year: Math.round(f * civ.ticks * (civ.tickYears || 2.5)), seaLevel: 0, ice: 0,
        tempShift: dry ? 0.25 * p : 0.35 * p, humidity: -(dry ? 0.5 : 0.15) * p,
        tech: 0, regime: p > 0.4 ? 'forcing' : 'stable' });
    }
    // tech clock from the founder culture's ACTUAL unlocks (fraction-mapped
    // milestones, linearly interpolated between them — no internal logistic)
    const ft = civ.founderTech || {};
    const MILE = [['agriculture-base', 0.18], ['wheel', 0.34], ['writing', 0.44], ['masonry', 0.5], ['sail', 0.6], ['metallurgy', 0.55], ['mechanisation', 0.88]];
    const marks = [[0, 0.1]];
    for (const [cap, lvl] of MILE) if (ft[cap] != null) marks.push([ft[cap] / Math.max(1, civ.ticks), lvl]);
    marks.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let hi = 0.1; const cleaned = marks.filter(m => { if (m[1] >= hi) { hi = m[1]; return true; } return false; });
    for (let k = 0; k < ticks; k++) {
      const f = k / (ticks - 1);
      let t0 = cleaned[0], t1 = cleaned[cleaned.length - 1];
      for (let i2 = 0; i2 < cleaned.length; i2++) { if (cleaned[i2][0] <= f) t0 = cleaned[i2]; if (cleaned[i2][0] >= f) { t1 = cleaned[i2]; break; } }
      env[k].tech = t0 === t1 ? t0[1] : t0[1] + (t1[1] - t0[1]) * ((f - t0[0]) / Math.max(1e-6, t1[0] - t0[0]));
    }
  } else {
    // ---- standalone: the original causal deglaciation backbone
    clim = climate || buildClimate(world, { seed });
    for (let k = 0; k < ticks; k++) {
      const f = k / (ticks - 1), year = yearAt(f), fo = clim.forcingAt(year);
      env.push({ f, year, seaLevel: fo.seaLevelOffset, tempShift: fo.tempOffset, humidity: fo.humidity, tech: techAt(f), ice: fo.ice, regime: fo.regime });
    }
  }
  // per-era river discharge (mass-conserving, wetness-driven)
  const NC = mesh.cells.length, riverW = new Float32Array(ticks * NC);
  for (let k = 0; k < ticks; k++) { riverW.set(computeRivers(mesh, env[k]), k * NC); env[k].riverW = riverW.subarray(k * NC, (k + 1) * NC); }
  if (clim) {
    const yearToTick = (yr) => { let bk = 0, bd = Infinity; for (let k = 0; k < ticks; k++) { const d = Math.abs(env[k].year - yr); if (d < bd) { bd = d; bk = k; } } return bk; };
    for (const ev of clim.events) {
      if (ev.year < env[0].year || ev.year > env[ticks - 1].year) continue;
      if (ev.kind === 'eruption' && ev.mag < 2.4) continue;
      climateShocks.push({ tick: yearToTick(ev.year), kind: ev.kind, mag: ev.mag || ev.depth || 1 });
    }
  }
  // demographic envelope (civ mode): the macro city's population curve, normalized —
  // regional growth is NUDGED toward its shape (client, not clamp)
  let envNorm = null;
  if (civ && civ.envelope && civ.envelope.length) {
    const mx = Math.max(1, ...civ.envelope);
    envNorm = (f) => civ.envelope[Math.min(civ.envelope.length - 1, Math.max(0, Math.round(f * (civ.envelope.length - 1))))] / mx;
  }
  // ENERGETICS boundary condition (civ mode): the world's gross food security scales
  // what the regional land yields — a bad global food balance presses on everyone.
  let foodSecAt = null;
  if (civ && civ.energy && civ.energy.foodSecurity && civ.energy.foodSecurity.length) {
    const S = civ.energy.foodSecurity;
    foodSecAt = (f) => {
      const v = S[Math.min(S.length - 1, Math.max(0, Math.round(f * (S.length - 1))))] || 0;
      return Math.max(0.6, Math.min(1.15, 0.55 + 0.45 * v));
    };
  }

  const mkShell = (s, foundedGate) => ({
    cell: s.id, x: mesh.cells[s.id].wx, y: mesh.cells[s.id].wy, gx: mesh.cells[s.id].gx,
    engine: s.engine, founded: -1, alive: false, pop: 0, s: 0.45, tributary: false,
    history: new Array(ticks).fill(0), flourishHist: new Array(ticks).fill(0),
    base: 0, trade: 0, trade0: 0, K0: 0, surplus: 0, wave: foundedGate || 0,
    commodity: commodityOf(mesh, mesh.cells[s.id]), drowned: -1,
    // the town's INDUSTRIAL ENERGY endowment, read off its habitat: falling water
    // (river flow), fuelwood (moisture), muscle always; fossil arrives with rail
    energy: { muscle: 1, water: +Math.min(1.5, mesh.cells[s.id].river ? mesh.cells[s.id].flow / 30 : 0).toFixed(2), wood: +Math.min(1, mesh.cells[s.id].moist * 1.2).toFixed(2), fossil: 0 },
  });
  // wave 0: the day's-walk lattice (walk-era spacing; no sea-trade emphasis yet)
  const towns = candidates(mesh, count, { spacing: TRANSPORT[0].spacing }).map((s) => mkShell(s, 0));

  const art = makeArteries(mesh);
  const E = art.E;
  const artStrength = new Uint8Array(ticks * E);
  const waves = [];
  let lastWaveTech = -1;
  const events = [];
  const transport = new Uint8Array(ticks);
  const rails = [], seaRoutes = [];
  let lastLevel = -1;

  // the discrete shocks the smooth clocks can't produce — plague, conquest, crisis.
  function applyEvents(k, e) {
    const alive = towns.filter((t) => t.alive && t.pop > 0);
    if (alive.length < 2) return;
    const total = alive.reduce((s, t) => s + t.pop, 0);
    const r1 = hash2(k, 1, seed), r2 = hash2(k, 2, seed), r3 = hash2(k, 3, seed), r4 = hash2(k, 4, seed), r5 = hash2(k, 5, seed);
    if (e.f > 0.18 && r1 < 0.02 + 0.05 * Math.min(1, total / 1.5e5)) {
      for (const t of alive) t.pop *= 1 - (0.16 + 0.24 * Math.min(1, t.pop / 6e4));
      events.push({ tick: k, type: 'plague', cell: alive.sort((a, b) => b.pop - a.pop)[0].cell, note: 'plague' });
    }
    if (r2 < 0.028 && e.f > 0.08) {
      const ranked = alive.slice().sort((a, b) => b.pop - a.pop);
      const target = ranked[Math.floor(r4 * Math.min(3, ranked.length))];
      const oc = r5 < 0.14 ? 'sack' : r5 < 0.48 ? 'tribute' : r5 < 0.72 ? 'elite' : 'absorb';
      conquer(target, oc);
      events.push({ tick: k, type: 'conquest', cell: target.cell, ti: towns.indexOf(target), note: 'conquest · ' + oc, outcome: oc });
    }
    if (e.tech > 0.7 && r3 < 0.07) {
      const top = alive.slice().sort((a, b) => b.pop - a.pop).slice(0, 3);
      for (const t of top) t.pop *= 0.82;
      if (top.length) events.push({ tick: k, type: 'crisis', cell: top[0].cell, note: 'financial crisis' });
    }
  }

  // a transport era opens: found its wave of era-appropriate towns at era spacing
  function eraWave(k, level) {
    const T = TRANSPORT[level];
    const existing = towns.map((t) => ({ x: t.x, y: t.y }));
    let picks = [];
    if (level === 2) {         // sail → PORTS: coastal gateways
      picks = candidates(mesh, T.wave, { spacing: T.spacing, engines: ['gateway', 'break-of-bulk'], excludeNear: existing });
      events.push({ tick: k, type: 'era', cell: picks[0] ? picks[0].id : towns[0].cell, note: 'the age of sail — ports open' });
    } else if (level === 3) {  // rail → build the network, then found JUNCTIONS on it
      const ranked = towns.filter((t) => t.alive && t.drowned < 0).sort((a, b) => b.pop - a.pop).slice(0, 6);
      const connected = ranked.length ? [ranked[0]] : [];
      for (const t of ranked.slice(1)) {
        let best = null, bd = Infinity;
        for (const c of connected) { const d = Math.hypot(c.x - t.x, c.y - t.y); if (d < bd) { bd = d; best = c; } }
        const path = best && railPath(mesh, best.cell, t.cell);
        if (path) { rails.push({ a: best.cell, b: t.cell, path, tick: k }); connected.push(t); }
      }
      for (const t of connected) if (!t.railed) { t.railed = true; t.trade0 = (t.trade0 || t.trade); t.trade = t.trade0 + 0.5; t.energy.fossil = 1; }
      // junction towns at rail midpoints, era spacing
      const mids = rails.map((rl) => rl.path[Math.floor(rl.path.length / 2)]);
      const midSet = new Set(mids);
      picks = candidates(mesh, T.wave, { spacing: T.spacing, engines: ['break-of-bulk', 'market'], excludeNear: existing })
        .filter((s) => mids.some((m) => Math.hypot(mesh.cells[m].wx - s.x, mesh.cells[m].wy - s.y) < 6) || midSet.has(s.id));
      events.push({ tick: k, type: 'era', cell: rails[0] ? rails[0].a : towns[0].cell, note: 'the railroad age — the network is laid' });
    } else if (level === 1) {  // wheel → wider market towns fill in
      picks = candidates(mesh, T.wave, { spacing: T.spacing, engines: ['market', 'staple'], excludeNear: existing });
      events.push({ tick: k, type: 'era', cell: picks[0] ? picks[0].id : towns[0].cell, note: 'the wheel — market areas widen' });
    }
    for (const s of picks) towns.push(mkShell(s, level));
    // sail also opens SEA ROUTES between coastal towns
    if (level === 2) {
      const coastal = towns.filter((t) => { const c = mesh.cells[t.cell]; return c.neigh.some((n) => mesh.cells[n].elev < mesh.baseSea); });
      for (let i2 = 0; i2 < coastal.length; i2++) {
        let links = 0;
        for (let j = i2 + 1; j < coastal.length && links < 2; j++) {
          const a = coastal[i2], b = coastal[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > 7 && d < 30) { seaRoutes.push({ a: a.cell, b: b.cell, tick: k }); links++; a.trade0 = (a.trade0 || a.trade); b.trade0 = (b.trade0 || b.trade); a.trade = (a.trade0) + 0.3; b.trade = (b.trade0) + 0.3; }
        }
      }
    }
  }

  for (let k = 0; k < ticks; k++) {
    const e = env[k];
    // transport era transitions → founding waves (spacing subordinate to transport)
    const level = transportLevelAt(e.f, civ, e.tech);
    transport[k] = level;
    if (level > lastLevel) { for (let L = Math.max(1, lastLevel + 1); L <= level; L++) eraWave(k, L); lastLevel = level; }
    // 1 — nucleation. Wave-0 towns rise on the settlement frontier; era-wave towns
    // found as soon as habitable after their era opens.
    const allowed = Math.round(2 + (count - 2) * Math.min(1, e.f / 0.7));
    let aliveCount = towns.filter((t) => t.alive && t.wave === 0).length;
    for (const t of towns) {
      if (t.alive || t.drowned >= 0) continue;
      if (t.wave === 0 && aliveCount >= allowed) continue;
      const c = mesh.cells[t.cell];
      if (e.ice < ICE_FOUND && habitable(c, e) && e.tech >= (TECH_GATE[t.engine] || 0) && (t.engine !== 'market' || e.tempShift > -0.05)) {
        t.surplus = surplusAround(mesh, t.cell, e);
        const bt = baseAndTrade(mesh, c, t.engine, t.surplus);
        t.base = bt.base; t.trade = bt.trade; t.trade0 = bt.trade; t.K0 = t.surplus * KPP * 0.5 * (foodSecAt ? foodSecAt(e.f) : 1); t.pop = 6; t.alive = true; t.founded = k;
        if (t.wave === 0) aliveCount++;
      }
    }
    // 1b — DROWNING: the sea does not negotiate. A town whose cell goes under the
    // current sea level dies there (no phantom cities on the shelf).
    for (const t of towns) {
      if (!t.alive) continue;
      if (mesh.cells[t.cell].elev < e.seaLevel) {
        if (t.drowned < 0) { t.drowned = k; events.push({ tick: k, type: 'drowned', cell: t.cell, note: 'the sea takes the town' }); }
        t.pop *= 0.3;
        if (t.pop < 8) { t.pop = 0; t.alive = false; }
      }
    }
    // 2 — growth (envelope-nudged in civ mode: the region breathes with the macro
    // city; food security acts Malthusian-side too — scarcity slows growth even
    // below the carrying ceiling, not just at it)
    const rEff = (envNorm ? r * (0.55 + 0.9 * envNorm(e.f)) : r) * (foodSecAt ? foodSecAt(e.f) : 1);
    for (const t of towns) if (t.alive && t.drowned < 0) {
      if (k % 12 === 0) { t.surplus = surplusAround(mesh, t.cell, e); t.K0 = t.surplus * KPP * 0.5 * (foodSecAt ? foodSecAt(e.f) : 1); }
      // industrial-era growth runs on ENERGY: towns with falling water or fossil fuel
      // industrialize harder than muscle-and-wood towns (the mill-town advantage)
      const eMul = e.tech > 0.75 ? (0.85 + 0.35 * Math.min(1, (Number(t.energy.water) + t.energy.fossil) * 0.7)) : 1;
      growStep(t, { r: rEff * eMul, tech: e.tech });
    }
    // 2b — commodity complementarity: rail + sea links between towns exporting
    // DIFFERENT goods lift both (comparative advantage), refreshed periodically
    if (k % 12 === 0 && (rails.length || seaRoutes.length)) {
      const byCell = new Map(towns.map((t) => [t.cell, t]));
      for (const t of towns) if (t.railed || t.seaBonus) { /* keep */ }
      for (const link of [...rails, ...seaRoutes]) {
        const a = byCell.get(link.a), b = byCell.get(link.b);
        if (a && b && a.alive && b.alive && a.commodity !== b.commodity) { a.pop *= 1.004; b.pop *= 1.004; }
      }
    }
    // 3 — the shocks
    applyEvents(k, e);
    for (const sh of climateShocks) if (sh.tick === k) applyClimateShock(k, sh, towns, events);
    if (worldShocks) for (const sh of worldShocks) if (Math.round(sh.frac * (ticks - 1)) === k) applyWorldShock(k, sh, towns, events);
    // 4 — record
    for (const t of towns) if (t.alive) { t.history[k] = Math.max(0, Math.round(t.pop)); t.flourishHist[k] = Math.round(t.flourishVal || flourish(t)); }
    // 5 — arteries grow on the live town field
    const live = towns.filter((t) => t.alive && t.pop > 0).map((t) => ({ cell: t.cell, pop: t.pop }));
    if (live.length >= 2) art.step(live);
    const cond = art.cond; for (let i = 0; i < E; i++) artStrength[k * E + i] = Math.min(255, Math.round(cond[i] / 40 * 255));
    // 6 — tech waves viz
    const band = Math.floor(e.tech / 0.2);
    if (band > lastWaveTech && live.length) {
      lastWaveTech = band;
      const big = towns.filter((t) => t.alive).sort((a, b) => b.pop - a.pop)[0];
      if (big) waves.push({ tick: k, origin: big.cell, x: mesh.cells[big.cell].wx, y: mesh.cells[big.cell].wy, tech: e.tech });
    }
  }
  for (const t of towns) { t.pop = Math.round(t.pop); t.tier = tierOf(t.pop); t.flourishVal = Math.round(t.flourishVal || 0); }
  return { seed, ticks, env, towns, edges: { ea: art.ea, eb: art.eb }, E, artStrength, waves, events, mesh, transport, rails, seaRoutes, civMode: !!civ };
}
