// lights.selftest.mjs — pins the wall-grown light sources + ray-traced occlusion (lights.js).
// Run: node mega/sprite/item/.. → node mega/sprite/fixture/test/lights.selftest.mjs
import { placeWallLights, lightField, lightGenome, hslToRgb, tintLights, occlusionGrid, visible, bakeFloorRGB, lightAtRGB } from '../lights.js';
import { buildScene } from '../voronoi.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const mk = (s) => { let a = s >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lum = (c) => 0.3 * c[0] + 0.6 * c[1] + 0.1 * c[2];

const scene = buildScene({ W: 700, H: 480, wallSpacing: 12, roomSpacing: 40, roomSize: 200, loops: 0.12, seed: 1 });

// ── lights grow on walls, deterministically ──
{
  const a = placeWallLights(scene, mk(5), { perRoom: 3 }), b = placeWallLights(scene, mk(5), { perRoom: 3 });
  ok(a.length > 0 && eq(a, b), 'placeWallLights is deterministic and non-empty');
  ok(a.every((L) => L.model && L.tip && Math.hypot(L.nx, L.ny) > 0.9), 'each light has a model, an inward normal, and a tip');
  ok(a.every((L) => ['sconce', 'coral', 'crystal'].includes(L.model.kind)), 'lights use the known wall-growth archetypes');
  ok(hslToRgb(40, 0.7, 0.6).every((v) => v >= 0 && v <= 1), 'hslToRgb stays in [0,1]');
  tintLights(a, () => 40); ok(a.every((L) => L.rgb && L.hue === 40), 'tintLights assigns a hue + rgb per light');
}

// ── the occlusion grid marks walls ──
{
  const occ = occlusionGrid(scene);
  let walls = 0; for (let i = 0; i < occ.wall.length; i++) walls += occ.wall[i];
  ok(occ.nx > 10 && occ.ny > 10, 'occlusion grid has resolution');
  ok(walls > 0 && walls < occ.wall.length, 'the grid marks some-but-not-all cells as wall');
}

// ── RAY TRACING: a wall between two points blocks; an open path passes ──
{
  const occ = occlusionGrid(scene);
  const lights = tintLights(placeWallLights(scene, mk(5), { perRoom: 3 }), () => 40);
  const L0 = lights[0];
  ok(visible(occ, L0.tip.x, L0.tip.y, L0.tip.x + 0.5, L0.tip.y + 0.5) === 1, 'a point sees itself (open near the source)');
  // over all floor cells, the single source must light some and be occluded from others
  const floors = scene.paintCells.filter((c) => !c.wall && c.room != null);
  let seen = 0, blocked = 0;
  for (const c of floors) (visible(occ, L0.tip.x, L0.tip.y, c.x, c.y) ? seen++ : blocked++);
  ok(seen > 0 && blocked > 0, 'the source lights some floor cells and is occluded from others (walls cast shadow)');
}

// ── the colour bake: floor gets light, walls are null, shadowed cells are darker ──
{
  const occ = occlusionGrid(scene);
  const lights = tintLights(placeWallLights(scene, mk(5), { perRoom: 3 }), () => 40);
  const baked = bakeFloorRGB(scene, lights, occ, { ambient: 0.04, strength: 1, reach: 2.4 });
  ok(scene.paintCells.every((c, i) => (c.wall || c.room == null) ? baked[i] === null : Array.isArray(baked[i])), 'bake lights floor cells and leaves walls/void null');
  const litVals = baked.filter(Boolean).map(lum);
  ok(Math.max(...litVals) > Math.min(...litVals) * 2.5, 'there is real light contrast across the chamber (pools + shadow)');
  // single-emitter occlusion: a cell the emitter cannot see ≈ ambient only
  const L0 = lights[0];
  const oneLight = bakeFloorRGB(scene, [L0], occ, { ambient: 0.04, strength: 1, reach: 2.4 });
  const occluded = scene.paintCells.map((c, i) => ({ c, v: oneLight[i] })).filter((o) => o.v && !visible(occ, L0.tip.x, L0.tip.y, o.c.x, o.c.y));
  ok(occluded.length === 0 || occluded.every((o) => lum(o.v) < 0.13), 'cells the lone emitter cannot see stay near-ambient (true occlusion)');
  ok(eq(bakeFloorRGB(scene, lights, occ), bakeFloorRGB(scene, lights, occ)), 'the bake is deterministic');
}

console.log(`lights.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
