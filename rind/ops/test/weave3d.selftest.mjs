// weave3d.selftest.mjs — the weave laid on the prism, and WHERE IT BREAKS. The math is not softened: thin tubes
// drop crossings (K<48), fat tubes exceed the thickness (white/production merge) and contest everything, sparse
// nuclei lose the nodes that register crossings. Run: node rind/ops/test/weave3d.selftest.mjs

import { buildWeave3D, chunkCount } from '../weave3d.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };
const M = (opts) => buildWeave3D(3, opts).metrics;

// ── a well-chosen config is CLEAN: every white crosses every production, no thread lost, tube inside thickness ──
const good = M({ rings: 1, spacing: 30, width: 3 });
ok(good.clean && good.breaks.length === 0, 'a tuned weave (7 chunks, spacing 30, width 3) is intact — no breaks');
ok(good.k68 && good.contacts === 48, `K(6,8) complete: ${good.k68Pairs}`);
ok(good.deadThreads === 0, 'every one of the 14 threads claims nodes');
ok(good.tubeVsThickness <= 1, 'the tube fits inside the prism thickness');
ok(good.orphanPct > 0, `the interstitial matrix is real and reported (${(good.orphanPct * 100) | 0}% un-claimed) — NOT counted as a break`);

// ── WIDTH, thin end: tubes too narrow ⇒ crossings have no nodes ⇒ K(6,8) drops. This is a real break. ──
ok(!M({ rings: 1, spacing: 30, width: 1 }).k68, 'width 1 ⇒ K(6,8) incomplete (crossings miss) — a break, not rounded up');
ok(M({ width: 1, rings: 1, spacing: 30 }).contacts < M({ width: 2, rings: 1, spacing: 30 }).contacts, 'narrower tubes register strictly fewer crossings');

// ── WIDTH, fat end: 2·radius > thickness ⇒ white & production merge; everything becomes contested. ──
const wide = M({ rings: 1, spacing: 30, width: 12 });
ok(wide.tubeVsThickness > 1 && wide.breaks.some((b) => /thickness/.test(b)), 'width 12 ⇒ tube exceeds thickness (white/production merge) — flagged');
ok(wide.contestedPct > 0.5 && wide.breaks.some((b) => /contested/.test(b)), 'width 12 ⇒ majority of nodes contested (threads dissolve) — flagged');
ok(M({ width: 5, rings: 1, spacing: 30 }).contestedPct > M({ width: 3, rings: 1, spacing: 30 }).contestedPct, 'wider tubes contest monotonically more');

// ── DENSITY: too sparse ⇒ crossings lose the nodes that register them ⇒ K(6,8) drops. ──
ok(M({ rings: 1, spacing: 30, width: 3 }).k68 && !M({ rings: 1, spacing: 110, width: 3 }).k68, 'thinning the nuclei (spacing 110) breaks K(6,8) — the crossings have no nodes left');
ok(buildWeave3D(3, { spacing: 12 }).nodes.length > buildWeave3D(3, { spacing: 30 }).nodes.length, 'denser nuclei ⇒ more nodes (the density lever moves node count)');

// ── CHUNKS: rings 0/1/2 ⇒ 1/7/19 chunks; a tuned weave keeps K(6,8) at every chunk count ──
ok([0, 1, 2].map(chunkCount).join(',') === '1,7,19', 'chunk lever = 1 / 7 / 19 (centered-hexagonal)');
for (const rings of [0, 1, 2]) { const w = buildWeave3D(3, { rings, spacing: 30, width: 3 }); ok(w.chunkCount === chunkCount(rings), `rings ${rings} ⇒ ${chunkCount(rings)} chunks`); ok(w.metrics.contacts === 48, `rings ${rings}: K(6,8) complete at width 3`); }
ok(buildWeave3D(3, { rings: 2 }).hexR > buildWeave3D(3, { rings: 0 }).hexR, 'more chunks ⇒ a bigger footprint (the cell grows)');

// ── the prism guarantee survives: the substrate is still the separated hex prism ──
ok(good && buildWeave3D(3, { rings: 1, spacing: 30, width: 3 }).prism.layers === 4, 'built on the 4-layer prism substrate');

// ── deterministic ──
ok(JSON.stringify(M({ rings: 1, spacing: 30, width: 3 })) === JSON.stringify(M({ rings: 1, spacing: 30, width: 3 })), 'deterministic per seed+levers');

console.log(`weave3d.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
