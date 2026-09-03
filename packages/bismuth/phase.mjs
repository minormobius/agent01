#!/usr/bin/env node
// bismuth — the phase space of the two-agent system. Masons move bricks from
// the melt (the budget) into the crystal; worms move them back out (a sink)
// or, with recycling, back into the melt. This runs the engine over grids of
// the two fluxes and reports what happens to the crystal's mass: whether it
// reaches its budget, holds a steady state, or spirals to nothing — and,
// when worms breed on what they eat and fade when they don't, whether the
// two populations cycle.
//
//   node packages/bismuth/phase.mjs                 # every experiment, JSON to stdout summary + phase.json
//   node packages/bismuth/phase.mjs --exp A         # A: pressure × masons (the sink), with and without recycling
//   node packages/bismuth/phase.mjs --exp B         # B: the Allee threshold — release at mass M0 against pressure P
//   node packages/bismuth/phase.mjs --exp C         # C: predator dynamics — spawnAfter × starve, cycles or extinction
//   node packages/bismuth/phase.mjs --exp C2        # C2: the chemostat — small appetites against a producer with capacity, a closed melt
//   node packages/bismuth/phase.mjs --exp D         # D: one mason vs many — the front count does not move
//   --out path.json                                 # where the runs and series go (default: packages/bismuth/phase.json)
//   --quick                                         # a coarser grid for a look
//
// Everything is the engine's own determinism: same grid, same numbers.

import { Growth } from "./crystal.js";
import { genome } from "./genome.js";
import { Worms } from "./worms.js";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const EXP = opt("--exp", "all");
const OUT = opt("--out", new URL("./phase.json", import.meta.url).pathname);
const QUICK = args.includes("--quick");
const SEED = 48112;

function world(budget, masons, seed = SEED) {
  const gen = genome(seed);
  gen.budget = budget;
  gen.masons = masons;
  return new Growth(gen);
}

// One run: grow to `release` bricks, loose the worms, run `tmax` ticks (or
// until the mass is gone), sampling mass, worms, eaten, laid every `sample`.
function run(p) {
  const { budget = 4000, masons = 8, release = 600, worms = {}, recycle = false, tmax = 300000, sample = 2000, seed = SEED } = p;
  const g = world(budget, masons, seed);
  while (!g.done && g.sub.count < release) g.step();
  const t0 = g.tick, laid0 = g.bricks.length;
  const layRate = laid0 / Math.max(1, t0);                      // bricks per tick before the worms
  const W = new Worms(g, Object.assign({ recycle }, worms));
  W.release();
  const series = [];
  let peak = g.sub.count, t = 0, wormPeak = W.worms.length;
  const c0 = g.colonies[0];
  // repairs: bricks laid into a site a worm had emptied — the crystal healing
  const wounds = new Set();
  let removedSeen = 0, brickSeen = g.bricks.length, repairs = 0;
  for (; t < tmax; t++) {
    if (!g.done) g.step();
    W.step();
    for (; removedSeen < g.removed.length; removedSeen++) wounds.add(g.removed[removedSeen]);
    for (; brickSeen < g.bricks.length; brickSeen++) { const b = g.bricks[brickSeen]; const s = b.tile !== undefined ? g.sub.siteAt({ tile: b.tile, z: b.z }) : g.sub.siteAt(b); if (wounds.has(s)) { repairs++; wounds.delete(s); } }
    if (g.sub.count > peak) peak = g.sub.count;
    if (W.worms.length > wormPeak) wormPeak = W.worms.length;
    if (t % sample === 0) series.push([t, g.sub.count, W.worms.length, W.eaten, g.bricks.length - laid0, g.masons.filter((m) => m.state === "surface").length, repairs]);
    if (g.sub.count === 0) break;
    if (W.worms.length > 800) break;                              // a bloom: the worms have won
    if (g.done && W.worms.length === 0) break;                    // nothing moves any more
  }
  series.push([t, g.sub.count, W.worms.length, W.eaten, g.bricks.length - laid0, g.masons.filter((m) => m.state === "surface").length, repairs]);
  const mass = g.sub.count;
  // the last quarter of the series: is the mass still moving?
  const q = series.slice(Math.max(1, Math.floor(series.length * 0.75)));
  const qm = q.map((s) => s[1]);
  const lo = Math.min(...qm), hi = Math.max(...qm);
  let outcome;
  if (mass === 0 || mass <= 0.1 * peak) outcome = "collapse";
  else if (W.worms.length > 800) outcome = "bloom";
  else if (c0.done && c0.laid + W.recycled >= budget * 0.98) outcome = mass >= 0.5 * peak ? "grew" : "grew-then-eaten";
  else if (c0.done) outcome = "stalled";
  else if ((hi - lo) <= 0.1 * Math.max(1, hi)) outcome = "steady";
  else if (qm[qm.length - 1] < qm[0]) outcome = "eroding";
  else outcome = "growing";
  return {
    params: p, outcome, peak, mass, wormPeak, ticks: t, layRate, repairs,
    laid: g.bricks.length - laid0, eaten: W.eaten, recycled: W.recycled, births: W.births, deaths: W.deaths, wormsLeft: W.worms.length,
    colony: { done: c0.done, cooling: c0.cooling, laid: c0.laid, frozen: c0.frozen, stalled: c0.stalled },
    series,
  };
}

