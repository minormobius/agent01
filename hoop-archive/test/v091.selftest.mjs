// v091.selftest.mjs — v091 reskin: concourse luminescence + the luminous central component.
// Run: node hoop/test/v091.selftest.mjs
//
// v091 refines v090's paint: the concourse gets its OWN warm light fixtures (it was dank), and the
// central deco component is now a real EMITTER whose luminescence is derived from its construction.
// This pins those additions without regressing v090's structural contract (walls land on walls, doors
// stay open, floor is lit, deterministic from seed).
import { solveChunk } from '../v8/chunkgen.js';
import { createWorld, addChunk, neighbourSpec } from '../v8/manager.js';
import { paintChunk, hexHue } from '../v091/skin.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const rec = solveChunk({ seed: 7, shape: 'hex' }); rec.seed = 7;
const P = paintChunk(rec);

// 1. the v090 retile contract still holds: refined tiling, thin walls, floor tiles larger than walls
const walls = P.paintCells.filter((c) => c.wall).length;
const area = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };
const medArea = (sel) => { const a = P.paintCells.filter(sel).map((c) => area(c.poly)).sort((u, v) => u - v); return a.length ? a[a.length >> 1] : 0; };
ok(P.paintCells.length > rec.cells.length, `reseeding refines the tiling (${rec.cells.length} bones → ${P.paintCells.length} paint cells)`);
ok(walls > 50, `walls re-seeded with fine Voronoi nuclei (${walls} thin wall cells)`);
ok(medArea((c) => !c.wall) > medArea((c) => c.wall) * 1.8, `interior tiles fill the gaps larger than the walls`);
ok(P.paintCells.every((c) => typeof c.color === 'string'), 'every tile carries a pre-composited colour');
const lum = (s) => { const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(s); return m ? +m[1] * 0.3 + +m[2] * 0.6 + +m[3] * 0.1 : 0; };
ok(P.paintCells.filter((c) => !c.wall && lum(c.color) > 40).length > 20, 'the light field lifts the floor');

// 2. CONCOURSE LUMINESCENCE — the walkway has its own warm, free-standing bollard lamps
const conc = P.lights.filter((L) => L.concourse);
const room = P.lights.filter((L) => !L.concourse);
ok(conc.length > 0, `the concourse has its OWN light fixtures (${conc.length} bollards) — no longer dank`);
ok(conc.every((L) => L.hue === 40 && Array.isArray(L.rgb) && L.tip), 'concourse lamps are warm gold, tinted, with an emitter tip');
ok(room.length > 0 && room.length <= rec.rooms.length * 2, `room lamps are still per-room (${room.length} for ${rec.rooms.length} rooms)`);
ok(P.lights.every((L) => L.room === -1 || (L.room >= 0 && L.room < rec.rooms.length)), 'every returned light binds a real room or the concourse');

// 3. the LUMINOUS CENTRAL COMPONENT — a per-room emitter; brightness emerges from its construction
ok(P.comps.length > 0, `a central component per furnished room (${P.comps.length})`);
ok(P.comps.every((c) => typeof c.hue === 'number' && typeof c.emit === 'number' && c.emit >= 0.3 && c.emit <= 1 && c.g), 'each component carries a hue + an emit scalar derived from its superformula genome');
ok(P.comps.every((c) => c.lit >= 0.55), 'a luminous component never reads as a dark silhouette (its lit is lifted)');
ok(P.comps.some((c) => c.emit > 0.5), 'higher-symmetry / rosetted / sun-burst components glow brighter (some emit > 0.5)');
ok(Math.abs(hexHue('#e0772f') - 24) < 6, 'hexHue reads an orange make-room near 24°');

// 4. determinism with the new emitters, and world coordinates
const Q = paintChunk(rec);
ok(Q.lights.length === P.lights.length && Q.comps.length === P.comps.length && Q.paintCells[20].color === P.paintCells[20].color, 'paintChunk is deterministic with concourse + component emitters');
const inRegion = (x, y) => x > rec.region.x0 - 40 && x < rec.region.x1 + 40 && y > rec.region.y0 - 40 && y < rec.region.y1 + 40;
ok(P.comps.every((c) => inRegion(c.cx, c.cy)) && P.lights.every((L) => inRegion(L.x, L.y) && inRegion(L.tip.x, L.tip.y)), 'components + lights are in world coordinates');

// 5. a streamed neighbour reskins the same way
const world = createWorld(); addChunk(world, rec);
const spec = neighbourSpec(world, 0, 0);
const nb = solveChunk({ seed: 31, poly: spec.poly, inherit: spec.inherit }); nb.seed = 31;
const PN = paintChunk(nb);
ok(PN.lights.some((L) => L.concourse) && PN.comps.length > 0, 'a streamed neighbour gets concourse lamps + luminous components too');

console.log(`\nv091 reskin: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
