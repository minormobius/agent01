// prism.selftest.mjs — certify THE SUBSTRATE: a hexagonal prism of homogeneously spaced (HCP) nodes, thick
// enough that NO Voronoi cell touching the ceiling also touches the floor. Run: node rind/ops/test/prism.selftest.mjs

import { buildPrism, floorCeilingReport, minLayersForSeparation, PRISM_DEFAULTS, hexFootprint } from '../prism.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const p = buildPrism(1);
const a = p.spacing;

// ── it is a HEXAGONAL PRISM ──
ok(p.footprint.length === 6, 'the footprint is a hexagon');
ok(p.nodes.every((n) => p.inHex(n.x, n.y, a * 0.6)), 'every node is inside the hexagonal footprint');
ok(p.nodes.every((n) => n.z > 0 && n.z < p.thickness), 'every node is strictly between floor (z=0) and ceiling (z=T)');
ok(Math.abs(p.vpitch - a * Math.sqrt(2 / 3)) < 1e-9 && Math.abs(p.thickness - p.layers * p.vpitch) < 1e-9, 'thickness = layers × HCP pitch (c = a·√(2/3))');
ok(p.nodes.length > 300, `the prism is filled (${p.nodes.length} nodes over ${p.layers} layers)`);

// ── HOMOGENEOUS spacing: nearest-neighbour distances cluster tightly around a, with a respected minimum ──
const nn = p.nodes.map((n) => { let bd = Infinity; for (const m of p.nodes) { if (m.i === n.i) continue; const d = Math.hypot(n.x - m.x, n.y - m.y, n.z - m.z); if (d < bd) bd = d; } return bd; });
const mean = nn.reduce((s, x) => s + x, 0) / nn.length, cov = Math.sqrt(nn.reduce((s, x) => s + (x - mean) ** 2, 0) / nn.length) / mean;
ok(cov < 0.15, `spacing is homogeneous (nearest-neighbour CoV ${(cov * 100).toFixed(1)}% < 15%)`);
ok(Math.min(...nn) > a * 0.5, `no two nodes collapse together (min NN ${Math.min(...nn).toFixed(0)} > a/2)`);
ok(Math.max(...nn) < a * 1.25, `no node is isolated (max NN ${Math.max(...nn).toFixed(0)} < 1.25a)`);

// ══ THE REQUIREMENT: no Voronoi polyhedron touching the CEILING also touches the FLOOR ══
const r = floorCeilingReport(p);
ok(r.separated && r.both.length === 0, `★ ceiling cells and floor cells are DISJOINT — no cell spans the prism (ceiling ${r.ceilingCells} ∩ floor ${r.floorCells} = ∅)`);
ok(r.maxSpan < p.thickness, `★ the worst single cell spans ${(r.maxSpan / p.thickness * 100).toFixed(0)}% of the thickness — strictly less than the whole (a real top + bottom)`);
ok(r.maxSpan < 0.75 * p.thickness, `the default has margin: worst span ${(r.maxSpan / p.thickness * 100).toFixed(0)}% < 75% of T`);

// holds across the whole seedable family (plane check only — fast)
let robust = true; for (const s of [1, 2, 3, 7, 11, 15, 22, 42]) if (!floorCeilingReport(buildPrism(s), { span: false }).separated) robust = false;
ok(robust, 'separation holds across the seed family (8 seeds) at the default thickness');

// ── the threshold is REAL, not assumed: too thin FAILS, and the proven minimum is reported ──
const thin = floorCeilingReport(buildPrism(1, { layers: 1 }), { span: false });
ok(!thin.separated, 'a 1-layer prism FAILS the requirement (its cells touch both faces) — the test discriminates');
const minL = minLayersForSeparation(1);
ok(minL >= 2 && minL <= p.layers, `the proven minimum thickness is ${minL} layers (default ${p.layers} ≥ it)`);

// ── deterministic ──
ok(JSON.stringify(buildPrism(9).nodes) === JSON.stringify(buildPrism(9).nodes), 'deterministic per seed');
ok(buildPrism(1).nodes.length !== buildPrism(1, { hexR: 200 }).nodes.length, 'a smaller footprint holds fewer nodes (the cell scales)');
ok(hexFootprint(PRISM_DEFAULTS.hexR).length === 6, 'hexFootprint export is a hexagon');

console.log(`prism.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
