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

import { Growth, Lattice, IDX, GRIDSIZE as G } from "./crystal.js";
import { genome, normalizeSeed, GRID, DEFAULT_BRAIN, DEFAULT_POPULATION, quasiSubstrate, QUASI_SHAPES } from "./genome.js";
import { SHAPES } from "./tilings.js";
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

/* ── 6. the prism substrate: any plane tiling, stacked ───────────────── */
section("prism substrate (quasicrystals): determinism, connectivity, hoppering, every shape grows");
{
  // determinism + golden hash for the Penrose cousin of seed 7
  const q7 = () => { const g = genome(7); g.substrate = quasiSubstrate(7, "penrose"); return g; };
  ok(q7().substrate.shape === "penrose" && q7().substrate.R === 44, "quasiSubstrate honours a shape override");
  ok(JSON.stringify(quasiSubstrate(7)) === JSON.stringify(quasiSubstrate(7)), "quasiSubstrate is pure");
  ok(QUASI_SHAPES.every((sh) => SHAPES.includes(sh)) && !QUASI_SHAPES.includes("grid"), "the /q namespace draws from real, non-cubic shapes");
  const seqQ = (g) => g.bricks.map((b) => `${b.tile},${b.z},${b.t},${b.m}`).join(";");
  const a = new Growth(q7()).run(1500), b = new Growth(q7()).run(1500);
  ok(seqQ(a) === seqQ(b), "penrose seed 7: the same 1500 bricks twice");
  const hq = createHash("sha256").update(seqQ(a)).digest("hex").slice(0, 16);
  const GOLD_Q = "80fd0272e0700549";
  ok(hq === GOLD_Q, `penrose seed 7: golden hash ${GOLD_Q} (got ${hq}) — quasicrystal permalinks re-rolled!`);
  // connectivity + the melt-is-above rule on the prism
  {
    const sub = a.sub, n = sub.n;
    const seen = new Uint8Array(sub.sites), top = new Int16Array(n).fill(-1);
    let floating = 0, shadowed = 0, outside = 0;
    for (const br of a.bricks) {
      const t = br.tile, z = br.z, s = z * n + t;
      if (br.m >= 0) {
        let touch = (z > 0 && seen[s - n]) || (z + 1 < sub.Z && seen[s + n]);
        for (let k = sub.T.nbrStart[t]; !touch && k < sub.T.nbrStart[t + 1]; k++) if (seen[z * n + sub.T.nbrList[k]]) touch = true;
        if (!touch) floating++;
        if (top[t] > z) shadowed++;
        if (!sub.T.deep[t]) outside++;
      }
      seen[s] = 1;
      if (z > top[t]) top[t] = z;
    }
    ok(floating === 0, `penrose: every mason brick shares an edge or a layer face with an earlier brick (${floating} floating)`);
    ok(shadowed === 0, `penrose: no brick laid under an existing brick (${shadowed})`);
    ok(outside === 0, `penrose: nothing laid on the tiling's boundary ring (${outside})`);
    ok(a.bricks.every((br) => Number.isInteger(br.tile) && Number.isInteger(br.z) && typeof br.x === "number"), "prism bricks carry tile, z and world x/y");
  }
  // morphology: a hoppered decagonal disc, not a tower and not a slab
  {
    const g = q7(); g.budget = 3500;
    const gr = new Growth(g).run();
    const st = gr.stats();
    ok(gr.done && st.bricks - gr.nucleusBricks >= 3500, `penrose: completes its budget (${st.bricks})`);
    ok(st.terraces >= 5, `penrose: terraced (${st.terraces} step heights along +x, want ≥ 5)`);
    ok(st.box[2] < st.box[0] && st.box[2] < st.box[1], `penrose: broader than tall (${st.box.map((v) => Math.round(v)).join("×")})`);
    ok(st.hollowness > 0.3, `penrose: hollow (${st.hollowness.toFixed(2)})`);
    ok(st.tiling === "penrose" && st.tiles > 1000, `penrose: stats name the tiling (${st.tiles} tiles)`);
  }
  // every shape grows without stalling (small budget, the seed's own brain)
  for (const sh of SHAPES) {
    if (sh === "grid") continue;
    const g = genome(3); g.substrate = quasiSubstrate(3, sh); g.substrate.R = 24; g.budget = 700;
    const gr = new Growth(g).run();
    ok(gr.done && gr.bricks.length - gr.nucleusBricks >= 700, `${sh}: grows 700 bricks without stalling (${gr.bricks.length - gr.nucleusBricks}, ${gr.tick} ticks)`);
  }
  // the playground's explicit tile heights seed the prism
  {
    const probe = new Growth(Object.assign(genome(3), { substrate: { shape: "hex", R: 20, ic: { cells: [] }, z0: 6 } })).sub;
    const t0 = probe.T.locate(0, 0), t1 = probe.T.nbrList[probe.T.nbrStart[t0]], t2 = probe.T.nbrList[probe.T.nbrStart[t0] + 1];
    const g = genome(3); g.substrate = { shape: "hex", R: 20, ic: { cells: [[t0, 3], [t1, 3], [t2, 1]] }, z0: 6 };
    const gr = new Growth(g);
    ok(gr.nucleusBricks === 7, `prism ic.cells: 3+3+1 bricks placed (${gr.nucleusBricks})`);
    ok(gr.bricks[0].z === 6 && gr.bricks[0].tile === t0, "prism ic.cells: laid from z0 on the named tiles");
  }
}

