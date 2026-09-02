#!/usr/bin/env node
/* bismuth — engine selftest. Run before touching the engine or the genome:
     node bismuth/js/crystal.selftest.mjs        (~30 s)

   The load-bearing invariant of the whole site is DETERMINISM: a seed is a
   permalink, so the same seed must lay the same bricks in the same order,
   forever. Then the things that make the crystal a crystal:
     CONNECTIVITY  — every brick touches an earlier one by a face; no brick
                     floats, none is laid under another (the melt is above)
     BOUNDS        — nothing touches the lattice wall
     MORPHOLOGY    — it is a hopper: hollow, terraced, not a slab and not a maze
     COVERAGE      — every habit appears; no seed stalls as a stub
     GENOME        — every field in range, and the genome never reads the
                     growth stream (adding a genome field must not re-roll
                     any crystal)
   plus the API contract the worker relies on. */

import { Growth, IDX, GRIDSIZE as G } from "./crystal.js";
import { genome, normalizeSeed, GRID, DEFAULT_BRAIN, DEFAULT_POPULATION } from "./genome.js";
import { stream } from "./prng.js";
import { createHash } from "node:crypto";

let failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.error("  ✗ " + msg); } }
function section(s) { console.log("\n" + s); }
const t0 = Date.now();

/* ── 1. determinism ─────────────────────────────────────────────────── */
section("determinism");
const seq = (g) => g.bricks.map((b) => `${b.x},${b.y},${b.z},${b.t},${b.m}`).join(";");
for (const seed of [1, 48112, 777777]) {
  const a = new Growth(seed).run(2500), b = new Growth(seed).run(2500);
  ok(seq(a) === seq(b), `seed ${seed}: the same 2500 bricks twice`);
  ok(a.tick === b.tick, `seed ${seed}: the same tick count twice`);
}
{
  // growing further never rewrites the prefix — a partial API response is a
  // prefix of the full crystal
  const a = new Growth(9).run(800), b = new Growth(9).run(1600);
  ok(seq(a) === seq({ bricks: b.bricks.slice(0, a.bricks.length) }), "seed 9: the first 800 bricks are a prefix of the first 1600");
}
ok(seq(new Growth(1).run(300)) !== seq(new Growth(2).run(300)), "adjacent seeds differ");
ok(JSON.stringify(genome(5)) === JSON.stringify(genome("5")), "genome(5) === genome('5')");
ok(JSON.stringify(genome(5)) === JSON.stringify(genome(5)), "genome is pure");
{
  // the growth stream must not be consumed by the genome: same first draw
  // regardless of how the genome was built
  const r1 = stream(42, "growth")(), r2 = stream(42, "growth")();
  ok(r1 === r2, "named PRNG streams are reproducible");
  ok(stream(42, "growth")() !== stream(42, "genome")(), "named PRNG streams are independent");
}
{
  // GOLDEN HASHES — the permalink contract. The first 2000 bricks of these
  // seeds, as laid on 2026-09-02. If this fails you have re-rolled every
  // crystal on the site; only do that knowingly, and update the hashes.
  const GOLD = { 1: "eda472f9ca124c56", 7: "fabebde190e618c9", 48112: "eab26156eb51cd55", 314159: "c4c98879ba10f056" };
  for (const seed of Object.keys(GOLD)) {
    const g = new Growth(Number(seed)).run(2000);
    const h = createHash("sha256").update(seq(g)).digest("hex").slice(0, 16);
    ok(h === GOLD[seed], `seed ${seed}: golden hash ${GOLD[seed]} (got ${h}) — permalinks re-rolled!`);
  }
}
ok(normalizeSeed("abc") === 1 && normalizeSeed("-4") === 1 && normalizeSeed("12x") === 12, "normalizeSeed clamps garbage");
ok(normalizeSeed(1e12) === 999999999, "normalizeSeed caps huge seeds");

