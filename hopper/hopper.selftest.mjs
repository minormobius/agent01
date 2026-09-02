#!/usr/bin/env node
/* hopper selftest — the level is a permalink, the world is a frozen slab,
   the survey reaches, the bucket lands where a player can drop into it.

     node hopper/hopper.selftest.mjs          # run
     node hopper/hopper.selftest.mjs --pin    # print the golden reaches to pin

   The survey golden pins the bucket's height for the first levels: if a
   change to the engine or the level generator moves it, every level moves,
   and that is a re-roll of the whole campaign — change it on purpose. */

import { level, world, survey, bucketOf, bucketCells, inBucket, slabTop, normalizeLevel, normalizeShape, origin, SLAB_Z, C } from "./js/level.js";
import { GRID } from "./js/genome.js";
import { player, stepPlayer, pushOut, raycast, HALF } from "./js/physics.js";

let checks = 0, fails = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("  ✗ " + msg); } };
const section = (t) => console.log(t);
const pin = process.argv.includes("--pin");

// pinned: the survey's reach per level (x, y, z of the summit after the stack)
const GOLDEN = { 1: [27, 32, 59], 2: [27, 25, 61], 3: [22, 18, 88] };

section("level");
{
  const a = level(1), b = level(1);
  ok(JSON.stringify(a) === JSON.stringify(b), "level(1) is deterministic");
  ok(a.packs.length === 3, "level 1 carries three packs");
  ok(level(7).packs.length === 5 && level(30).packs.length === 6, "packs grow with the level and cap at six");
  ok(a.slab.size >= 16 && a.slab.size <= 24 && a.slab.z === SLAB_Z, "slab within its band");
  for (const p of a.packs) {
    ok(p.masons >= 8 && p.masons <= 16 && p.budget >= 900 && p.budget <= 1500, "pack crew and budget in band");
    ok(p.size === 3 || p.size === 5, "pack plate is 3 or 5");
    ok(typeof p.seed === "number" && Array.isArray(p.axis) && p.oxide, "pack carries a specimen's laws");
  }
  ok(normalizeLevel("abc") === 1 && normalizeLevel("0") === 1 && normalizeLevel("99999999") === 9999 && normalizeLevel("12") === 12, "normalizeLevel");
  ok(level(1).n === 1 && level("3").n === 3, "level n is normalised");
  const seen = new Set();
  for (let n = 1; n <= 12; n++) seen.add(JSON.stringify(level(n).packs.map((p) => p.seed)));
  ok(seen.size === 12, "twelve levels, twelve different pockets");
}

section("world");
{
  const lv = level(1), g = world(lv);
  ok(g.bricks.length === lv.slab.size * lv.slab.size * lv.slab.thick, "the slab is every voxel");
  ok(g.bricks.every((b) => b.z >= SLAB_Z && b.z <= slabTop(lv)), "slab layers where declared");
  ok(g.done && g.colonies[0].done, "colony 0 is frozen at birth");
  const n = g.bricks.length; g.step(); g.step();
  ok(g.bricks.length === n, "nothing grows on its own");
  const s = g.sub.describe(g.sub.summit());
  ok(s.z === slabTop(lv) + 1, "the summit is the site above the slab");
  // a pack on the slab: floor is the plate's plane, the crystal rises
  const idx = g.deploy(lv.packs[0], { x: C, y: C, z: slabTop(lv) + 1 });
  ok(idx === 1, "the first pack is colony 1");
  ok(g.colonies[1].floor === slabTop(lv) + 1, "its floor is the plane the player chose");
  while (!g.colonies[1].done) g.step();
  const top = g.sub.describe(g.sub.summit()).z;
  ok(top >= slabTop(lv) + 6, `a pack on the slab rises (summit z ${top})`);
  ok(g.bricks.slice(n).every((b) => b.z >= slabTop(lv) + 1), "and lays nothing beneath its plane");
}

