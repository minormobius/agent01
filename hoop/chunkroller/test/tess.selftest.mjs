// tess.selftest.mjs — the tessellation kernel: deformed edges that STILL tile by translation.
//   node hoop/chunkroller/test/tess.selftest.mjs
import { hexVerts, latticeT, defaultEdges, buildShape, neighbourOffsets, area, tessellationGap, exportShape } from '../tessgen.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

const R = 180;

// ── base hex ──
const V = hexVerts(R);
ok(V.length === 6, 'six hex vertices');
ok(Math.abs(V[3][0] + V[0][0]) < 1e-9 && Math.abs(V[3][1] + V[0][1]) < 1e-9, 'opposite vertices are centrally symmetric (V_{k+3} = −V_k)');

// ── straight (default) shape tessellates exactly ──
const flat = buildShape(R, defaultEdges());
ok(flat.boundary.length === 6 * (flat.edges[0].length - 1), 'boundary stitches all six edges (each contributes its points but the shared last)');
ok(Math.abs(tessellationGap(flat)) < 1e-9, 'straight hexagon: zero tessellation gap');
ok(area(flat.boundary) > 0, 'straight hexagon has positive area');
ok(neighbourOffsets(flat).length === 6, 'six neighbour translations');

// ── DEFORMED edges still tessellate (the whole point) ──
const edges = defaultEdges(3);
// shove the three editable edges into weird shapes
edges[0].controls = [[10, 22], [-18, 14], [6, -20]];
edges[1].controls = [[24, -8], [-12, -26], [16, 10]];
edges[2].controls = [[-20, 16], [8, 28], [-14, -12]];
const wild = buildShape(R, edges);
ok(tessellationGap(wild) < 1e-9, 'deformed hexagon STILL tessellates (zero gap) — edges 3-5 follow 0-2');
ok(area(wild.boundary) > 0, 'deformed tile keeps positive area');
// the deformed boundary is genuinely not the straight hexagon
let moved = 0; for (const p of wild.boundary) if (!flat.boundary.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.5)) moved++;
ok(moved >= 6, 'the deformed boundary really departs from the straight one (no more perfect edges)');

// the tessellation guarantee, spelled out: tile + T_k abuts the original with no gap and no overlap of the seam
for (let k = 0; k < 3; k++) {
  const T = wild.lattice[k];
  const ek = wild.edges[k], neighborEk3 = wild.edges[k + 3].map((p) => [p[0] + T[0], p[1] + T[1]]).reverse();
  let g = 0; for (let i = 0; i < ek.length; i++) g = Math.max(g, Math.hypot(ek[i][0] - neighborEk3[i][0], ek[i][1] - neighborEk3[i][1]));
  ok(g < 1e-9, `edge ${k} matches neighbour's edge ${k + 3} translated by T_${k} (seam closes)`);
}

// ── more control points still works ──
const fine = defaultEdges(5);
fine[0].controls = fine[0].controls.map((_, j) => [Math.sin(j) * 20, Math.cos(j) * 18]);
ok(tessellationGap(buildShape(R, fine)) < 1e-9, '5 control points/edge: still tessellates');

// ── sideOf maps every boundary segment to one of the 6 directions (ports-per-direction) ──
ok(wild.sideOf.length === wild.boundary.length, 'sideOf has one entry per boundary segment');
ok(new Set(wild.sideOf).size === 6, 'boundary segments group into exactly 6 sides (directions)');
ok(wild.sideOf.every((s) => s >= 0 && s < 6), 'every side index is 0..5');
const counts = {}; for (const s of wild.sideOf) counts[s] = (counts[s] || 0) + 1;
ok(Object.values(counts).every((c) => c === wild.boundary.length / 6), 'each side owns an equal run of segments');

// ── export is JSON-adjacent + round-trips ──
const ex = exportShape(R, edges, 12345);
ok(ex.type === 'hoop.chunkshape.tessellation' && ex.tiling === 'translation' && ex.version === 1, 'export carries the shape type/tiling/version');
ok(Array.isArray(ex.boundary) && ex.boundary.length > 6 && ex.lattice.length === 3, 'export carries the boundary polyline + lattice');
ok(JSON.parse(JSON.stringify(ex)).edges.length === 3, 'export is plain JSON (serializes)');
// re-loading the exported edges rebuilds the same tessellating shape
const reloaded = buildShape(ex.R, ex.edges);
ok(tessellationGap(reloaded) < 1e-9, 're-loaded export still tessellates');

console.log(`tess.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
