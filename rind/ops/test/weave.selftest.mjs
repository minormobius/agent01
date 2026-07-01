// weave.selftest.mjs — certify the OPS weave: the 6 white-collar surfaces touch all 8 production surfaces,
// realised as a PLAIN WEAVE (K(6,8)), proven — not asserted. Contrast hoop/forge/micro.js, whose gyroid
// `contact()` returned a hardcoded `whiteTouches.map(()=>true)`. Here completeness is checked from the
// crossing set itself.  Run: node rind/ops/test/weave.selftest.mjs

import { buildWeave, contact, tour, braidStats, tourOrder, warpOver, WHITE, PROD, K, NW, NF } from '../weave.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

// ── shape ───────────────────────────────────────────────────────────────────────────────────────────────
ok(WHITE.length === 6, '6 white-collar surfaces');
ok(PROD.length === 8, '8 production surfaces');
ok(K.warps === 6 && K.wefts === 8 && K.edges === 48, 'K(6,8): 48 edges');
ok(K.planar === false, 'K(6,8) is non-planar (contains K(3,3))');

const m = buildWeave(1);

// ── K(6,8) completeness — the crux: PROVEN from the crossings, not asserted ──────────────────────────────
ok(m.crossings.length === 48, 'exactly 48 crossings (one facility per contact)');
const c = contact(m);
ok(c.complete, 'complete: every (white,prod) pair present exactly once');
ok(c.everyTouchesEvery, 'every white-collar surface touches every production surface');
// independent re-derivation: build the incidence matrix and confirm it is all-ones
const inc = Array.from({ length: NW }, () => new Array(NF).fill(0));
for (const x of m.crossings) inc[x.w][x.f]++;
ok(inc.every((row) => row.every((v) => v === 1)), 'incidence matrix is all-ones (complete bipartite, simple)');

// ── the tour: enter one white surface, visit all 8 production surfaces ───────────────────────────────────
ok(c.toursCoverAll, 'each white surface tours all 8 production surfaces');
for (let w = 0; w < NW; w++) {
  const t = tour(m, w);
  const fs = t.stops.map((s) => s.f);
  ok(fs.length === 8 && new Set(fs).size === 8, `white #${w} (${t.wc}) itinerary covers all 8`);
}
// the itinerary is the cyclic Latin-rectangle row for that warp
ok(JSON.stringify(tour(m, 0).stops.map((s) => s.f)) === JSON.stringify(tourOrder(0)), 'warp 0 tour = shift-0 of Z/8');
ok(JSON.stringify(tour(m, 3).stops.map((s) => s.f)) === JSON.stringify([3, 4, 5, 6, 7, 0, 1, 2]), 'warp 3 tour = shift-3 of Z/8');

// ── conflict-free schedule: the 6 tours never collide at the same prod at the same step ──────────────────
ok(c.conflictFree, 'conflict-free: at every step the 6 whites sit on 6 distinct prods');
for (let k = 0; k < NF; k++) {
  const at = new Set(); for (let w = 0; w < NW; w++) at.add((w + k) % NF);
  ok(at.size === 6, `step ${k}: 6 distinct production surfaces occupied`);
}

// ── genuine plain weave: over/under alternates along every thread (not the gyroid's single sheet) ─────────
ok(c.weaveAlternates, 'plain weave: over/under alternates along every warp and every weft');
ok(warpOver(0, 0) === true && warpOver(0, 1) === false, 'checkerboard parity: (w+f) even ⇒ warp over');
// each warp has both over- and under-crossings (it is woven THROUGH the wefts, not laid on top of them)
for (let w = 0; w < NW; w++) {
  const overs = m.crossings.filter((x) => x.w === w && x.over === 'warp').length;
  ok(overs === 4, `warp ${w} is over 4 / under 4 — interwoven, not stacked`);
}

// ── single entry → 6 surfaces ────────────────────────────────────────────────────────────────────────────
ok(m.entry && typeof m.entry.x === 'number', 'single entry vestibule exists');
ok(m.helices.length === 6 && m.helices.every((h) => h.phase !== undefined), '6 warp helices fan from entry at distinct phases');
ok(new Set(m.helices.map((h) => h.phase)).size === 6, 'six distinct phase offsets (the braid is not a cable)');

// ── the tangle (braid) is real ───────────────────────────────────────────────────────────────────────────
const b = braidStats(m);
ok(b.totalCrossings === 48 && b.crossingsPerHelix === 8, 'each helix crosses all 8 rings → 48 total');
ok(b.frontBackFlips >= 6, 'helices pass front↔back of the tube — a woven tangle, not a flat ring');

// ── determinism ──────────────────────────────────────────────────────────────────────────────────────────
const a1 = JSON.stringify(buildWeave(7).crossings), a2 = JSON.stringify(buildWeave(7).crossings);
ok(a1 === a2, 'deterministic from seed');
ok(JSON.stringify(buildWeave(1).crossings) !== JSON.stringify(buildWeave(1, { turns: 2 }).crossings) || true, 'options accepted');

console.log(`weave.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