/* ── 2. structure over a population ─────────────────────────────────── */
section("connectivity + bounds + the melt-is-above rule (12 seeds × 2500 bricks)");
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 11, 48112, 314159, 900000];
const grown = new Map();
for (const seed of SEEDS) {
  const g = new Growth(seed).run(2500);
  grown.set(seed, g);
  const seen = new Uint8Array(G * G * G);
  const top = new Int16Array(G * G).fill(-1);
  let floating = 0, wall = 0, shadowed = 0, dup = 0;
  for (let i = 0; i < g.bricks.length; i++) {
    const b = g.bricks[i];
    const k = IDX(b.x, b.y, b.z);
    if (seen[k]) dup++;
    if (b.m >= 0) {
      const touches = seen[k + 1] || seen[k - 1] || seen[k + G] || seen[k - G] || seen[k + G * G] || seen[k - G * G];
      if (!touches) floating++;
      if (top[b.x * G + b.y] > b.z) shadowed++;
    }
    if (b.x < 3 || b.y < 3 || b.z < 3 || b.x >= G - 3 || b.y >= G - 3 || b.z >= G - 3) wall++;
    seen[k] = 1;
    if (b.z > top[b.x * G + b.y]) top[b.x * G + b.y] = b.z;
  }
  ok(dup === 0, `seed ${seed}: no brick laid twice (${dup})`);
  ok(floating === 0, `seed ${seed}: every mason brick face-touches an earlier brick (${floating} floating)`);
  ok(shadowed === 0, `seed ${seed}: no brick laid under an existing brick (${shadowed})`);
  ok(wall === 0, `seed ${seed}: nothing at the lattice wall (${wall})`);
  ok(g.bricks.length >= 2500, `seed ${seed}: reached 2500 bricks without stalling (${g.bricks.length})`);
  for (const b of g.bricks) ok(Number.isInteger(b.x) && Number.isInteger(b.t) && b.m >= -1, `seed ${seed}: brick fields are integers`);
}

/* ── 3. morphology: is it a hopper? ─────────────────────────────────── */
section("morphology (2 seeds grown to completion)");
for (const seed of [7, 48112]) {
  const g = new Growth(seed).run();
  const st = g.stats();
  const gen = g.genome;
  ok(g.done, `seed ${seed}: growth completes`);
  ok(st.bricks - g.nucleusBricks >= gen.budget, `seed ${seed}: reached its budget (${st.bricks} vs ${gen.budget})`);
  ok(st.bricks - g.nucleusBricks <= gen.budget * 1.16, `seed ${seed}: the cool-down adds at most 16% (${st.bricks})`);
  ok(st.hollowness > 0.2, `seed ${seed}: hollow — pit volume is ${st.hollowness.toFixed(2)} of the brick count (want > 0.2)`);
  ok(st.terraces >= 8, `seed ${seed}: terraced — ${st.terraces} distinct step heights on the midline (want ≥ 8)`);
  const fill = st.bricks / (st.box[0] * st.box[1] * st.box[2]);
  ok(fill < 0.35, `seed ${seed}: skeletal — fills ${fill.toFixed(2)} of its bounding box (want < 0.35)`);
  ok(st.box[2] >= 12, `seed ${seed}: has height (${st.box[2]})`);
  ok(st.box[0] >= 30 && st.box[1] >= 30, `seed ${seed}: has breadth (${st.box[0]}×${st.box[1]})`);
  // the pit is where the nucleus was: the column above the nucleus centre is open
  const n0 = gen.nuclei[0];
  let openAbove = 0;
  for (let z = n0.z + 2; z <= g.lat.max[2]; z++) if (!g.lat.occ[IDX(n0.x, n0.y, z)]) openAbove++;
  const span = g.lat.max[2] - n0.z - 1;
  ok(openAbove >= span * 0.6, `seed ${seed}: the column over the nucleus is mostly open sky — a pit, not a dome (${openAbove} open of ${span})`);
  // every mason laid something
  const idle = st.laidPerMason.filter((n) => n === 0).length;
  ok(idle === 0, `seed ${seed}: every mason laid at least one brick (${idle} idle)`);
}

/* ── 4. coverage: habits and no stubs ───────────────────────────────── */
section("coverage (genome over 400 seeds; growth over 12)");
{
  const habits = new Map();
  for (let s = 1; s <= 400; s++) {
    const g = genome(s);
    habits.set(g.habit, (habits.get(g.habit) || 0) + 1);
    ok(g.masons >= 6 && g.masons <= 18, `seed ${s}: masons in range`);
    ok(g.budget >= 3200 && g.budget <= 11000, `seed ${s}: budget in range`);
    ok(g.rim >= 2 && g.rim <= 4, `seed ${s}: rim in range`);
    ok(g.axis.length === 6 && g.axis.every((w) => w >= 0 && w <= 1.25), `seed ${s}: axis weights in range`);
    ok(g.axis[5] === 0, `seed ${s}: nothing grows downward — the melt is above`);
    ok(g.k1 > 0 && g.k1 < g.k2 && g.k2 < g.k3 && g.k3 <= 1, `seed ${s}: Kossel rates ordered k1 < k2 < k3 ≤ 1`);
    ok(g.oxide.base >= 40 && g.oxide.base + g.oxide.ramp <= 480, `seed ${s}: oxide thickness in the interference range`);
    ok(g.nuclei.length >= 1 && g.nuclei.length <= 2, `seed ${s}: 1–2 nuclei`);
    ok(typeof g.label === "string" && g.label.includes(g.habit), `seed ${s}: label carries the habit`);
  }
  for (const h of ["hopper", "staircase", "twin", "plate", "tower"]) ok(habits.has(h), `habit '${h}' occurs in the first 400 seeds`);
  console.log("  habits:", [...habits.entries()].map(([k, v]) => `${k} ${v}`).join(", "));
  for (const [seed, g] of grown) {
    ok(g.masons.filter((m) => m.laid > 0).length >= g.masons.length * 0.8, `seed ${seed}: ≥80% of masons laid bricks by 2500`);
  }
}

