// record.js — THE SOLVE OF RECORD (FOAM.md leg 6): the two-scale answer to "the Laplace field is
// global but the player only ever has a neighbourhood loaded".
//
//   · COARSE PASS — coarseSolve(): the desire-line kernel run on the REGION LATTICE itself
//     (nodes = regions, edges = seams; azimuth wraps, the axis is a finite settled band). Demand
//     is a deterministic gravity model over hashed region masses + a few hub regions. The output
//     — a conductance + arterial tier per seam — is the trunk network, persistable as just
//     (genome, seed, extent): THE RECORD.
//   · EXTENSION — extendRecord(): the settled band grows append-only. Seams already in the record
//     keep their recorded values bit-for-bit (frozen boundary condition), so history is immutable:
//     extending the world cannot rewrite an inch of road anyone has walked. Pinned.
//   · GATES — gatesFor(): where fine roads cross a seam. A gate is a PAIR of adjacent chambers,
//     one on each side of the seam line, chosen as a pure function of the shared border (which
//     the seam contract makes bit-identical from both sides) — so two regions solved
//     independently choose the SAME crossings without communicating.
//   · FINE PASS — solveRegion(): one region's streets, grown locally by the same desire-line
//     kernel from its own provisional society's trips PLUS through-demand injected at the active
//     gates (weighted by the record's seam tiers). The right-of-way is forced to include the
//     region's gate chambers, so adjacent regions' networks MEET at the seams by construction.
//     Deterministic from (lattice, seed, genome, record, regionKey): regenerate a region a year
//     later and it is the same streets.
//
// Pure + deterministic; node + browser. Consumes region.js (the seam contract) and reuses
// society3d's assembleCity + paint/flux's grower unchanged.

import { regionFoam, chamberAt } from './region.js';
import { assembleCity } from './society3d.js';
import { buildSociety, DEFAULT_GENOME } from './econ.js';
import { makeGraph, createGrower, finalizeField } from '../paint/flux.js';

