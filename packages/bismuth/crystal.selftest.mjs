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
