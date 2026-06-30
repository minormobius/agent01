// cells3d.selftest.mjs — Voronoi chambers over the prism weave + the door graph + door-minimising wayfinding.
// Run: node rind/ops/test/cells3d.selftest.mjs

import { buildWeave3D } from '../weave3d.js';
import { buildCells, routeMinDoors, ownerKey } from '../cells3d.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const m = buildWeave3D(3, { rings: 1, spacing: 30, width: 3, flatR: 0.16 });
const C = buildCells(m);

// ── one chamber per node, every chamber a real polygon clipped to the hex ──
ok(C.cells.length === m.nodes.length, `one Voronoi chamber per node (${C.cells.length})`);
ok(C.cells.every((c) => c.poly.length >= 3 && c.area > 0), 'every chamber is a non-degenerate polygon');
ok(C.cells.every((c) => c.layer >= 0 && c.layer < C.layers), 'every chamber sits on one of the 4 decks (none spans)');

// ── the door graph: symmetric, connected, ~HCP coordination, with both in-layer AND cross-layer doors ──
ok(C.cells.every((c) => [...c.adj].every((j) => C.cells[j].adj.has(c.gi))), 'door adjacency is symmetric');
const seen = new Set([0]), q = [0]; for (let h = 0; h < q.length; h++) for (const nb of C.cells[q[h]].adj) if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
ok(seen.size === C.cells.length, 'the chamber graph is one connected component (everything is reachable)');
const deg = C.cells.map((c) => c.adj.size), avg = deg.reduce((a, b) => a + b, 0) / deg.length;
ok(avg > 7 && avg < 15, `coordination is HCP-ish (avg ${avg.toFixed(1)} doors per chamber)`);
ok(C.cells.some((c) => [...c.adj].some((j) => C.cells[j].layer !== c.layer)), 'cross-deck doors exist (you can change layer)');
ok(C.cells.some((c) => [...c.adj].some((j) => C.cells[j].layer === c.layer)), 'in-layer doors exist (shared walls)');

// ── chamber owners match the weave assignment exactly (each toggle group is well-defined) ──
const tally = {}; for (const c of C.cells) tally[c.ownerKey] = (tally[c.ownerKey] || 0) + 1;
const nodeTally = {}; for (const n of m.nodes) { const k = ownerKey(n.nearest); nodeTally[k] = (nodeTally[k] || 0) + 1; }
ok(JSON.stringify(tally) === JSON.stringify(nodeTally), 'chamber owners == weave assignment (the 14 toggles + matrix partition the cells)');
ok(Object.keys(tally).filter((k) => k.startsWith('w')).length === 6 && Object.keys(tally).filter((k) => k.startsWith('p')).length === 8, 'all 6 white + 8 production threads own chambers (none invisible)');

// ── WAYFINDING that minimises door crossings ──
const left = C.cells.reduce((b, c) => (c.x < b.x ? c : b)), right = C.cells.reduce((b, c) => (c.x > b.x ? c : b));
const r = routeMinDoors(C, left.gi, right.gi);
ok(r && r.path[0] === left.gi && r.path[r.path.length - 1] === right.gi, 'a route connects two chambers across the disc');
ok(r.doors === r.path.length - 1, 'doors crossed == chambers entered − 1');
ok(r.path.every((g, i) => i === 0 || C.cells[r.path[i - 1]].adj.has(g)), 'every step of the route passes through a real door');
// it is MINIMAL: independent BFS distance from `left` equals the route length (no shorter path exists)
const dist = new Map([[left.gi, 0]]), qq = [left.gi]; for (let h = 0; h < qq.length; h++) for (const nb of C.cells[qq[h]].adj) if (!dist.has(nb)) { dist.set(nb, dist.get(qq[h]) + 1); qq.push(nb); }
ok(dist.get(right.gi) === r.doors, `the route is door-MINIMAL (${r.doors} doors = graph distance)`);
ok(routeMinDoors(C, left.gi, left.gi).doors === 0, 'a chamber to itself crosses 0 doors');
const nb0 = [...C.cells[left.gi].adj][0];
ok(routeMinDoors(C, left.gi, nb0).doors === 1, 'adjacent chambers are 1 door apart');
ok(r.doors >= Math.abs(C.cells[left.gi].layer - C.cells[right.gi].layer), 'at least as many doors as the deck difference (lower bound holds)');

// ── deterministic ──
const C2 = buildCells(buildWeave3D(3, { rings: 1, spacing: 30, width: 3, flatR: 0.16 }));
ok(C2.cells.length === C.cells.length && routeMinDoors(C2, left.gi, right.gi).doors === r.doors, 'deterministic chambers + route');

console.log(`cells3d.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