function roll(seed, a, b, c, salt) {                       // record-local hash (distinct stream)
  let h = (seed | 0) ^ 0x51ed270b;
  h = Math.imul(h ^ (a | 0), 0x85ebca6b); h ^= h >>> 13;
  h = Math.imul(h ^ (b | 0), 0xc2b2ae35); h ^= h >>> 16;
  h = Math.imul(h ^ (c | 0), 0x27d4eb2f); h ^= h >>> 15;
  h = Math.imul(h ^ (salt | 0), 0x165667b1); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const normAz = (az, R) => ((az % R) + R) % R;
export const seamKey = (A, B, R) => {
  const ka = normAz(A.az, R) + ',' + A.ax, kb = normAz(B.az, R) + ',' + B.ax;
  return ka < kb ? ka + '|' + kb : kb + '|' + ka;
};

// ── THE COARSE PASS: the arterial trunk network over the settled band ───────────────────────────
export function coarseSolve({ lattice, seed = 1, axMin = 0, axMax = 5, hubs = 3, iters = 24, mu = 0.8 } = {}) {
  const R = lattice.regionsPerRing, bands = axMax - axMin + 1, n = R * bands;
  const idx = (az, ax) => normAz(az, R) + (ax - axMin) * R;
  const mass = new Float64Array(n), hubScore = new Float64Array(n);
  for (let ax = axMin; ax <= axMax; ax++) for (let az = 0; az < R; az++) {
    const i = idx(az, ax);
    mass[i] = 0.5 + roll(seed, az, ax, 0, 11);
    hubScore[i] = roll(seed, az, ax, 0, 12);
  }
  const hubIdx = [...hubScore.keys()].sort((a, b) => hubScore[b] - hubScore[a]).slice(0, Math.max(1, hubs));
  const edges = [], eKey = [];
  for (let ax = axMin; ax <= axMax; ax++) for (let az = 0; az < R; az++) {
    edges.push({ a: idx(az, ax), b: idx(az + 1, ax), len: 1 });
    eKey.push(seamKey({ az, ax }, { az: az + 1, ax }, R));
    if (ax < axMax) { edges.push({ a: idx(az, ax), b: idx(az, ax + 1), len: 1 }); eKey.push(seamKey({ az, ax }, { az, ax: ax + 1 }, R)); }
  }
  const graph = makeGraph(n, edges);
  const ringDist = (a, b) => { const da = Math.abs((a % R) - (b % R)); return Math.min(da, R - da) + Math.abs(Math.floor(a / R) - Math.floor(b / R)); };
  const trips = [];
  for (let i = 0; i < n; i++) for (const h of hubIdx) { if (h === i) continue; trips.push({ a: h, b: i, w: mass[i] * mass[h] / (1 + ringDist(i, h) ** 2) }); }
  const grower = createGrower(graph, trips, { mu });
  for (let k = 0; k < iters; k++) grower.step();
  const conds = [...grower.state.cond].sort((a, b) => a - b);
  const q = (f) => conds[Math.floor(conds.length * f)];
  const tHi = q(0.9), tMid = q(0.7), tLo = q(0.45);
  const seams = new Map();
  for (let e = 0; e < edges.length; e++) {
    const c = grower.state.cond[e];
    seams.set(eKey[e], { cond: c, tier: c >= tHi ? 3 : c >= tMid ? 2 : c >= tLo ? 1 : 0 });
  }
  return { lattice, seed, axMin, axMax, hubs: hubIdx.map((i) => ({ az: i % R, ax: Math.floor(i / R) + axMin })), seams, mu };
}

// ── EXTENSION: append axial bands; seams already recorded stay bit-identical (history frozen) ──
export function extendRecord(record, newAxMax, { iters = 24 } = {}) {
  if (newAxMax <= record.axMax) return record;
  const fresh = coarseSolve({ lattice: record.lattice, seed: record.seed, axMin: record.axMin, axMax: newAxMax, hubs: record.hubs.length, iters, mu: record.mu });
  for (const [k, v] of record.seams) fresh.seams.set(k, v);
  return fresh;
}

// ── GATES: K well-spread chamber PAIRS across a seam, a pure function of the shared border ──────
// Azimuthal seam (B = A's +θ neighbour): pairs ((gx, gyLine−1, gz) in A, (gx, gyLine, gz) in B).
// Axial seam (B = A's +x neighbour): pairs ((gxLine−1, gy, gz) in A, (gxLine, gy, gz) in B).
// Both regions evaluate the identical function: gatesFor(A,B) ≡ gatesFor(B,A). Gates live in the
// mid-shell deck band; a candidate needs BOTH chambers to exist (region.js's own existence law).
export function gatesFor(lattice, seed, grade, A, B, axSpan, K = 3) {
  const L = lattice, R = L.regionsPerRing;
  // canonical orientation: lo → hi along the seam normal (handles the azimuth wrap)
  const azD = normAz(B.az - A.az, R);
  let kind, lo, hi;
  if (A.ax === B.ax && (azD === 1 || azD === R - 1)) { kind = 'az'; [lo, hi] = azD === 1 ? [A, B] : [B, A]; }
  else if (normAz(A.az, R) === normAz(B.az, R) && Math.abs(A.ax - B.ax) === 1) { kind = 'ax'; [lo, hi] = A.ax < B.ax ? [A, B] : [B, A]; }
  else return [];
  const gzs = [];
  const gzMid = Math.floor(L.nz / 2);
  for (const gz of [gzMid - 1, gzMid, gzMid + 1]) if (gz >= 0 && gz < L.nz) gzs.push(gz);
  const cands = [];
  if (kind === 'az') {
    const gyLine = normAz(hi.az, R) * L.nyR;                 // hi's first gy column IS the seam
    const gx0 = lo.ax * axSpan, gx1 = gx0 + axSpan;
    for (let gx = gx0; gx < gx1; gx++) for (const gz of gzs) {
      if (!chamberAt(L, seed, grade, gx, gyLine - 1, gz) || !chamberAt(L, seed, grade, gx, gyLine, gz)) continue;
      cands.push({ a: gx + '|' + normAz(gyLine - 1, L.nyRing) + '|' + gz, b: gx + '|' + normAz(gyLine, L.nyRing) + '|' + gz, t: (gx - gx0) / axSpan, h: roll(seed, gx, gyLine, gz, 21) });
    }
  } else {
    const gxLine = hi.ax * axSpan;
    const gy0 = normAz(lo.az, R) * L.nyR;
    for (let k = 0; k < L.nyR; k++) for (const gz of gzs) {
      const gy = gy0 + k;
      if (!chamberAt(L, seed, grade, gxLine - 1, gy, gz) || !chamberAt(L, seed, grade, gxLine, gy, gz)) continue;
      cands.push({ a: (gxLine - 1) + '|' + normAz(gy, L.nyRing) + '|' + gz, b: gxLine + '|' + normAz(gy, L.nyRing) + '|' + gz, t: k / L.nyR, h: roll(seed, gxLine, gy, gz, 22) });
    }
  }
  // K well-spread picks: the hash-minimum of each of K equal segments along the seam
  const out = [];
  for (let k = 0; k < K; k++) {
    let best = null;
    for (const c of cands) if (c.t >= k / K && c.t < (k + 1) / K && (!best || c.h < best.h)) best = c;
    if (best) out.push({ a: best.a, b: best.b });
  }
  return out;
}

// ── THE FINE PASS: one region's streets, grown to meet its neighbours at the gates ──────────────
export function solveRegion({
  lattice, seed = 1, grade = 0.4, genome = DEFAULT_GENOME, record,
  az = 0, ax = 0, axSpan = 20, iters = 6, vert = 6, roadFrac = 0.06, mu = 0.75,
  gateW = 4, wWork = 1.0, wThird = 0.6, wSupply = 0.4, planarBias = 6, bandBias = 4, condMax = 60,
} = {}) {
  const L = lattice, R = L.regionsPerRing, azN = normAz(az, R);
  const rf = regionFoam({ lattice: L, seed, grade, az: azN, ax, axSpan });
  // adapters: regionFoam → the shapes assembleCity expects (unwrapped θ keeps geometry continuous)
  const cells = rf.nodes.map((c) => ({ x: c.x, y: c.y, z: c.z, th: c.thU, rad: c.rad, circ: c.gy * L.cell }));
  const foamA = { mi: rf.mi, mj: rf.mj, arcLen: L.nyR * L.cell, Lx: axSpan * L.cell, cell: L.cell, Ri: L.Ri, T: L.T };
  const nav = { n: cells.length, cells };
  const seedR = (seed ^ Math.imul(azN + 1, 0x9e3779b1) ^ Math.imul((ax + 0x4000) | 0, 0x85ebca77)) >>> 0;
  const o = { Ri: L.Ri, T: L.T, seed: seedR, genome, vert, route: null };

  // provisional no-road city + society → the local demand (hub-first; flux is symmetric)
  const base = assembleCity(foamA, nav, new Set(), o);
  const society = buildSociety(base, { seed: seedR, genome });
  const agg = new Map();
  const add = (a, b, w) => { if (a < 0 || b < 0 || a === b) return; const k = a + ',' + b; agg.set(k, (agg.get(k) || 0) + w); };
  const door = (id) => base.places[id].door;
  for (const p of society.people) {
    const home = door(p.home);
    for (const h of p.hats) { if (h.place === p.home) continue; add(door(h.place), home, h.kind === 'work' ? wWork : wThird); }
  }
  for (const e of base.edges) add(door(e.to), door(e.from), wSupply);

  // ACTIVE GATES: this region's member of each gate pair on every recorded seam with tier ≥ 1
  const byGid = new Map(rf.nodes.map((c) => [c.gid, c.idx]));
  const myGates = [];
  for (const nb of [{ az: azN + 1, ax }, { az: azN - 1, ax }, { az: azN, ax: ax + 1 }, { az: azN, ax: ax - 1 }]) {
    const rec = record && record.seams.get(seamKey({ az: azN, ax }, nb, R));
    const tier = rec ? rec.tier : 0;
    if (!tier) continue;
    for (const pair of gatesFor(L, seed, grade, { az: azN, ax }, nb, axSpan, tier)) {
      const mine = byGid.has(pair.a) ? pair.a : byGid.has(pair.b) ? pair.b : null;
      if (mine) myGates.push({ idx: byGid.get(mine), gid: mine, tier });
    }
  }
  // gate demand: through-traffic between gates + each gate into a few deterministic local doors
  const trips = [];
  for (const [k, w] of agg) { const [a, b] = k.split(','); trips.push({ a: +a, b: +b, w }); }
  for (let i = 0; i < myGates.length; i++) for (let j = i + 1; j < myGates.length; j++)
    trips.push({ a: myGates[i].idx, b: myGates[j].idx, w: gateW * 0.5 * (myGates[i].tier + myGates[j].tier) });
  const doors = base.places.map((p) => p.door);
  for (let g = 0; g < myGates.length; g++) for (let k = 0; k < 3 && doors.length; k++)
    trips.push({ a: myGates[g].idx, b: doors[Math.floor(roll(seedR, g, k, 0, 31) * doors.length)], w: gateW * 0.5 });

  // grow over anisotropic lengths (face/edge neighbours, as the foam grower), with GRAVITY'S
  // BIAS on the wear pattern, two parts: (1) climb edges cap planarBias× lower — a worn-in stair
  // never gets as cheap as a worn-in street; (2) level edges OUTSIDE the gate band cap mildly
  // lower than inside it — the deck the record routes its gates through is the natural street
  // level, so cross-region traffic consolidates onto one planar concourse instead of thin
  // streets smeared over every layer. Flux still decides WHERE streets run; gravity decides on
  // which deck.
  const rBar = L.Ri + L.T / 2, edgeList = [], capList = [];
  const gzMid = Math.floor(L.nz / 2);
  for (let m = 0; m < rf.mi.length; m++) {
    const ia = rf.mi[m], ib = rf.mj[m], a = cells[ia], b = cells[ib];
    const horiz = Math.hypot(rBar * (b.th - a.th), b.z - a.z), dr = Math.abs(b.rad - a.rad);
    if (Math.hypot(horiz, dr) > 1.3 * L.cell) continue;
    edgeList.push({ a: ia, b: ib, len: horiz + vert * dr });
    const inBand = Math.abs(rf.nodes[ia].gz - gzMid) <= 1 && Math.abs(rf.nodes[ib].gz - gzMid) <= 1;
    capList.push(dr > 0.35 * L.cell ? condMax / planarBias : inBand ? condMax : condMax / bandBias);
  }
  const graph = makeGraph(cells.length, edgeList);
  const nOrigins = new Set(trips.map((t) => t.a)).size;
  const grower = createGrower(graph, trips, { mu, originBatches: Math.max(1, Math.ceil(nOrigins / 700)), condCap: Float64Array.from(capList) });
  for (let k = 0; k < iters; k++) grower.step();
  const ff = finalizeField(graph, grower.state, { roadFrac });
  const row = new Set();
  for (let i = 0; i < cells.length; i++) if (ff.isRoad[i]) row.add(i);
  // FORCE the gates into the right-of-way (the seam-continuity guarantee), pathing strays inward
  for (const g of myGates) {
    if (row.has(g.idx)) continue;
    row.add(g.idx);
    const par = new Int32Array(cells.length).fill(-2); par[g.idx] = -1;
    const q = [g.idx]; let hit = -1;
    for (let h = 0; h < q.length && hit < 0; h++) { const u = q[h]; for (const [v] of graph.adj[u]) { if (par[v] !== -2) continue; if (row.has(v) && v !== g.idx) { hit = v; par[v] = u; break; } par[v] = u; q.push(v); } }
    for (let u = hit; u >= 0 && par[u] !== -1; u = par[u]) row.add(u);
  }
  const city = assembleCity(foamA, nav, row, o);
  return { key: { az: azN, ax }, rf, city, society: null /* re-settle downstream */, base,
    gates: myGates.map((g) => g.gid), graph, state: grower.state,
    stats: { chambers: cells.length, row: row.size, gates: myGates.length, closure: city.closure, access: city.access } };
}