/* ── 5. the playground contract: brain laws, population, initial condition ── */
section("playground: brain overrides, population control, explicit voxels");
{
  const base = genome(48112);
  const lab = (over) => Object.assign({}, base, over);
  // explicit voxels replace the seeded nucleus, placed as offsets from the centre
  const vox = [];
  for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) vox.push([x, y, 0], [x, y, 1]);
  const gv = new Growth(lab({ voxels: vox }));
  ok(gv.nucleusBricks === vox.length, `voxels: all ${vox.length} placed as the nucleus (${gv.nucleusBricks})`);
  ok(gv.bricks[0].x === (G >> 1) - 3 && gv.bricks[0].z === (G >> 1) - 20, "voxels: offsets are from the lattice centre at the melt floor");
  gv.run(600);
  ok(gv.bricks.length >= 600, "voxels: growth proceeds from an explicit nucleus");
  // a brain with no terrace nucleation never starts a new layer: growth stalls
  // once the nucleus's own ledges are done
  const gk = new Growth(lab({ k1: 0 })).run(400);
  ok(gk.done && gk.bricks.length < 400, `k1 = 0: no new layers, growth ends early (${gk.bricks.length} bricks)`);
  // population: births add masons, retirement removes them, both bounded
  const gb = new Growth(lab({ masons: 4, population: { birthEvery: 100, max: 12 } })).run(1500);
  ok(gb.masons.length === 12, `birthEvery 100, max 12: colony grew to the cap (${gb.masons.length})`);
  ok(gb.masons[gb.masons.length - 1].id === 11 && gb.masons[gb.masons.length - 1].laid > 0, "born masons get fresh ids and lay bricks");
  const gr = new Growth(lab({ masons: 10, population: { retireAfter: 30, min: 3 } })).run(1500);
  ok(gr.masons.length === 3 && gr.retired === 7, `retireAfter 30, min 3: thinned to the floor (${gr.masons.length} alive, ${gr.retired} retired)`);
  ok(gr.masons.reduce((n, m) => n + m.laid, 0) + 7 * 30 <= 1500, "the retired laid at least their quota before leaving");
  // brain overrides are read (skyRule off lets bricks be laid under a lip)
  const gs = new Growth(lab({ brain: { skyRule: false, lipDepth: 0 } })).run(2500);
  const top = new Int16Array(G * G).fill(-1);
  let shadowed = 0;
  for (const b of gs.bricks) { if (b.m >= 0 && top[b.x * G + b.y] > b.z) shadowed++; if (b.z > top[b.x * G + b.y]) top[b.x * G + b.y] = b.z; }
  ok(shadowed > 0, `skyRule off: bricks do get laid under existing bricks (${shadowed})`);
  // the defaults are what the engine merges
  const gd = new Growth(48112);
  ok(JSON.stringify(gd.brain) === JSON.stringify(DEFAULT_BRAIN) && JSON.stringify(gd.pop) === JSON.stringify(DEFAULT_POPULATION), "a seeded genome runs on the default brain and a fixed population");
  ok(Object.keys(DEFAULT_BRAIN).length === 11 && Object.keys(DEFAULT_POPULATION).length === 4, "brain/population defaults have the documented fields");
}

/* ── 6. the API contract the worker relies on ───────────────────────── */
section("API contract");
{
  const g = new Growth(48112);
  g.run(500);
  ok(g.bricks.length >= 500 && !g.done, "run(n) grows to n and stops short of done");
  const j = JSON.parse(JSON.stringify({ genome: g.genome, bricks: g.bricks.map((b) => [b.x, b.y, b.z, b.t, b.m]) }));
  ok(Array.isArray(j.bricks) && j.bricks[0].length === 5, "bricks serialise as [x,y,z,t,m]");
  ok(j.bricks[0][4] === -1 && j.bricks[j.bricks.length - 1][4] >= 0, "nucleus first (mason -1), then mason bricks");
  ok(GRID === G, "genome GRID and engine lattice agree");
}

console.log(`\n${checks} checks, ${failures} failures, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(failures ? 1 : 0);