const results = { seed: SEED, quick: QUICK, experiments: {} };
const log = (...a) => console.log(...a);
const pad = (v, n) => String(v).padStart(n);

// ── A: the sink. Pressure P = count·speed·bite (bricks a tick, at most) against masons ──
if (EXP === "all" || EXP === "A") {
  const masonsList = QUICK ? [2, 8] : [1, 2, 4, 8, 16];
  const bites = QUICK ? [0, 0.03, 0.3] : [0, 0.01, 0.03, 0.1, 0.3, 1.0];
  const runs = [];
  log("\nA — the sink: worms (3 × speed 0.04 × bite) against masons, budget 4000, released at 600 bricks");
  log("  recycle  masons   bite   P/tick  lay/tick  outcome           peak   final   laid   eaten  repair  recyc  ticks");
  for (const recycle of [false, true]) for (const masons of masonsList) for (const bite of bites) {
    const r = run({ budget: 4000, masons, release: 600, worms: { count: 3, speed: 0.04, bite }, recycle });
    r.P = 3 * 0.04 * bite;
    runs.push(r);
    log(`  ${pad(recycle ? "on" : "off", 7)}  ${pad(masons, 6)}  ${pad(bite, 5)}  ${pad(r.P.toFixed(4), 7)}  ${pad(r.layRate.toFixed(4), 8)}  ${r.outcome.padEnd(16)} ${pad(r.peak, 6)}  ${pad(r.mass, 6)}  ${pad(r.laid, 5)}  ${pad(r.eaten, 6)}  ${pad(r.repairs, 6)}  ${pad(r.recycled, 5)}  ${pad(r.ticks, 6)}`);
  }
  results.experiments.A = { masonsList, bites, runs };
}

// ── B: the Allee threshold. Release at M0 against P; does the crystal outgrow the worms? ──
if (EXP === "all" || EXP === "B") {
  const M0s = QUICK ? [200, 800] : [100, 200, 400, 800, 1600];
  const bites = QUICK ? [0.1, 0.4] : [0.05, 0.1, 0.2, 0.4, 0.8];
  const runs = [];
  log("\nB — the Allee threshold: 8 masons, budget 20000 (uncapped in the window), worms 3 × 0.04 × bite released at M0, 150k ticks");
  log("     M0   bite   P/tick  outcome           peak   final   laid   eaten  repair");
  for (const M0 of M0s) for (const bite of bites) {
    const r = run({ budget: 20000, masons: 8, release: M0, worms: { count: 3, speed: 0.04, bite }, recycle: false, tmax: 150000 });
    r.P = 3 * 0.04 * bite;
    runs.push(r);
    log(`  ${pad(M0, 5)}  ${pad(bite, 5)}  ${pad(r.P.toFixed(4), 7)}  ${r.outcome.padEnd(16)} ${pad(r.peak, 6)}  ${pad(r.mass, 6)}  ${pad(r.laid, 5)}  ${pad(r.eaten, 6)}  ${pad(r.repairs, 6)}`);
  }
  results.experiments.B = { M0s, bites, runs };
}

// ── C: predators. Worms that split on eating and fade unfed, recycling on: cycles, extinction, or bloom ──
if (EXP === "all" || EXP === "C") {
  const spawns = QUICK ? [3, 8] : [2, 4, 8];
  const starves = QUICK ? [80, 400] : [60, 150, 400];
  const runs = [];
  log("\nC — predators: 8 masons, budget 30000, 4 worms × speed 0.08 × bite 0.2, recycle on, released at 800; spawnAfter × starve, 300k ticks");
  log("  spawn  starve  outcome           peak   final  wormPk  left  births  deaths  eaten   peaksW");
  for (const spawnAfter of spawns) for (const starve of starves) {
    const r = run({ budget: 30000, masons: 8, release: 800, worms: { count: 4, speed: 0.08, bite: 0.2, spawnAfter, starve }, recycle: true, tmax: 300000, sample: 1000 });
    // count the peaks of the worm population (a peak is a local max above 1.3× the local mean of its neighbours)
    const w = r.series.map((s) => s[2]);
    let peaks = 0;
    for (let i = 5; i < w.length - 5; i++) {
      const left = w.slice(i - 5, i), right = w.slice(i + 1, i + 6);
      const m = (left.reduce((a, b) => a + b, 0) + right.reduce((a, b) => a + b, 0)) / 10;
      if (w[i] >= Math.max(...left, ...right) && w[i] > 1.3 * m && w[i] > 3) peaks++;
    }
    r.wormPeaks = peaks;
    runs.push(r);
    log(`  ${pad(spawnAfter, 5)}  ${pad(starve, 6)}  ${r.outcome.padEnd(16)} ${pad(r.peak, 6)}  ${pad(r.mass, 6)}  ${pad(r.wormPeak, 6)}  ${pad(r.wormsLeft, 4)}  ${pad(r.births, 6)}  ${pad(r.deaths, 6)}  ${pad(r.eaten, 6)}  ${pad(peaks, 6)}`);
  }
  results.experiments.C = { spawns, starves, runs };
}

