// cells3d.selftest.mjs — TRUE 3D Voronoi chambers (solid fill, no gaps) + the thread-door graph + wayfinding that
// minimises THREAD doors. Run: node rind/ops/test/cells3d.selftest.mjs

import { buildWeave3D } from '../weave3d.js';
import { buildCells, routeMinDoors, ownerKey } from '../cells3d.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const m = buildWeave3D(3, { rings: 1, spacing: 30, width: 3, flatR: 0.16 });
const C = buildCells(m);

// ══ THE SOLID PANCAKE: 3D Voronoi polyhedra that pack the prism with NO gaps and NO overlap ══
ok(C.cells.length === m.nodes.length, `one 3D chamber per node (${C.cells.length})`);
ok(C.cells.every((c) => c.volume > 0 && c.verts.length >= 4), 'every chamber is a real polyhedron (≥4 vertices, positive volume)');
ok(Math.abs(C.fillRatio - 1) < 1e-3, `★ the chambers FILL the prism solid — Σvolume / prism = ${C.fillRatio.toFixed(5)} (every volumetric slice spoken for)`);
ok(Math.abs(C.filledVolume - C.prismVolume) / C.prismVolume < 1e-3, 'Σ chamber volume == prism volume (no gaps, no double-counting)');

// ── the DOOR graph = true 3D face adjacency: symmetric, connected, HCP-ish, with cross-deck faces ──
ok(C.cells.every((c) => [...c.adj].every((j) => C.cells[j].adj.has(c.gi))), 'door adjacency (shared faces) is symmetric');
const seen = new Set([0]), q = [0]; for (let h = 0; h < q.length; h++) for (const nb of C.cells[q[h]].adj) if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
ok(seen.size === C.cells.length, 'the chamber graph is one connected solid (everything reachable)');
const deg = C.cells.map((c) => c.adj.size), avg = deg.reduce((a, b) => a + b, 0) / deg.length;
ok(avg > 8 && avg < 15, `coordination is HCP-ish (avg ${avg.toFixed(1)} shared-face doors per chamber)`);
ok(C.cells.some((c) => [...c.adj].some((j) => C.cells[j].layer !== c.layer)), 'chambers share faces ACROSS decks (the decks interlock — not four painted planes)');

// ── owners partition the cells (each toggle is a clean group) ──
const tally = {}; for (const c of C.cells) tally[c.ownerKey] = (tally[c.ownerKey] || 0) + 1;
const nodeTally = {}; for (const n of m.nodes) { const k = ownerKey(n.nearest); nodeTally[k] = (nodeTally[k] || 0) + 1; }
ok(JSON.stringify(tally) === JSON.stringify(nodeTally), 'chamber owners == weave assignment (toggles partition the cells)');

// ══ WAYFINDING: a door = crossing into a DIFFERENT thread; staying within one thread is free ══
// a step between two FACE-ADJACENT chambers of the same thread costs 0 doors (a corridor step crosses no door)
let adjSame = null; for (const c of C.cells) { for (const j of c.adj) if (C.cells[j].ownerKey === c.ownerKey && c.ownerKey !== 'matrix') { adjSame = [c.gi, j]; break; } if (adjSame) break; }
ok(adjSame && routeMinDoors(C, adjSame[0], adjSame[1]).doors === 0, 'an adjacent same-thread step crosses 0 doors (corridor is free)');
// a route is valid: consecutive chambers are face-adjacent, and doors == owner-changes along it
const left = C.cells.reduce((b, c) => (c.x < b.x ? c : b)), right = C.cells.reduce((b, c) => (c.x > b.x ? c : b));
const r = routeMinDoors(C, left.gi, right.gi);
ok(r && r.path[0] === left.gi && r.path[r.path.length - 1] === right.gi, 'a route connects two chambers across the disc');
ok(r.path.every((g, i) => i === 0 || C.cells[r.path[i - 1]].adj.has(g)), 'every step passes through a real shared-face door');
let changes = 0; for (let i = 1; i < r.path.length; i++) if (C.cells[r.path[i]].ownerKey !== C.cells[r.path[i - 1]].ownerKey) changes++;
ok(r.doors === changes, `reported doors == thread changes along the path (${r.doors})`);
ok(r.doors <= 2, `★ across the whole disc costs ≤ 2 thread-doors (got ${r.doors}) — the weave's single-door reach`);
ok(routeMinDoors(C, left.gi, left.gi).doors === 0, 'a chamber to itself crosses 0 doors');

// the architecture claim, measured: anywhere → anywhere is ≈ one door
let sum = 0, n = 0, mx = 0; for (let i = 0; i < 150; i++) { const A = C.cells[(i * 7) % C.cells.length].gi, B = C.cells[(i * 13 + 5) % C.cells.length].gi; const rr = routeMinDoors(C, A, B); if (rr) { sum += rr.doors; n++; mx = Math.max(mx, rr.doors); } }
ok(sum / n < 2 && mx <= 4, `anywhere→anywhere ≈ one door (avg ${(sum / n).toFixed(2)}, max ${mx} over ${n} pairs)`);

// ── deterministic ──
const C2 = buildCells(buildWeave3D(3, { rings: 1, spacing: 30, width: 3, flatR: 0.16 }));
ok(Math.abs(C2.fillRatio - C.fillRatio) < 1e-9 && routeMinDoors(C2, left.gi, right.gi).doors === r.doors, 'deterministic chambers + route');

console.log(`cells3d.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