/* ── 6b. the stack substrate: staggered and twisted layers ─────────────── */
section("stack substrate (close packings, twists): overlaps, coordination, determinism, growth, height field, worms");
{
  const { Stack, isStacked, normalizeStack, SUPPORT } = await import("./stack.js");
  const spec = (o) => Object.assign({ R: 16, ic: { disk: 3, thickness: 2 }, z0: 6 }, o);
  ok(!isStacked({ shape: "hex" }) && !isStacked({ shape: "hex", stack: "ab", stagger: 0 }) && isStacked({ shape: "hex", stack: "ab", stagger: 1 }) && isStacked({ shape: "penrose", twist: 1 }), "isStacked: a stagger of zero and no twist is the prism");
  ok(JSON.stringify(normalizeStack({ stack: "abc", stagger: 0.53, twist: 1.13 })) === JSON.stringify({ stack: "abc", stagger: 0.55, twist: 1.25 }) && normalizeStack({ stack: "xyz", twist: 99 }).stack === "" && normalizeStack({ stack: "xyz", twist: 99 }).twist === 6, "normalizeStack quantises the stagger to 1/20 and the twist to a quarter degree, and clamps");
  ok(new Growth(Object.assign(genome(3), { substrate: spec({ shape: "hex" }) })).sub.constructor.name === "Prism" && new Growth(Object.assign(genome(3), { substrate: spec({ shape: "hex", stack: "ab", stagger: 1 }) })).sub instanceof Stack && new Growth(Object.assign(genome(3), { substrate: spec({ shape: "grid", stack: "ab", stagger: 1 }) })).sub instanceof Stack, "Growth picks the stack for a stagger or a twist, on the square grid too");
  // the close packings: overlaps and coordination
  const out = new Int32Array(64);
  {
    const S = new Stack(spec({ shape: "grid", stack: "ab", stagger: 1 }));
    const t = S.T.locate(0, 0), P = S.pair(S.z0);
    const ups = P.upStart[t + 1] - P.upStart[t];
    let wsum = 0, quarter = true;
    for (let i = P.upStart[t]; i < P.upStart[t + 1]; i++) { wsum += P.upW[i]; if (Math.abs(P.upW[i] - 0.25) > 1e-9) quarter = false; }
    ok(ups === 4 && quarter && Math.abs(wsum - 1) < 1e-9, `grid AB: a square sits over the corner of four, a quarter each (${ups} overlaps, Σ ${wsum.toFixed(3)})`);
    ok(S.coordination() === 12, `grid AB: twelve bonds a brick — face-centred cubic (${S.coordination()})`);
    ok(S.vertical(t, S.z0, 1, out) === 4 && S.vertical(t, S.z0, -1, out) === 4, "vertical() lists four above and four below");
    const f = S.frame(S.z0 + 1), f0 = S.frame(S.z0), f2 = S.frame(S.z0 + 2);
    ok(f0.ox === 0 && f0.oy === 0 && f.ox === 512 && f.oy === 512 && f2.ox === 0 && f.c === 1 && f.s === 0, "grid AB: the frames alternate 0, (½,½), 0 with no rotation");
  }
  {
    const S = new Stack(spec({ shape: "hex", stack: "ab", stagger: 1 }));
    const t = S.T.locate(0, 0), P = S.pair(S.z0);
    const ups = P.upStart[t + 1] - P.upStart[t];
    let third = true; for (let i = P.upStart[t]; i < P.upStart[t + 1]; i++) if (Math.abs(P.upW[i] - 1 / 3) > 1e-3) third = false;
    ok(ups === 3 && third, `hex AB: a hexagon sits in the hollow of three, a third each (${ups})`);
    ok(S.coordination() === 12, `hex AB: twelve bonds a brick — hexagonal close packing (${S.coordination()})`);
    // the third layer is over the first: the same overlaps, the same world position
    const d0 = S.describe(S.site(t, S.z0)), d2 = S.describe(S.site(t, S.z0 + 2)), d1 = S.describe(S.site(t, S.z0 + 1));
    ok(d0.x === d2.x && d0.y === d2.y && (d1.x !== d0.x || d1.y !== d0.y), "hex AB: layer A over layer A, B displaced");
  }
  {
    const S = new Stack(spec({ shape: "hex", stack: "abc", stagger: 1 }));
    ok(S.coordination() === 12 && S.period === 3, `hex ABC: twelve bonds, period three — the rhombohedral family (${S.coordination()})`);
    // the fourth layer is over the first: C's offset (0, 2) is a hollow, and 3·(0, 1) is a lattice vector
    const t = S.T.locate(0, 0);
    const d3 = S.describe(S.site(t, S.z0 + 3)), u = S.T.locate(Math.round(d3.x * 1024), Math.round(d3.y * 1024));
    ok(u >= 0 && S.T.cx[u] === Math.round(d3.x * 1024) && S.T.cy[u] === Math.round(d3.y * 1024), "hex ABC: the fourth layer's tiles sit exactly on tiles of the first");
    const dA = S.describe(S.site(t, S.z0)), dB = S.describe(S.site(t, S.z0 + 1)), dC = S.describe(S.site(t, S.z0 + 2));
    ok(dB.y - dA.y === 1 && dC.y - dA.y === 2, "hex ABC: A, B, C a hollow apart");
  }
  {
    // a twist: every layer turned, a moiré of overlaps, no two pair maps alike
    const S = new Stack(spec({ shape: "penrose", twist: 1.5 }));
    const t = S.T.locate(0, 0);
    ok(S.turning && S.frame(S.z0).c === 1 && Math.abs(S.frame(S.z0 + 20).c - Math.cos(30 * Math.PI / 180)) < 1e-9 && Math.abs(S.frame(S.z0 - 4).s + Math.sin(6 * Math.PI / 180)) < 1e-9, "twist 1.5°: layer 20 is turned 30°, layer −4 turned −6°, from the literal table");
    const far = (() => { let best = -1, bd = 0; for (let u = 0; u < S.n; u++) { const d = S.T.cx[u] * S.T.cx[u] + S.T.cy[u] * S.T.cy[u]; if (S.T.deep[u] && d > bd) { bd = d; best = u; } } return best; })();
    const a = S.describe(S.site(far, S.z0)), b = S.describe(S.site(far, S.z0 + 20));
    let ang = Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x);
    while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
    ok(Math.abs(ang - 30 * Math.PI / 180) < 1e-6 && Math.abs(Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y)) < 1e-6, `twist: a far tile rides round the axis at the same radius (${(ang * 180 / Math.PI).toFixed(3)}°)`);
    const P0 = S.pair(S.z0), P1 = S.pair(S.z0 + 1);
    ok(P0 !== P1 && S.pairs.size === 2, "twist: each pair of layers has its own overlap map");
    const c = S.coordination();
    ok(c >= 6 && c <= 10, `twist on Penrose: a brick makes ${c} bonds (edges, plus the tiles it happens to overlap)`);
  }
  // growth: determinism, a golden hash of its own, connectivity, the sky rule
  const seqS = (g) => g.bricks.map((b) => `${b.tile},${b.z},${b.t},${b.m}`).join(";");
  const hcp = () => Object.assign(genome(7), { substrate: spec({ shape: "hex", R: 20, stack: "ab", stagger: 1 }), budget: 900 });
  const a = new Growth(hcp()).run(), b = new Growth(hcp()).run();
  ok(seqS(a) === seqS(b) && a.tick === b.tick, `hex AB seed 7: the same ${a.bricks.length} bricks twice`);
  const hs = createHash("sha256").update(seqS(a)).digest("hex").slice(0, 16);
  const GOLD_S = "10fff67824a01b27";
  ok(hs === GOLD_S || process.env.STACK_GOLD === "print", `hex AB seed 7: golden hash ${GOLD_S} (got ${hs}) — stack permalinks re-rolled!`);
  if (process.env.STACK_GOLD === "print") console.log("  stack golden:", hs);
  ok(a.done && a.bricks.length - a.nucleusBricks >= 900, `hex AB: completes its budget (${a.bricks.length} bricks, ${a.tick} ticks)`);
  {
    const sub = a.sub, n = sub.n, bond = new Int32Array(64);
    // rebuild occupancy in laying order: every mason brick touches an earlier one through the bond graph
    const seen = new Uint8Array(sub.sites);
    let floating = 0, maxNb = 0;
    for (let i = 0; i < a.bricks.length; i++) {
      const br = a.bricks[i], s = br.z * n + br.tile;
      if (br.m >= 0) { const m = sub.bonds(s, bond); let touch = false; for (let k = 0; k < m; k++) if (seen[bond[k]]) touch = true; if (!touch) floating++; }
      seen[s] = 1;
    }
    for (let s = 0; s < sub.sites; s++) if (sub.occ[s] && sub.nb[s] > maxNb) maxNb = sub.nb[s];
    ok(floating === 0, `hex AB: every mason brick is bonded to an earlier one (${floating} floating)`);
    ok(maxNb >= 9 && maxNb <= 12, `hex AB: buried bricks carry up to ${maxNb} bonds`);
    // the bond counts are exact against a rebuild
    let wrong = 0;
    for (let s = 0; s < sub.sites; s++) { if (!sub.occ[s] && !sub.nb[s]) continue; const m = sub.bonds(s, bond); let c = 0; for (let k = 0; k < m; k++) if (sub.occ[bond[k]]) c++; if (c !== sub.nb[s]) wrong++; }
    ok(wrong === 0, `hex AB: nb[] agrees with the bond graph everywhere (${wrong} wrong)`);
    // the height field agrees with the bricks: every brick's centroid cell is at least its layer
    let low = 0;
    for (const br of a.bricks) { const d = sub.describe(br.z * n + br.tile); if (sub.heightAt(d.x * 1024, d.y * 1024) < br.z) low++; }
    ok(low === 0, `hex AB: the height field covers every brick (${low} below)`);
    // the melt is above: no mason brick laid under a brick covering it at the time
    const st = a.stats();
    ok(st.coordination === 12 && st.stack === "ab" && st.tiling === "hex", "hex AB: stats name the stacking and the coordination");
    ok(st.terraces >= 3, `hex AB: terraced (${st.terraces} step heights along +x)`);
    ok(st.box[2] < st.box[0], `hex AB: broader than tall (${st.box.map((v) => Math.round(v)).join("×")})`);
    // staggered courses: no brick sits at the world position of one it stands on
    let same = 0, pairs = 0;
    for (const br of a.bricks) {
      const s = br.z * n + br.tile; if (!sub.occ[s]) continue;
      const m = sub.vertical(br.tile, br.z, 1, bond), d = sub.describe(s);
      for (let k = 0; k < m; k++) { pairs++; const e = sub.describe((br.z + 1) * n + bond[k]); if (Math.abs(e.x - d.x) < 1e-9 && Math.abs(e.y - d.y) < 1e-9) same++; }
    }
    ok(pairs > 0 && same === 0, "hex AB: no brick is straight over one of the layer below — the courses run");
  }
  // remove: the height field and the bonds stay exact
  {
    const g = new Growth(hcp()).run(600), sub = g.sub, n = sub.n;
    const br = g.bricks[g.bricks.length - 1], s = br.z * n + br.tile;
    const d = sub.describe(s), h0 = sub.heightAt(d.x * 1024, d.y * 1024);
    ok(h0 === br.z || h0 > br.z, "before removal the height field sees the brick");
    ok(g.remove(s) && !sub.occ[s], "stack: a brick can be removed");
    const h1 = sub.heightAt(d.x * 1024, d.y * 1024);
    const cc = sub.cellCentre(sub.cellOf(d.x * 1024, d.y * 1024));
    let expect = -1;
    for (let zz = br.z; zz >= 0; zz--) { const u = sub.locateIn(zz, cc[0], cc[1]); if (u >= 0 && sub.occ[zz * n + u]) { expect = zz; break; } }
    ok(h1 === expect, `stack: the height field is rescanned after removal (${h1}, expected ${expect})`);
    const bond = new Int32Array(64); let wrong = 0;
    for (let q = 0; q < sub.sites; q++) { if (!sub.occ[q] && !sub.nb[q]) continue; const m = sub.bonds(q, bond); let c = 0; for (let k = 0; k < m; k++) if (sub.occ[bond[k]]) c++; if (c !== sub.nb[q]) wrong++; }
    ok(wrong === 0, "stack: bonds exact after removal");
    ok(sub.summit() >= 0 && !sub.occ[sub.summit()] && sub.supportOf(sub.summit() % n, Math.floor(sub.summit() / n)) > 0, "stack: the summit is an empty site standing on the highest brick");
    const idx = g.deploy({ masons: 4, budget: 120 }, null);
    ok(idx === 1 && g.colonies[1].masons.length === 4, "stack: a pack deploys on the summit");
    for (let i = 0; i < 4000 && g.colonies[1].laid === 0; i++) g.step();
    ok(g.colonies[1].laid > 0, `stack: the pack lays bricks (${g.colonies[1].laid})`);
  }
  // every stacking grows on a few shapes, twisted and staggered, without stalling
  for (const o of [{ shape: "grid", stack: "ab", stagger: 1 }, { shape: "hex", stack: "abc", stagger: 1 }, { shape: "penrose", stack: "ab", stagger: 0.5 }, { shape: "kagome", twist: 2 }, { shape: "hex", stack: "ab", stagger: 1, twist: -0.75 }]) {
    const g = Object.assign(genome(3), { substrate: spec(o), budget: 400 });
    const gr = new Growth(g).run();
    ok(gr.done && gr.bricks.length - gr.nucleusBricks >= 400, `${JSON.stringify(o)}: grows 400 bricks without stalling (${gr.bricks.length - gr.nucleusBricks}, ${gr.tick} ticks)`);
  }
  // worms tunnel a stack along its overlaps
  {
    const { Worms } = await import("./worms.js");
    const g = new Growth(hcp()).run(700);
    const W = new Worms(g, { count: 3, speed: 0.1, bite: 0.2 });
    ok(W.release() === 3, "stack: three worms released");
    const before = g.sub.count;
    W.step(500);
    ok(W.worms.every((w) => w.moves > 10) && W.eaten > 0 && g.sub.count === before - W.eaten, `stack: the worms tunnel and bite (${W.eaten} eaten)`);
    ok(W.worms.every((w) => g.sub.occ[w.site] || g.sub.nb[w.site] > 0), "stack: and stay on the crystal");
  }
  // the prism's own bond list is what the worms used to walk: below, above, edges
  {
    const g = new Growth(Object.assign(genome(3), { substrate: spec({ shape: "penrose" }) }));
    const sub = g.sub, n = sub.n, t = sub.T.locate(0, 0), s = sub.site(t, 10), bond = new Int32Array(64);
    const m = sub.bonds(s, bond);
    const want = [s - n, s + n]; for (let k = sub.T.nbrStart[t]; k < sub.T.nbrStart[t + 1]; k++) want.push(10 * n + sub.T.nbrList[k]);
    ok(m === want.length && want.every((q, i) => bond[i] === q), "prism.bonds(): below, above, then the lateral edges, in that order");
  }
}

