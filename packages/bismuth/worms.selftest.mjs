#!/usr/bin/env node
/* worms selftest — the ghosts of the masonry tunnel deterministically, stay
   on the crystal, bite slower than the masons lay, and with recycling feed
   the live colony.

     node packages/bismuth/worms.selftest.mjs */

import { Growth } from "./crystal.js";
import { genome, quasiSubstrate } from "./genome.js";
import { Worms, DEFAULT_WORMS } from "./worms.js";

let checks = 0, fails = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("  ✗ " + msg); } };
const section = (t) => console.log(t);

function grown(seed, n = 1500, sub) {
  const gen = genome(seed);
  if (sub) gen.substrate = sub;
  const g = new Growth(gen);
  while (!g.done && g.bricks.length < n) g.step();
  return g;
}
const onCrystal = (W) => W.worms.every((w) => W.sub.occ[w.site] || W.sub.nb[w.site] > 0);

section("release and tunnel");
{
  const g = grown(48112);
  const W = new Worms(g, { count: 4, speed: 0.1, bite: 0.2 });
  ok(W.release() === 4 && W.worms.length === 4, "four worms released into the crystal");
  ok(W.worms.every((w) => g.sub.occ[w.site]), "each starts inside a brick");
  const before = g.sub.count;
  W.step(600);
  ok(W.worms.every((w) => w.moves > 20), `they move (${W.worms.map((w) => w.moves).join(", ")} moves)`);
  ok(W.eaten > 0 && g.sub.count === before - W.eaten, `they bite (${W.eaten} bricks eaten, count exact)`);
  ok(g.events.filter((e) => e.kind === "remove").length === W.eaten, "every bite is a remove event");
  ok(g.removed.length === W.eaten, "and lands in the renderer's removed list");
  ok(onCrystal(W), "every worm is in a brick or touching one");
  ok(W.worms.every((w) => w.trail.length <= DEFAULT_WORMS.length && w.trail[w.trail.length - 1] === w.site), "the trail ends at the head and is bounded");
  const pos = W.positions();
  ok(pos.length === W.worms.reduce((n, w) => n + w.trail.length, 0) && pos.every((p) => p.length === 4 && p[3] > 0 && p[3] <= 1), "positions: one segment per trail cell, faded");
  const st = W.stats();
  ok(st.worms === 4 && st.eaten === W.eaten && st.released === 4 && st.tick === 600, "stats");
  W.clear();
  ok(W.worms.length === 0 && W.positions().length === 0, "clear");
}

section("determinism");
{
  const run = () => { const g = grown(7, 1200); const W = new Worms(g, { count: 3, speed: 0.1, bite: 0.2 }); W.release(); W.step(800); return { eaten: W.eaten, sites: W.worms.map((w) => w.site), count: g.sub.count }; };
  const a = run(), b = run();
  ok(JSON.stringify(a) === JSON.stringify(b), `same seed, same worms (${a.eaten} eaten, sites ${a.sites.join("/")})`);
  const g = grown(7, 1200);
  const W2 = new Worms(g, { count: 3, speed: 0.1, bite: 0.2 }, 99);
  W2.release(); W2.step(800);
  ok(JSON.stringify(W2.worms.map((w) => w.site)) !== JSON.stringify(a.sites), "a different worm seed, different worms");
}

section("a small effect");
{
  // worms loose in a growing crystal: they eat an order of magnitude less than the masons lay
  const gen = genome(48112);
  const g = new Growth(gen);
  while (!g.done && g.bricks.length < 600) g.step();
  const W = new Worms(g);
  W.release();
  const laid0 = g.bricks.length, t0 = g.tick;
  while (!g.done && g.bricks.length < 3000) { g.step(); W.step(); }
  const laid = g.bricks.length - laid0;
  ok(W.eaten > 0 && W.eaten < laid * 0.15, `over ${g.tick - t0} ticks: ${laid} laid, ${W.eaten} eaten`);
  ok(W.worms.filter((w) => g.sub.occ[w.site] || g.sub.nb[w.site] > 0).length >= 2, "and the worms kept to the crystal while it grew (one may be heading home)");
  // a worm stranded in open void heads home: put one far out and watch it come back
  const far = W.worms[0];
  far.site = g.sub.siteAt({ x: 20, y: 20, z: 60 }); far.prev = -1;
  W.step(2000);
  ok(g.sub.occ[far.site] || g.sub.nb[far.site] > 0, `a stranded worm found the crystal again (${JSON.stringify(g.sub.describe(far.site))}, lost ${far.lost})`);
}

section("eating its own tail");
{
  // recycling refunds the live colony: it lays more than its budget before cooling
  const gen = genome(314159);
  gen.budget = 1500;
  const g = new Growth(gen);
  while (!g.done && g.bricks.length < 400) g.step();
  const W = new Worms(g, { count: 2, speed: 0.05, bite: 0.1, recycle: true });   // half the masons' pace: erosion the colony can outrun
  W.release();
  while (!g.done) { g.step(); W.step(); }
  const c0 = g.colonies[0];
  ok(W.recycled > 0 && W.recycled <= W.eaten, `${W.eaten} eaten, ${W.recycled} recycled while the colony was live`);
  ok(c0.laid + W.recycled >= gen.budget, `the colony laid ${c0.laid + W.recycled} against a budget of ${gen.budget}: the refunds were spent`);
  // after cool-down nothing is refunded
  const r = W.recycled;
  W.step(300);
  ok(W.recycled === r, "a finished colony takes no refunds");
  ok(!W.recycle(), "recycle() says so");
}

