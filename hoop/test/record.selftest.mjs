// record.selftest.mjs — pins THE SOLVE OF RECORD (hoop/econ/record.js): the two-scale street
// solve for the game port. Coarse = arterial tiers over the region lattice, append-only and
// frozen; fine = per-region streets grown to meet the neighbours at deterministic seam GATES.
// Run: node hoop/test/record.selftest.mjs
import { ringLattice } from '../econ/region.js';
import { coarseSolve, extendRecord, gatesFor, solveRegion, seamKey } from '../econ/record.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const L = ringLattice({ Ri: 150, T: 12, cell: 1, regionsPerRing: 36 });
const SEED = 7, GRADE = 0.4, AXSPAN = 14;

// ── the coarse pass: a deterministic, tiered, wrapping trunk network ──
const rec = coarseSolve({ lattice: L, seed: SEED, axMin: 0, axMax: 5 });
{
  const rec2 = coarseSolve({ lattice: L, seed: SEED, axMin: 0, axMax: 5 });
  let same = rec.seams.size === rec2.seams.size;
  if (same) for (const [k, v] of rec.seams) { const w = rec2.seams.get(k); if (!w || w.cond !== v.cond) { same = false; break; } }
  ok(same, 'the coarse solve is deterministic from (lattice, seed, extent)');
  ok(rec.seams.size === 36 * 6 + 36 * 5, 'every seam of the settled band is recorded (' + rec.seams.size + ')');
  const tiers = [0, 0, 0, 0]; for (const [, v] of rec.seams) tiers[v.tier]++;
  ok(tiers[3] > 0 && tiers[1] > 0 && tiers[0] > 0, 'a trunk hierarchy emerges over the lattice (tiers 0..3: ' + tiers.join('/') + ')');
  ok(rec.seams.has(seamKey({ az: 35, ax: 0 }, { az: 0, ax: 0 }, 36)), 'the azimuthal wrap seam is in the record (the ring closes at the coarse scale too)');
  ok(rec.hubs.length === 3 && rec.hubs.every((h) => h.az >= 0 && h.az < 36 && h.ax >= 0 && h.ax <= 5), 'hub regions are recorded inside the band');
}

// ── extension: history is immutable ──
const ext = extendRecord(rec, 9);
{
  ok(ext.axMax === 9 && ext.seams.size > rec.seams.size, 'the settled band extends (append-only: ' + rec.seams.size + ' → ' + ext.seams.size + ' seams)');
  let frozen = true;
  for (const [k, v] of rec.seams) { const w = ext.seams.get(k); if (!w || w.cond !== v.cond || w.tier !== v.tier) { frozen = false; break; } }
  ok(frozen, 'every previously recorded seam is bit-identical after extension — HISTORY IS FROZEN');
  ok(extendRecord(ext, 4) === ext, 'shrinking is a no-op (the record only grows)');
}

// ── gates: symmetric pure functions of the shared border ──
// pick a tier≥2 azimuthal seam inside the band so the continuity test below has real gates
let GA = null, GB = null;
for (let az = 0; az < 36 && !GA; az++) for (let ax = 1; ax <= 4 && !GA; ax++) {
  const s = ext.seams.get(seamKey({ az, ax }, { az: az + 1, ax }, 36));
  if (s && s.tier >= 2) { GA = { az, ax }; GB = { az: (az + 1) % 36, ax }; }
}
{
  ok(!!GA, 'a tier≥2 azimuthal seam exists in the band to test against');
  const g1 = gatesFor(L, SEED, GRADE, GA, GB, AXSPAN, 3), g2 = gatesFor(L, SEED, GRADE, GB, GA, AXSPAN, 3);
  ok(g1.length >= 2, 'the seam yields well-spread gate pairs (' + g1.length + ')');
  ok(JSON.stringify(g1) === JSON.stringify(g2), 'gatesFor is symmetric — both regions choose the SAME crossings without communicating');
  ok(g1.every((p) => { const [ax_, ay] = p.a.split('|').map(Number), [bx, by] = p.b.split('|').map(Number); return ax_ === bx && Math.abs(((by - ay) % L.nyRing + L.nyRing) % L.nyRing) === 1; }), 'each gate is a true adjacent pair across the seam line');
  // the wrap seam yields gates too
  const gw = gatesFor(L, SEED, GRADE, { az: 35, ax: 1 }, { az: 0, ax: 1 }, AXSPAN, 3);
  ok(gw.length >= 1, 'the azimuthal WRAP seam yields gates (' + gw.length + ')');
}