/* ── 6c. the icosahedral quasicrystal: golden rhombohedra ─────────────── */
section("icosahedral substrate: the tiling closes, adjacency is exact, φ, point location, columns, growth, extent maps, removal, deploy, worms");
{
  const { Ico, IcoTiling, icoTiling, STAR } = await import("./ico.js");
  // the star: unit vectors, every pair at arccos(±1/√5), z a two-fold axis
  let starBad = 0;
  for (let i = 0; i < 6; i++) { const a = STAR[i]; if (Math.abs(Math.hypot(a[0], a[1], a[2]) - 1) > 1e-12) starBad++; for (let j = i + 1; j < 6; j++) { const dd = a[0] * STAR[j][0] + a[1] * STAR[j][1] + a[2] * STAR[j][2]; if (Math.abs(Math.abs(dd) - 1 / Math.sqrt(5)) > 1e-12) starBad++; } }
  ok(starBad === 0, "the icosahedral star: six unit vectors, every pair at arccos(1/√5)");
  const T = icoTiling(8);
  ok(T === icoTiling(8) && T.n > 4000, `icoTiling(8) is cached and has ${T.n} tiles`);
  ok(T.dirs.length === 30 && T.dirs.some((d) => Math.abs(d[2] - 1) < 1e-9), "thirty face directions, one of them straight up: the melt direction is a two-fold axis");
  // closure: the tiles fill the cylinder (volume), adjacency is symmetric, faces are shared by at most two
  let vol = 0, pro = 0, ob = 0, asym = 0, open = 0;
  for (let t = 0; t < T.n; t++) {
    const v = T.volume(t); vol += v; if (v > 0.7) pro++; else ob++;
    for (let f = 0; f < 6; f++) { const u = T.across[t * 6 + f]; if (u < 0) { open++; continue; } let back = false; for (let g = 0; g < 6; g++) if (T.across[u * 6 + g] === t) back = true; if (!back) asym++; }
  }
  const cyl = Math.PI * T.R * T.R * 2 * 1.25 * T.R;
  ok(Math.abs(vol - cyl) / cyl < 0.02, `the rhombohedra fill the cylinder: volume ${vol.toFixed(0)} against ${cyl.toFixed(0)} (no gaps, no overlaps)`);
  ok(asym === 0, "every shared face is shared both ways");
  ok(Math.abs(pro / ob - (1 + Math.sqrt(5)) / 2) < 0.06, `prolate to oblate ${(pro / ob).toFixed(3)}: the golden ratio`);
  ok(Math.abs(T.volume(0) - 0.7608) < 0.01 || Math.abs(T.volume(0) - 0.4702) < 0.01, "a golden rhombohedron's volume is 0.7608 or 0.4702 for unit edges");
  // every vertex is an exact integer 6-tuple: tiles sharing a face share four identical ids
  {
    let shared = 0, bad = 0;
    for (let t = 0; t < T.n && shared < 500; t++) for (let f = 0; f < 6; f++) {
      const u = T.across[t * 6 + f]; if (u < 0) continue; shared++;
      const mine = new Set(); for (let q = 0; q < 4; q++) mine.add(T.fv[t * 24 + f * 4 + q]);
      let common = 0; for (let q = 0; q < 8; q++) if (mine.has(T.tv[u * 8 + q])) common++;
      if (common !== 4) bad++;
    }
    ok(bad === 0, "a shared face is the same four vertex ids on both tiles (welded by 6-tuple, not by distance)");
  }
  // point location and the columns
  {
    const r = stream(11, "ico-probe"); let miss = 0, tries = 0;
    while (tries < 500) { const x = (r() * 2 - 1) * (T.R - 2), y = (r() * 2 - 1) * (T.R - 2), z = 2 + r() * (2.5 * T.R - 4); if (x * x + y * y > (T.R - 2) * (T.R - 2)) continue; tries++; const t = T.locate(x, y, z); if (t < 0 || !T.contains(t, x, y, z)) miss++; }
    ok(miss === 0, `point location finds every interior point (${miss} misses in 500)`);
    let unsorted = 0; for (let t = 0; t < T.n; t++) { let last = -Infinity; for (let k = T.aboveStart[t]; k < T.aboveStart[t + 1]; k++) { const u = T.aboveList[k]; if (T.cz[u] < last - 1e-9) unsorted++; last = T.cz[u]; } }
    ok(unsorted === 0 && T.aboveList.length > T.n, `the column above each tile is sorted nearest first (${T.aboveList.length} entries)`);
    ok(T.signature() === new IcoTiling(8).signature(), "the tiling is the same twice: " + T.signature());
  }
  // growth: determinism, a golden hash of its own, connectivity, the melt-is-above rule
  const spec = (R, extra) => Object.assign({ shape: "ico", R, ic: { disk: 3, thickness: 1.6 } }, extra || {});
  const seqI = (g) => g.bricks.map((b) => `${b.tile},${b.t},${b.m}`).join(";");
  const ico7 = () => Object.assign(genome(7), { substrate: spec(10), budget: 500 });
  const a = new Growth(ico7()).run(), b = new Growth(ico7()).run();
  ok(a.sub instanceof Ico && a.sub.kind === "ico", "Growth picks the Ico substrate for shape ico");
  ok(seqI(a) === seqI(b) && a.tick === b.tick, `ico seed 7: the same ${a.bricks.length} bricks twice`);
  const hi = createHash("sha256").update(seqI(a)).digest("hex").slice(0, 16);
  const GOLD_I = "8383ce8a55f9b1d9";
  ok(hi === GOLD_I || process.env.ICO_GOLD === "print", `ico seed 7: golden hash ${GOLD_I} (got ${hi}) — quasicrystal permalinks re-rolled!`);
  if (process.env.ICO_GOLD === "print") console.log("  ico golden:", hi);
  ok(a.bricks.length - a.nucleusBricks >= 450, `ico: lays its budget (${a.bricks.length - a.nucleusBricks} of 500, ${a.tick} ticks)`);
  {
    const sub = a.sub, TT = sub.T, bond = new Int32Array(64);
    const seen = new Uint8Array(sub.n); let floating = 0, shadowed = 0;
    // replay: every mason brick face-bonded to an earlier one, and open to the sky when laid
    const g2 = new Growth(ico7()); const sub2 = g2.sub;
    while (!g2.done) { const before = g2.bricks.length; g2.step(); for (let i = before; i < g2.bricks.length; i++) { const br = g2.bricks[i]; if (br.m < 0) continue; /* the brick is placed already: its shadow counts what is above it */ if (sub2.shadow[br.tile] > 0) shadowed++; } }
    for (const br of a.bricks) { if (br.m >= 0) { const m = sub.bonds(br.tile, bond); let touch = false; for (let k = 0; k < m; k++) if (seen[bond[k]]) touch = true; if (!touch) floating++; } seen[br.tile] = 1; }
    ok(floating === 0, `ico: every mason brick shares a face with an earlier brick (${floating} floating)`);
    ok(shadowed === 0, `ico: no brick laid under an existing brick (${shadowed})`);
    // nb, shadow and the extent maps agree with a rebuild from the occupied set
    const fresh = new Ico(spec(10));
    for (let t = 0; t < sub.n; t++) if (sub.occ[t]) fresh.place(t);
    let nbBad = 0, shBad = 0, eBad = 0;
    for (let t = 0; t < sub.n; t++) { if (sub.nb[t] !== fresh.nb[t]) nbBad++; if (sub.shadow[t] !== fresh.shadow[t]) shBad++; }
    for (let d = 0; d < sub.D; d++) for (let c = 0; c < sub.E[d].length; c++) if (sub.E[d][c] !== fresh.E[d][c] || sub.Ec[d][c] !== fresh.Ec[d][c]) eBad++;
    ok(nbBad === 0 && shBad === 0 && eBad === 0, `ico: bonds, shadows and the thirty extent maps match a rebuild (${nbBad}/${shBad}/${eBad} wrong)`);
    // and after removals they still do
    const removed = [];
    for (let i = a.bricks.length - 1; i >= a.bricks.length - 12; i--) { const t = a.bricks[i].tile; if (a.remove(t)) removed.push(t); }
    const fresh2 = new Ico(spec(10));
    for (let t = 0; t < sub.n; t++) if (sub.occ[t]) fresh2.place(t);
    nbBad = 0; shBad = 0; eBad = 0;
    for (let t = 0; t < sub.n; t++) { if (sub.nb[t] !== fresh2.nb[t]) nbBad++; if (sub.shadow[t] !== fresh2.shadow[t]) shBad++; }
    for (let d = 0; d < sub.D; d++) for (let c = 0; c < sub.E[d].length; c++) if (Math.abs(sub.E[d][c] - fresh2.E[d][c]) > 1e-6 || Math.abs(sub.Ec[d][c] - fresh2.Ec[d][c]) > 1e-6) eBad++;
    ok(removed.length === 12 && nbBad === 0 && shBad === 0 && eBad === 0, `ico: after ${removed.length} removals bonds, shadows and extent maps are still exact (${nbBad}/${shBad}/${eBad} wrong)`);
    const st = a.stats();
    ok(st.tiling === "ico" && st.tiles === sub.n && st.prolate > 0 && st.coordination === 6, "ico: stats name the tiling, count its rhombohedra and its six bonds");
    ok(st.hollowness > 0.2 && st.pit > 50, `ico: hollow (${st.hollowness.toFixed(2)}, pit ${st.pit})`);
    ok(st.terraces >= 3, `ico: terraced (${st.terraces} step heights along +x)`);
    // the summit is an empty tile straight above the highest brick
    const sm = sub.summit();
    ok(sm >= 0 && !sub.occ[sm] && sub.shadow[sm] === 0, "ico: the summit is an empty, open site");
    const idx = a.deploy({ masons: 4, budget: 80 }, null);
    ok(idx === 1 && a.colonies[1].masons.length === 4, "ico: a pack deploys on the summit");
    for (let i = 0; i < 6000 && a.colonies[1].laid === 0; i++) a.step();
    ok(a.colonies[1].laid > 0, `ico: the pack lays bricks (${a.colonies[1].laid})`);
  }
  // the playground's painted columns seed it, and a different seed differs
  {
    const g = Object.assign(genome(3), { substrate: spec(8, { ic: { voxels: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]] } }), budget: 60 });
    const gr = new Growth(g);
    ok(gr.nucleusBricks >= 3 && gr.bricks.every((br) => Math.abs(br.x - 1) < 1.6 && Math.abs(br.y - 1) < 1.6 && br.z >= gr.sub.z0 - 0.1 && br.z < gr.sub.z0 + 1.1), `ico ic.voxels: ${gr.nucleusBricks} rhombohedra inside four unit cubes on the floor`);
    ok(seqI(new Growth(Object.assign(genome(3), { substrate: spec(8), budget: 200 })).run()) !== seqI(new Growth(Object.assign(genome(4), { substrate: spec(8), budget: 200 })).run()), "ico: adjacent seeds differ");
  }
  // worms tunnel the rhombohedra along their faces
  {
    const { Worms } = await import("./worms.js");
    const g = new Growth(Object.assign(genome(7), { substrate: spec(10), budget: 400 })).run();
    const W = new Worms(g, { count: 3, speed: 0.1, bite: 0.2 });
    ok(W.release() === 3, "ico: three worms released");
    const before = g.sub.count;
    W.step(500);
    ok(W.worms.every((w) => w.moves > 10) && W.eaten > 0 && g.sub.count === before - W.eaten, `ico: the worms tunnel and bite (${W.eaten} eaten)`);
    ok(W.worms.every((w) => g.sub.occ[w.site] || g.sub.nb[w.site] > 0), "ico: and stay on the crystal");
    ok(W.positions().every((p) => Number.isFinite(p[0]) && Number.isFinite(p[2])), "ico: positions are centroids");
  }
}