section("survey and bucket");
{
  const reaches = {};
  for (const n of [1, 2, 3]) {
    const lv = level(n);
    const t0 = performance.now();
    const res = survey(lv);
    const ms = performance.now() - t0;
    reaches[n] = [res.reach.x, res.reach.y, res.reach.z];
    ok(res.reach.z >= slabTop(lv) + 15, `level ${n}: the stack reaches (z ${res.reach.z}, ${res.bricks} bricks, ${ms.toFixed(0)} ms)`);
    ok(res.reach.z < GRID - 3, `level ${n}: the stack stays inside the lattice`);
    const b = bucketOf(lv, res.reach);
    ok(b.z >= slabTop(lv) + 8 && b.z <= res.reach.z, `level ${n}: bucket between the slab and the reach (z ${b.z})`);
    ok(b.x >= 8 && b.x <= GRID - 9 && b.y >= 8 && b.y <= GRID - 9, `level ${n}: bucket inside the lattice`);
    const cells = bucketCells(b);
    ok(cells.length === 25 + 16 * 3, "bucket is a 5×5 floor and three rings of wall");
    ok(!cells.some((c) => Math.abs(c[0] - b.x) <= 1 && Math.abs(c[1] - b.y) <= 1 && c[2] > b.z), "the interior is empty");
    ok(inBucket(b, b.x + 0.5, b.y + 0.5, b.z + 1), "feet on the bucket floor count");
    ok(!inBucket(b, b.x + 2.5, b.y + 0.5, b.z + 1) && !inBucket(b, b.x + 0.5, b.y + 0.5, b.z + 4.5) && !inBucket(b, b.x + 0.5, b.y + 0.5, b.z), "outside the walls, above the rim, in the floor: no");
    ok(survey(lv).reach.z === res.reach.z, `level ${n}: the survey is deterministic`);
    if (GOLDEN[n]) ok(JSON.stringify(GOLDEN[n]) === JSON.stringify(reaches[n]), `level ${n}: golden reach ${JSON.stringify(GOLDEN[n])} (got ${JSON.stringify(reaches[n])})`);
  }
  if (pin) console.log("  pin: " + JSON.stringify(reaches));
}

section("the body");
{
  // a floor at z = 0; along y = 1 a one-layer step from x = 3 up to a two-layer wall at x = 8
  const cell = (x, y, z) => z === 0 || (y === 1 && x >= 3 && x <= 7 && z === 1) || (x >= 8 && x <= 10 && (z === 1 || z === 2));
  const solid = (x, y, z) => cell(Math.floor(x), Math.floor(y), Math.floor(z));   // the body asks about points
  const settle = (p, ctl, s) => { for (let i = 0; i < s; i++) stepPlayer(p, solid, ctl, 1 / 60); };
  const p = player(1.5, 1.5, 1.2, 0, 0);
  settle(p, {}, 60);
  ok(p.ground && Math.abs(p.z - 1) < 0.01, `standing on the floor (z ${p.z.toFixed(3)})`);
  // jump: clears one layer, never two
  let apex = 0;
  stepPlayer(p, solid, { jump: true }, 1 / 60);
  for (let i = 0; i < 90; i++) { stepPlayer(p, solid, {}, 1 / 60); apex = Math.max(apex, p.z); }
  ok(apex > 2.02 && apex < 2.6, `jump apex ${apex.toFixed(2)}: more than one layer, less than two`);
  ok(p.ground && Math.abs(p.z - 1) < 0.01, "and lands");
  // walk into the step while jumping: gets up onto it
  const q = player(1.5, 1.5, 1, 0, 0);
  for (let i = 0; i < 240; i++) stepPlayer(q, solid, { mx: 1, jump: i > 20 && i < 24 }, 1 / 60);
  ok(q.x > 3.3 && Math.abs(q.z - 2) < 0.01, `climbed the step (x ${q.x.toFixed(2)}, z ${q.z.toFixed(2)})`);
  // the wall is two layers from the floor and one from the step: walking into it stops; a jump takes it
  ok(q.x < 8 - HALF + 0.01 && q.x > 7.5, `stopped by the wall (x ${q.x.toFixed(2)})`);
  for (let i = 0; i < 40; i++) stepPlayer(q, solid, { mx: 1, jump: i < 3 }, 1 / 60);
  ok(q.x > 8.3 && q.x < 11 && Math.abs(q.z - 3) < 0.01, `and jumped onto it from the step (x ${q.x.toFixed(2)}, z ${q.z.toFixed(2)})`);
  const w = player(6.5, 5.5, 1, 0, 0);
  for (let i = 0; i < 120; i++) stepPlayer(w, solid, { mx: 1, jump: i > 10 && i < 13 }, 1 / 60);
  ok(w.x < 8 - HALF + 0.01 && Math.abs(w.z - 1) < 0.01, `but never from the floor: two layers is too high (x ${w.x.toFixed(2)}, z ${w.z.toFixed(2)})`);
  // pushOut: a brick laid where the feet are lifts the body onto it
  const r = player(1.5, 1.5, 1, 0, 0);
  const laid = (x, y, z) => solid(x, y, z) || (Math.floor(x) === 1 && Math.floor(y) === 1 && Math.floor(z) === 1);
  ok(pushOut(r, laid) && Math.abs(r.z - 2) < 0.01, `ridden up onto the new brick (z ${r.z.toFixed(2)})`);
  ok(!pushOut(r, laid), "and not again");
  // the crosshair ray: from (2.5, 1.5) at eye height looking +x, the wall at x = 8, entered through its -x face
  const e = player(2.5, 1.5, 1, 0, 0);
  const hit = raycast(e, solid);
  ok(hit && Math.floor(hit.x) === 8 && Math.floor(hit.z) === 2 && hit.x < 8.06, `ray hits the wall's near face (${JSON.stringify(hit)})`);
  e.pitch = -1.4;
  const down = raycast(e, solid);
  ok(down && Math.floor(down.z) === 0 && down.z > 0.94, `ray down hits the floor from above (${JSON.stringify(down)})`);
  e.pitch = 1.2;
  ok(raycast(e, solid) === null, "ray up finds the void");
  ok(raycast(player(1.5, 1.5, 1, 0, 0), solid, 3) === null, "the wall is out of a 3-cell reach");
}

