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

// ── AREAL DENSITY at PINNED THICKNESS: the spacing lever changes node count, NOT the prism height. ──
ok(buildWeave3D(3, { spacing: 14 }).thickness === buildWeave3D(3, { spacing: 80 }).thickness, 'thickness is PINNED — the areal-density lever does not change the prism height');
ok(buildWeave3D(3, { spacing: 14 }).nodes.length > 4 * buildWeave3D(3, { spacing: 80 }).nodes.length, 'denser areal spacing ⇒ many more nodes (areal density, at constant height)');
ok(buildWeave3D(3, { spacing: 14 }).prism.layers === 4 && buildWeave3D(3, { spacing: 80 }).prism.layers === 4, 'always 4 layers high, dense or sparse');
// sparse breaks NOT by losing nodes but because a fixed-width path becomes absolutely wider than the pinned
// thickness ⇒ white & production merge. The math is not softened to hide that.
ok(M({ spacing: 30, width: 3 }).clean && M({ spacing: 80, width: 3 }).breaks.some((b) => /thickness/.test(b)), 'sparse areal (a=80) ⇒ the 3-wide tube exceeds the pinned thickness — white/production merge (flagged)');

// ── CHUNKS: rings 0/1/2 ⇒ 1/7/19 chunks. The cell must be big enough: 1 chunk is too cramped for a width-3 weave
//    (threads dissolve), 7 and 19 hold. Reported honestly, not rounded up. ──
ok([0, 1, 2].map(chunkCount).join(',') === '1,7,19', 'chunk lever = 1 / 7 / 19 (centered-hexagonal)');
for (const rings of [0, 1, 2]) ok(buildWeave3D(3, { rings }).chunkCount === chunkCount(rings), `rings ${rings} ⇒ ${chunkCount(rings)} chunks`);
ok(!M({ rings: 0, spacing: 30, width: 3 }).clean && M({ rings: 0, spacing: 30, width: 3 }).contestedPct > 0.4, '1 chunk is too cramped for a width-3 weave — threads dissolve (not hidden)');
ok(M({ rings: 1, spacing: 30, width: 3 }).clean && M({ rings: 2, spacing: 30, width: 3 }).clean, '7 and 19 chunks hold a clean width-3 weave');
ok(buildWeave3D(3, { rings: 2 }).hexR > buildWeave3D(3, { rings: 0 }).hexR, 'more chunks ⇒ a bigger footprint (the cell grows)');

// ── THE FLAT CORE: inside flatR the offices are radial sectors (no weave) — never contested — and a bigger core
//    pushes the weave outward, lowering the central tangle. This kills the centre hairball. ──
const fcore = buildWeave3D(3, { rings: 1, spacing: 30, width: 3, flatR: 0.3 });
ok(fcore.nodes.some((n) => n.flat) && fcore.nodes.filter((n) => n.flat).every((n) => !n.contested), 'every node inside the flat core is a single clean sector — never contested');
ok(M({ flatR: 0.3 }).contestedPct < M({ flatR: 0 }).contestedPct, 'a larger flat core lowers the contested fraction (de-hairballs the centre)');
ok(M({ flatR: 0 }).k68 && M({ flatR: 0.3 }).k68, 'all 48 crossings still happen — they are pushed into the annulus, not lost');

// ── the prism guarantee survives: still the separated 4-layer hex prism ──
ok(good && buildWeave3D(3, { rings: 1, spacing: 30, width: 3 }).prism.layers === 4, 'built on the 4-layer prism substrate');

// ── deterministic ──
ok(JSON.stringify(M({ rings: 1, spacing: 30, width: 3 })) === JSON.stringify(M({ rings: 1, spacing: 30, width: 3 })), 'deterministic per seed+levers');

console.log(`weave3d.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