// ── C2: the chemostat. Small per-capita appetite, a producer with real capacity, a closed melt:
//       does the worm population settle at the producer's ceiling, cycle, or eat the crystal out? ──
if (EXP === "all" || EXP === "C2") {
  const runs = [];
  log("\nC2 — the chemostat: budget 30000, recycle on, released at 1500; masons × (speed 0.04 × bite) × spawnAfter × starve, 300k ticks");
  log("  masons   bite  spawn  starve  outcome           lay/tick  peak   final  wormPk  left  births  deaths   eaten  peaksW");
  const grid = QUICK ? [[16, 0.03, 5, 150]] : [];
  if (!QUICK) for (const masons of [16, 32]) for (const bite of [0.01, 0.03]) for (const spawnAfter of [5, 15]) for (const starve of [150, 400]) grid.push([masons, bite, spawnAfter, starve]);
  for (const [masons, bite, spawnAfter, starve] of grid) {
    const r = run({ budget: 30000, masons, release: 1500, worms: { count: 4, speed: 0.04, bite, spawnAfter, starve }, recycle: true, tmax: 300000, sample: 1000 });
    const w = r.series.map((s) => s[2]);
    let peaks = 0;
    for (let i = 5; i < w.length - 5; i++) {
      const left = w.slice(i - 5, i), right = w.slice(i + 1, i + 6);
      const m = (left.reduce((a, b) => a + b, 0) + right.reduce((a, b) => a + b, 0)) / 10;
      if (w[i] >= Math.max(...left, ...right) && w[i] > 1.3 * m && w[i] > 3) peaks++;
    }
    r.wormPeaks = peaks;
    runs.push(r);
    log(`  ${pad(masons, 6)}  ${pad(bite, 5)}  ${pad(spawnAfter, 5)}  ${pad(starve, 6)}  ${r.outcome.padEnd(16)} ${pad(r.layRate.toFixed(4), 8)}  ${pad(r.peak, 5)}  ${pad(r.mass, 6)}  ${pad(r.wormPeak, 6)}  ${pad(r.wormsLeft, 4)}  ${pad(r.births, 6)}  ${pad(r.deaths, 6)}  ${pad(r.eaten, 6)}  ${pad(peaks, 6)}`);
  }
  results.experiments.C2 = { runs };
}

// ── D: masons are the rate, not the fronts. Count growth fronts at fixed mass for 1, 4, 16 masons ──
if (EXP === "all" || EXP === "D") {
  const runs = [];
  log("\nD — one mason or sixteen: the crystal at 2000 bricks, its fronts, and how long it took");
  log("  masons   ticks   ticks/brick   fed sites   terraces   box");
  for (const masons of [1, 2, 4, 8, 16]) {
    const g = world(6000, masons);
    while (!g.done && g.bricks.length < 2000) g.step();
    // fed sites: empty sites with a bond that the terrace rule feeds along +z or laterally — the engine's own count of where a brick may go
    const sub = g.sub, G = sub.occ.length ** (1 / 3) | 0;
    let fed = 0, cand = 0;
    const out = new Int32Array(512);
    const seen = new Set();
    for (const b of g.bricks) {
      const s = sub.siteAt(b);
      const n = sub.walk(s, out);
      for (let i = 0; i < n; i++) {
        const q = out[i];
        if (seen.has(q)) continue;
        seen.add(q);
        cand++;
        const c = sub.describe(q);
        // fed along any face whose neighbour is a brick
        let ok = false;
        for (let f = 0; f < 6 && !ok; f++) {
          const nx = c.x + (f === 0 ? -1 : f === 1 ? 1 : 0), ny = c.y + (f === 2 ? -1 : f === 3 ? 1 : 0), nz = c.z + (f === 4 ? -1 : f === 5 ? 1 : 0);
          const ns = sub.siteAt({ x: nx, y: ny, z: nz });
          if (ns >= 0 && sub.occ[ns] && sub.fed([c.x, c.y, c.z], f, g.rim, 0)) ok = true;
        }
        if (ok) fed++;
      }
    }
    const st = g.stats();
    runs.push({ masons, ticks: g.tick, perBrick: g.tick / 2000, fed, candidates: cand, terraces: st.terraces, box: st.box });
    log(`  ${pad(masons, 6)}  ${pad(g.tick, 6)}  ${pad((g.tick / 2000).toFixed(1), 11)}   ${pad(fed, 9)}   ${pad(st.terraces, 8)}   ${st.box.join("×")}`);
  }
  results.experiments.D = { runs };
}

writeFileSync(OUT, JSON.stringify(results));
log(`\nwrote ${OUT}`);