section("prism worlds");
{
  const GOLDEN_PRISM = { hex: [2.59765625, 7.5, 43], penrose: [-2.7724609375, -26.1865234375, 40] };
  const cubic = level(1);
  ok(normalizeShape("penrose") === "penrose" && normalizeShape("nope") === "grid" && normalizeShape(undefined) === "grid", "normalizeShape");
  ok(!level(1, "grid").prism && level(1, "grid").shape === "grid", "grid is the cubic level");
  const reaches = {};
  for (const shape of ["hex", "penrose", "kagome"]) {
    const lv = level(1, shape);
    ok(lv.prism && lv.shape === shape && lv.packs.every((p) => p.size === 5), `${shape}: a prism level, two-ring plates`);
    ok(JSON.stringify(lv.packs.map((p) => p.seed)) === JSON.stringify(cubic.packs.map((p) => p.seed)) && lv.slab.size === cubic.slab.size && lv.off.dx === cubic.off.dx, `${shape}: the same pocket, slab and offset as the cubic level`);
    const g = world(lv);
    ok(g.sub.kind === "prism" && g.done && g.bricks.length > 100, `${shape}: a frozen disk slab (${g.bricks.length} tiles)`);
    ok(g.bricks.every((b) => b.z >= SLAB_Z && b.z <= slabTop(lv)), `${shape}: slab layers where declared`);
    const o = origin(lv);
    const under = g.sub.siteAtWorld(o[0] + 0.5, o[1] + 0.5, slabTop(lv) + 0.5), above = g.sub.siteAtWorld(o[0] + 0.5, o[1] + 0.5, slabTop(lv) + 1.5);
    ok(under >= 0 && g.sub.occ[under] === 1 && above >= 0 && g.sub.occ[above] === 0, `${shape}: solid under the spawn, air above it`);
    const solidAt = (x, y, z) => { const q = g.sub.siteAtWorld(x, y, z); return q >= 0 && g.sub.occ[q] === 1; };
    const p = player(o[0] + 0.5, o[1] + 0.5, slabTop(lv) + 1.2, 0, 0);
    for (let i = 0; i < 60; i++) stepPlayer(p, solidAt, { mx: 1 }, 1 / 60);
    ok(p.ground && Math.abs(p.z - (slabTop(lv) + 1)) < 0.01 && p.x > o[0] + 3, `${shape}: the body walks the slab (x ${p.x.toFixed(1)}, z ${p.z.toFixed(2)})`);
    for (let i = 0; i < 400; i++) stepPlayer(p, solidAt, { mx: 1 }, 1 / 60);
    ok(p.z < SLAB_Z, `${shape}: and falls off its edge (x ${p.x.toFixed(1)}, z ${p.z.toFixed(1)})`);
    const n0 = g.bricks.length;
    const idx = g.deploy(lv.packs[0], { x: o[0], y: o[1], z: slabTop(lv) + 1 });
    ok(idx === 1 && g.colonies[1].floor === slabTop(lv) + 1, `${shape}: a pack lands on the slab's plane`);
    while (!g.colonies[1].done) g.step();
    ok(g.bricks.length - n0 > 200, `${shape}: and grows (${g.bricks.length - n0} bricks, summit z ${g.sub.describe(g.sub.summit()).z})`);
    ok(g.bricks.slice(n0).every((b) => b.z >= slabTop(lv) + 1), `${shape}: nothing beneath its plane`);
    if (shape !== "kagome") {
      const t0 = performance.now();
      const res = survey(lv);
      reaches[shape] = [res.reach.x, res.reach.y, res.reach.z];
      ok(res.reach.z >= slabTop(lv) + 12, `${shape}: the survey reaches (z ${res.reach.z}, ${res.bricks} bricks, ${(performance.now() - t0).toFixed(0)} ms)`);
      const b = bucketOf(lv, res.reach);
      ok(b.z >= slabTop(lv) + 8 && b.z <= Math.max(res.reach.z, slabTop(lv) + 8) && Math.abs(b.x) <= 32 && Math.abs(b.y) <= 32, `${shape}: bucket inside the tiling, between the slab and the reach (${b.x}, ${b.y}, z ${b.z})`);
      if (GOLDEN_PRISM[shape]) ok(JSON.stringify(GOLDEN_PRISM[shape]) === JSON.stringify(reaches[shape]), `${shape}: golden reach ${JSON.stringify(GOLDEN_PRISM[shape])} (got ${JSON.stringify(reaches[shape])})`);
    }
  }
  if (pin) console.log("  pin prism: " + JSON.stringify(reaches));
}

console.log(`\n${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