// ── THE STITCHING CONTRACT (v3): every seam is crossable ON THE DECK ─────────────────────────────
// The game walks only the mid-shell deck. A seam whose gates all land on gz±1 reads as a wall the
// player can see a street through — the "no gate on this deck toward region" bug. With K floored to
// ≥1 (every adjacent region pair connected) and gatesFor's deck guarantee, EVERY band seam must put
// a gate on gz = gzMid. Symmetric, so both regions agree on that crossing.
{
  const gzMid = Math.floor(L.nz / 2), gzOf = (g) => +g.split('|')[2], R = L.regionsPerRing;
  let seams = 0, noDeck = 0, asym = 0;
  for (let ax = 0; ax <= 5; ax++) for (let az = 0; az < R; az++) {
    for (const nb of [{ az: az + 1, ax }, { az, ax: ax + 1 }]) {
      const s = ext.seams.get(seamKey({ az, ax }, nb, R)), K = Math.max(1, s ? s.tier : 0);
      const g = gatesFor(L, SEED, GRADE, { az, ax }, nb, AXSPAN, K);
      seams++;
      if (!g.some((p) => gzOf(p.a) === gzMid)) noDeck++;
      const gr = gatesFor(L, SEED, GRADE, nb, { az, ax }, AXSPAN, K);   // reversed args
      if (JSON.stringify(g) !== JSON.stringify(gr)) asym++;
    }
  }
  ok(noDeck === 0, 'EVERY band seam has a deck-level gate — no "no gate toward region" (' + noDeck + '/' + seams + ' missing)');
  ok(asym === 0, 'the deck guarantee stays symmetric across all ' + seams + ' seams (both regions agree)');
  // a genuinely tier-0 seam still gets a walkable deck crossing
  let z = null;
  for (let ax = 0; ax <= 5 && !z; ax++) for (let az = 0; az < R && !z; az++) { const s = ext.seams.get(seamKey({ az, ax }, { az: az + 1, ax }, R)); if (s && s.tier === 0) z = { az, ax }; }
  if (z) { const g = gatesFor(L, SEED, GRADE, z, { az: z.az + 1, ax: z.ax }, AXSPAN, 1); ok(g.some((p) => gzOf(p.a) === gzMid), 'a tier-0 seam is still crossable on the deck (the floor connects the quiet streets)'); }
  else ok(true, '(no tier-0 azimuthal seam in band to probe)');
}

// ── the fine pass: deterministic regional streets that MEET at the seams ──
const sA = solveRegion({ lattice: L, seed: SEED, grade: GRADE, record: ext, az: GA.az, ax: GA.ax, axSpan: AXSPAN, iters: 5 });
const sB = solveRegion({ lattice: L, seed: SEED, grade: GRADE, record: ext, az: GB.az, ax: GB.ax, axSpan: AXSPAN, iters: 5 });
{
  ok(sA.stats.chambers > 2000 && sA.stats.row > 50, 'a region solves to a real city (' + sA.stats.chambers + ' chambers, ' + sA.stats.row + ' row)');
  ok(sA.stats.closure > 0.9 && sA.stats.access > 0 && sA.stats.access <= 1, 'the regional city closes its supply web and measures access');
  ok(sA.stats.gates > 0 && sB.stats.gates > 0, 'both regions resolve active gates from the record');
  // determinism: the same region solved twice is the same streets
  const sA2 = solveRegion({ lattice: L, seed: SEED, grade: GRADE, record: ext, az: GA.az, ax: GA.ax, axSpan: AXSPAN, iters: 5 });
  ok(sA2.stats.row === sA.stats.row && sA2.stats.closure === sA.stats.closure && JSON.stringify(sA2.gates) === JSON.stringify(sA.gates), 'solveRegion is deterministic — regenerate a year later, same streets');

  // ★ SEAM CONTINUITY: on the shared seam, A holds the a-side chamber of each active pair in ITS
  //   right-of-way and B holds the b-side in ITS — solved independently, the roads meet.
  const tier = ext.seams.get(seamKey(GA, GB, 36)).tier;
  const pairs = gatesFor(L, SEED, GRADE, GA, GB, AXSPAN, tier);
  ok(pairs.length > 0, 'the shared seam has active gate pairs (' + pairs.length + ')');
  const holdsOwn = (s, gid) => { const c = s.rf.nodes.find((n) => n.gid === gid); return !!c && s.city.rightOfWay.has(c.idx); };
  let meet = true;
  for (const p of pairs) {
    const aSide = holdsOwn(sA, p.a) || holdsOwn(sA, p.b);   // A owns exactly one side of the pair
    const bSide = holdsOwn(sB, p.a) || holdsOwn(sB, p.b);
    if (!aSide || !bSide) meet = false;
  }
  ok(meet, 'ROADS MEET AT THE SEAM — both regions, solved independently, carry their side of every active gate');
  // the regional row is connected (gates are pathed into the network, not floating)
  const n = sA.rf.nodes.length, adj = Array.from({ length: n }, () => []);
  for (let k = 0; k < sA.rf.mi.length; k++) { adj[sA.rf.mi[k]].push(sA.rf.mj[k]); adj[sA.rf.mj[k]].push(sA.rf.mi[k]); }
  const row = sA.city.rightOfWay; let start = -1; for (const i of row) { start = i; break; }
  const seen = new Set([start]), q = [start];
  while (q.length) { const u = q.pop(); for (const v of adj[u]) if (row.has(v) && !seen.has(v)) { seen.add(v); q.push(v); } }
  ok(seen.size === row.size, 'the regional street network is a single connected component (gates included)');
}

console.log(`record.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
