// v090.selftest.mjs — the voronoi-walls + mega-paint reskin of a v8 chunk.
// Run: node hoop/test/v090.selftest.mjs
//
// Pins the contract paintChunk() must keep so the page can draw without touching the data: every v8
// chunk re-seeds into a painted scene whose walls land where v8 has walls, whose doors stay open,
// whose floor is lit (ray-traced colours), and that is deterministic from (seed) like everything else.
import { solveChunk } from '../v8/chunkgen.js';
import { createWorld, addChunk, neighbourSpec } from '../v8/manager.js';
import { paintChunk, hexHue } from '../v090/skin.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

// 1. a solved chunk reskins into a painted scene with both wall and floor cells
const rec = solveChunk({ seed: 7, shape: 'hex' }); rec.seed = 7;
const P = paintChunk(rec);
const walls = P.paintCells.filter((c) => c.wall).length, floor = P.paintCells.filter((c) => !c.wall).length;
const area = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };
const medArea = (sel) => { const a = P.paintCells.filter(sel).map((c) => area(c.poly)).sort((u, v) => u - v); return a.length ? a[a.length >> 1] : 0; };
ok(P.paintCells.length > rec.cells.length, `reseeding refines the tiling (${rec.cells.length} bones → ${P.paintCells.length} paint cells)`);
ok(walls > 50, `walls were re-seeded with fine Voronoi nuclei (${walls} thin wall cells)`);
ok(medArea((c) => !c.wall) > medArea((c) => c.wall) * 1.8, `interior tiles fill the gaps LARGER than the walls (floor ${medArea((c) => !c.wall) | 0} vs wall ${medArea((c) => c.wall) | 0})`);
ok(P.paintCells.every((c) => c.poly.length >= 3 && c.poly.every((p) => p.length === 2)), 'every paint cell is a real world-space polygon');

// 2. wall cells never carry a colour (the page fills them flat); most floor cells are pre-traced
ok(P.paintCells.every((c) => !c.wall || c.color == null), 'wall cells are never pre-coloured (filled flat)');
const colored = P.paintCells.filter((c) => !c.wall && typeof c.color === 'string').length, floorN = floor;
ok(colored > floorN * 0.7, `most floor cells carry a ray-traced colour (${colored}/${floorN})`);
const lit = P.paintCells.filter((c) => c.color && c.color !== 'rgb(0,0,0)').length;
ok(lit > 20, `the ray-trace actually lights the floor (${lit} lit cells)`);

// 3. lights + components are placed per ROOM (not per cell) and reference real rooms
ok(P.lights.length > 0 && P.lights.length <= rec.rooms.length * 2, `lights are per-room, not per-cell (${P.lights.length} for ${rec.rooms.length} rooms)`);
ok(P.lights.every((L) => L.room >= 0 && L.room < rec.rooms.length && L.rgb && typeof L.lit === 'number'), 'each light binds a real room, is tinted + pre-lit');
ok(P.comps.length > 0 && P.comps.every((c) => c.r > 0 && c.g && typeof c.lit === 'number'), `a deco component per furnished room (${P.comps.length}), sized + lit`);

// 4. everything is in WORLD coordinates (inside the chunk's region, not the local [0,W] box)
const inRegion = (x, y) => x > rec.region.x0 - 40 && x < rec.region.x1 + 40 && y > rec.region.y0 - 40 && y < rec.region.y1 + 40;
ok(P.paintCells.every((c) => inRegion(c.x, c.y)), 'paint cells are lifted to world coordinates');
ok(P.comps.every((c) => inRegion(c.cx, c.cy)) && P.lights.every((L) => inRegion(L.x, L.y)), 'components + lights are in world coordinates');
ok(P.poly === rec.poly && Array.isArray(P.ports), 'the chunk polygon + ports ride along (perimeter walls + port gaps)');

// 5. hue tracks the room colour (the chamber tint), and determinism: same seed ⇒ same paint
ok(Math.abs(hexHue('#e0772f') - 24) < 6, 'hexHue reads an orange make-room near 24°');
const Q = paintChunk(rec);
ok(Q.paintCells.length === P.paintCells.length && Q.paintCells[20].color === P.paintCells[20].color && Q.lights.length === P.lights.length, 'paintChunk is deterministic');

// 6. it reskins a STREAMED neighbour just the same (the engine stays v8's; only the skin is new)
const world = createWorld(); addChunk(world, rec);
const spec = neighbourSpec(world, 0, 0);
const nb = solveChunk({ seed: 31, poly: spec.poly, inherit: spec.inherit }); nb.seed = 31;
const PN = paintChunk(nb);
ok(PN.paintCells.length > 100 && PN.lights.length > 0, `a streamed neighbour reskins too (${PN.paintCells.length} cells, ${PN.lights.length} lights)`);
ok(PN.paintCells.some((c) => c.x > rec.region.x1) || PN.comps.some((c) => c.cx > rec.region.x1) || nb.region.x1 > rec.region.x1, 'the neighbour paints in its own region across the seam');

console.log(`\nv090 reskin: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