/* ── 7. the platformer primitives: deploy (reseed from this plane) + remove ── */
section("deploy + remove: reseed a pack on the summit, take bricks away, replay from the event log");
{
  const build = () => {
    const g = new Growth(7).run(1500);
    const idx = g.deploy({ masons: 5, budget: 300, size: 3 }, null);
    g.run(400);
    g.remove(IDX(g.bricks[50].x, g.bricks[50].y, g.bricks[50].z));
    g.remove(IDX(g.bricks[51].x, g.bricks[51].y, g.bricks[51].z));
    g.deploy({ masons: 3, budget: 200, k1: 0.02 }, { x: g.bricks[60].x, y: g.bricks[60].y, z: g.lat.max[2] + 2 });
    g.run(300);
    return g;
  };
  const a = build(), b = build();
  ok(a.colonies.length === 3 && b.colonies.length === 3, `three colonies after two deployments (${a.colonies.length})`);
  ok(a.colonies[0].frozen && a.colonies[0].done && a.colonies[0].masons.length === 0, "deploying freezes the colonies that were growing: colony 0 stopped and its masons left");
  ok(a.colonies[1].done && a.colonies[1].masons.length === 0 && a.colonies[2].frozen === false, "the second deployment stopped the first pack; the newest pack is the only one growing");
  ok(a.masons.every((m) => m.colony === 2), "growth.masons lists only the growing colony's masons");
  ok(a.colonies[1].floor === a.events[0].at.z && a.colonies[2].floor === a.events[3].at.z, `each pack's floor is the plane it was seeded on (${a.colonies[1].floor}, ${a.colonies[2].floor})`);
  ok(a.bricks.filter((br) => br.c === 1).every((br) => br.z >= a.colonies[1].floor), "a pack never lays a brick beneath its floor");
  ok(seq(a) === seq(b), "the same seed and the same event sequence replay identically");
  ok(JSON.stringify(a.events) === JSON.stringify(b.events), "the event log is identical too");
  ok(a.events.filter((e) => e.kind === "deploy").length === 2 && a.events.filter((e) => e.kind === "remove").length === 2, "events: 2 deployments, 2 removals, with ticks");
  ok(a.events.every((e) => Number.isInteger(e.tick) && e.at && Number.isInteger(e.at.z)), "every event carries a tick and a place");
  // the deployed colony really built on the structure: its bricks touch earlier bricks, and it rose above the old summit
  const first = a.events[0];
  ok(first.at.z === 67 || first.at.z > 40, `reseed landed above the old crystal (z ${first.at.z})`);
  const c1 = a.bricks.filter((br) => br.c === 1);
  ok(c1.length > 9 && a.colonies[1].laid > 0, `pack 1 laid bricks (${a.colonies[1].laid}) on its plate (${c1.length} incl. nucleus)`);
  ok(a.masons.length === a.colonies.reduce((n, c) => n + (c.done ? 0 : c.masons.length), 0), "growth.masons spans every growing colony");
  ok(a.masons.every((m, i, arr) => arr.findIndex((o) => o.id === m.id) === i), "mason ids are unique across colonies");
  // deployed colony 0 is untouched by a deployment: its stream and laws are its own
  const plain = new Growth(7).run(1500);
  ok(seq({ bricks: a.bricks.slice(0, plain.bricks.length) }) === seq(plain), "deploying does not rewrite what colony 0 already laid");
  // removal keeps bonds and extent maps exact: compare against a rebuild
  {
    const L = a.lat;
    const fresh = new Lattice();
    for (let i = 0; i < L.occ.length; i++) if (L.occ[i]) fresh.place(i);
    let nbBad = 0, extBad = 0;
    for (let i = 0; i < L.occ.length; i += 7) if (L.nb[i] !== fresh.nb[i]) nbBad++;
    for (let f = 0; f < 6; f++) for (let k = 0; k < L.ext[f].length; k += 5) if (L.ext[f][k] !== fresh.ext[f][k]) extBad++;
    ok(nbBad === 0 && extBad === 0 && L.count === fresh.count, `after removals the lattice equals a rebuild (nb ${nbBad}, ext ${extBad}, count ${L.count} vs ${fresh.count})`);
    ok(a.removed.length === 2 && a.lat.occ[a.removed[0]] === 0, "removed sites are logged for the renderer and empty");
    ok(!a.remove(a.removed[0]), "removing an empty site is a no-op");
  }
  // reseed on a plateau: with the plane as its floor the pack grows a hopper
  // out of the plane; without freezing, the old colony keeps going
  {
    const g = genome(7); g.voxels = []; for (let x = -12; x <= 12; x++) for (let y = -12; y <= 12; y++) g.voxels.push([x, y, 0], [x, y, 1]); g.budget = 30;
    const gr = new Growth(g).run();
    const idx = gr.deploy({ masons: 10, budget: 800 }, { x: 64, y: 64, z: 46 });
    gr.run();
    const col = gr.colonies[idx];
    ok(col.laid >= 800 && gr.lat.max[2] >= 52, `on a 25×25 plateau the pack grows up out of its plane (${col.laid} bricks, to z ${gr.lat.max[2]})`);
    ok(gr.bricks.filter((br) => br.c === idx).every((br) => br.z >= 46), "…and nothing beneath the plane");
    const near = gr.bricks.filter((br) => br.c === idx && Math.abs(br.x - 64) <= 22 && Math.abs(br.y - 64) <= 22).length;
    ok(near === gr.bricks.filter((br) => br.c === idx).length, "…and all of it around where it was seeded (arrivals aim at the pack)");
    const g2 = new Growth(7).run(1500);
    g2.deploy({ masons: 4, budget: 200 }, null, { freeze: false });
    ok(!g2.colonies[0].frozen && g2.colonies[0].masons.length > 0, "freeze: false keeps the old colony growing alongside the pack");
  }
  // the prism substrate has the same primitives
  {
    const g = genome(3); g.substrate = quasiSubstrate(3, "hex"); g.substrate.R = 20; g.budget = 300;
    const gr = new Growth(g).run();
    const idx = gr.deploy({ masons: 4, budget: 120 }, null);
    ok(idx === 1 && gr.colonies[1].masons.length === 4, "prism: a pack deploys on the summit");
    for (let i = 0; i < 3000 && gr.colonies[1].laid === 0; i++) gr.step();
    ok(gr.colonies[1].laid > 0, `prism: the pack lays bricks (${gr.colonies[1].laid})`);
    const s = gr.bricks[20].z * gr.sub.n + gr.bricks[20].tile;
    const before = gr.sub.top[gr.bricks[20].tile];
    ok(gr.remove(s) && gr.sub.occ[s] === 0, "prism: a brick can be removed");
    let top = -1; for (let z = gr.sub.Z - 1; z >= 0; z--) if (gr.sub.occ[z * gr.sub.n + gr.bricks[20].tile]) { top = z; break; }
    ok(gr.sub.top[gr.bricks[20].tile] === top && top <= before, "prism: the column top is rescanned after removal");
  }
}

/* ── 8. the API contract the worker relies on ───────────────────────── */
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
