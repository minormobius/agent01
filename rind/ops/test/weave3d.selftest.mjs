// weave3d.selftest.mjs — the weave laid CONTINUOUSLY on the prism. The headline invariant: every thread is ONE
// connected corridor (continuity by construction), across all seeds/widths. K(6,8) is best-effort (a repair pass
// closes most crossings without ever fragmenting a thread — continuity wins the tie). Run: node …/weave3d.selftest.mjs

import { buildWeave3D, buildGeometry, chunkCount, WEAVE_DEFAULTS } from '../weave3d.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };
const M = (opts) => buildWeave3D(3, opts).metrics;

// ══ CONTINUITY BY CONSTRUCTION — the whole point of this rebuild ══
const seeds = [1, 2, 3, 7, 11, 15, 22, 42];
let allCont = true, anyDead = false; for (const s of seeds) { const mm = buildWeave3D(s, { rings: 1, spacing: 30, width: 10, flatR: 0.16 }).metrics; if (!mm.continuous) allCont = false; if (mm.deadThreads) anyDead = true; }
ok(allCont, '★ every thread is ONE connected corridor across all 8 seeds (continuity guaranteed)');
ok(!anyDead, 'no dead threads across the seed family');
let allW = true; for (const w of [3, 6, 10, 16, 24]) if (!M({ width: w }).continuous) allW = false;
ok(allW, '★ continuity holds at every width (thin corridors and fat ones alike)');
const g3 = M({ width: 3 });
ok(g3.continuous && g3.discontinuous === 0 && g3.worstComponents === 1, 'each thread is exactly 1 component (worstComponents == 1)');

// ══ the foam is SOLID (true 3D Voronoi packs the prism) ══
const full = buildWeave3D(3, { rings: 1, spacing: 30, width: 10, flatR: 0.16 });
ok(Math.abs(full.cellsModel.fillRatio - 1) < 1e-3, `the chambers fill the prism solid (Σvol/prism = ${full.cellsModel.fillRatio.toFixed(4)})`);

// ══ WAYFINDING: the single-door reach — anywhere → anywhere ≈ one thread-door ══
ok(full.metrics.avgDoors < 1.5 && full.metrics.maxDoors <= 4, `anywhere→anywhere ≈ one door (avg ${full.metrics.avgDoors.toFixed(2)}, max ${full.metrics.maxDoors})`);

// ══ K(6,8): best-effort repair — most/all crossings realised, NEVER at the cost of continuity ══
let kSum = 0; for (const s of seeds) { const mm = buildWeave3D(s, { rings: 1, spacing: 30, width: 10, flatR: 0.16 }).metrics; kSum += mm.contacts; }
ok(kSum / seeds.length >= 44, `K(6,8) mostly complete after repair (avg ${(kSum / seeds.length).toFixed(1)}/48 over ${seeds.length} seeds)`);
ok(seeds.some((s) => buildWeave3D(s, { rings: 1, spacing: 30, width: 10, flatR: 0.16 }).metrics.k68), 'some seeds reach the full K(6,8) = 48/48');
ok(full.metrics.contacts >= 42, `this build realises ${full.metrics.k68Pairs} of the crossings`);

// ══ WIDTH lever: too thin ⇒ corridors leave matrix (and may miss crossings); wide ⇒ fills solid ══
ok(M({ width: 3 }).matrixPct > M({ width: 12 }).matrixPct, 'thinner corridors leave more interstitial matrix');
ok(M({ width: 12 }).matrixPct < 0.02, 'a wide weave fills essentially solid (matrix → 0)');

// ══ AREAL DENSITY at PINNED THICKNESS ══
ok(buildWeave3D(3, { spacing: 14 }).thickness === buildWeave3D(3, { spacing: 80 }).thickness, 'thickness is pinned — areal density does not change the prism height');
ok(buildWeave3D(3, { spacing: 14 }).nodes.length > 4 * buildWeave3D(3, { spacing: 80 }).nodes.length, 'denser areal spacing ⇒ many more chambers, same height');

// ══ FLAT CORE + CHUNKS ══
ok(buildWeave3D(3, { flatR: 0.3 }).nodes.some((n) => n.flat) && buildWeave3D(3, { flatR: 0 }).nodes.every((n) => !n.flat), 'the flat-core radius marks the central sectors');
ok([0, 1, 2].map(chunkCount).join(',') === '1,7,19', 'chunk lever = 1 / 7 / 19 (centered-hexagonal)');
for (const rings of [0, 1, 2]) ok(buildGeometry(3, { rings }).chunkCount === chunkCount(rings), `rings ${rings} ⇒ ${chunkCount(rings)} chunks`);
ok(buildWeave3D(3, { rings: 2 }).nodes.length > buildWeave3D(3, { rings: 0 }).nodes.length, 'a bigger cell holds more chambers');

// ══ determinism + API shape ══
ok(buildWeave3D(9).metrics.continuous === buildWeave3D(9).metrics.continuous && buildWeave3D(9).nodes.length === buildWeave3D(9).nodes.length, 'deterministic per seed');
ok(full.warps.length === 6 && full.wefts.length === 8 && full.NW === 6 && full.NF === 8, '6 white + 8 production threads');
ok(WEAVE_DEFAULTS.width >= 1, 'defaults present');

console.log(`weave3d.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