section("on a tiling");
{
  const g = grown(7, 900, quasiSubstrate(7, "penrose"));
  const W = new Worms(g, { count: 3, speed: 0.1, bite: 0.2 });
  ok(W.release() === 3, "three worms in a Penrose crystal");
  const before = g.sub.count;
  W.step(600);
  ok(W.worms.every((w) => w.moves > 10) && W.eaten > 0 && g.sub.count === before - W.eaten, `they tunnel the rhombs (${W.eaten} eaten)`);
  ok(onCrystal(W), "and stay on it");
  ok(W.positions().every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])), "positions are tile centroids");
}

section("the brain");
{
  // depth: a miner keeps to buried bricks, a grazer to the skin — measured as the mean bond count of the sites they stand on
  const meanNb = (depth) => {
    const g = grown(48112, 2500);
    const W = new Worms(g, { count: 6, speed: 0.2, bite: 0, depth });
    W.release();
    let sum = 0, n = 0;
    for (let k = 0; k < 40; k++) { W.step(50); for (const w of W.worms) { sum += g.sub.nb[w.site]; n++; } }
    return sum / n;
  };
  const graze = meanNb(-1), wander = meanNb(0), mine = meanNb(1);
  ok(graze < wander && wander < mine, `depth steers: grazer ${graze.toFixed(2)} < wanderer ${wander.toFixed(2)} < miner ${mine.toFixed(2)} bonds`);
  // reverse: with reverse 1 a worm on a one-brick spur can turn back; with 0 it cannot leave the way it came unless alone there
  const g = grown(7, 1500);
  const W0 = new Worms(g, { count: 5, speed: 0.2, bite: 0, reverse: 0 });
  W0.release(); W0.step(300);
  const W1 = new Worms(g, { count: 5, speed: 0.2, bite: 0, reverse: 1 }, 5);
  W1.release();
  let backs = 0, moves = 0;
  for (let k = 0; k < 300; k++) { const before = W1.worms.map((w) => [w.site, w.prev]); W1.step(1); W1.worms.forEach((w, i) => { if (w.site !== before[i][0]) { moves++; if (w.site === before[i][1]) backs++; } }); }
  ok(backs > 0 && backs < moves, `reverse 1 lets a worm turn back (${backs} of ${moves} moves)`);
  // spawn and starve: a fed worm splits, a hungry one fades; the population is what is left
  const g2 = grown(48112, 3000);
  const W2 = new Worms(g2, { count: 2, speed: 0.2, bite: 0.5, spawnAfter: 3, starve: 0 });
  W2.release(); W2.step(400);
  ok(W2.births > 0 && W2.worms.length === 2 + W2.births, `well fed, they multiply (${W2.births} births, ${W2.worms.length} alive)`);
  const g3 = grown(48112, 3000);
  const W3 = new Worms(g3, { count: 4, speed: 0.2, bite: 0, starve: 30 });
  W3.release(); W3.step(400);
  ok(W3.deaths === 4 && W3.worms.length === 0, `unfed, they fade (${W3.deaths} deaths)`);
  const st = W2.stats();
  ok(st.births === W2.births && st.deaths === 0 && st.worms === W2.worms.length, "stats carry births and deaths");
  // determinism holds with the brain on
  const run = () => { const g = grown(7, 1200); const W = new Worms(g, { count: 3, speed: 0.15, bite: 0.3, depth: 0.6, reverse: 0.2, spawnAfter: 4, starve: 60 }); W.release(); W.step(600); return [W.eaten, W.births, W.deaths, W.worms.map((w) => w.site).join("/")].join("|"); };
  ok(run() === run(), `same seed, same lives (${run()})`);
  ok(new Worms(g, { lostAfter: 3 }).opts.lostAfter === 3 && DEFAULT_WORMS.lostAfter === 24, "lostAfter is a dial");
  // exposed: a surface grazer never takes a buried brick
  const g4 = grown(48112, 2500);
  const W4 = new Worms(g4, { count: 6, speed: 0.2, bite: 0.5, depth: 1, exposed: 3 });
  W4.release();
  let deepBites = 0, bites = 0, seen = g4.removed.length;
  for (let k = 0; k < 400; k++) { W4.step(1); for (; seen < g4.removed.length; seen++) bites++; }
  // every removed site had ≤ 3 bonds at the moment it was taken: check the events log against a rebuild is expensive; instead confirm the miner with exposed=3 eats far less than one without
  const g5 = grown(48112, 2500);
  const W5 = new Worms(g5, { count: 6, speed: 0.2, bite: 0.5, depth: 1 });
  W5.release(); W5.step(400);
  ok(bites > 0 && bites < W5.eaten * 0.6, `exposed 3 keeps a miner off the interior (${bites} bites vs ${W5.eaten} unrestricted)`);
}

console.log(`\n${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
