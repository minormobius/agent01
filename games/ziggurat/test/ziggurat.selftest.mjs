/* Ziggurat's laws: the pile, its slices, the hops, the rules, the enemies,
   and a player that can clear it; the board's record checks.
     node games/ziggurat/test/ziggurat.selftest.mjs   (~5 s) */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const Zg = await import(path.join(here, "../js/zig.js"));
const SC = await import(path.join(here, "../js/score.js"));
const { Game, Z, DIRS, cells, inBoard, add, keyOf, depth, autopilot, rule, sideFor, roundBonus } = Zg;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };
const tet = (n) => (n * (n + 1) * (n + 2)) / 6;

/* ---- every page script parses as a module */
{
  let good = true;
  for (const f of fs.readdirSync(path.join(here, "../js"))) {
    const r = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: fs.readFileSync(path.join(here, "../js", f)), encoding: "utf8" });
    if (r.status !== 0) { good = false; console.error(f, r.stderr); }
  }
  ok(good, "every script in js/ parses");
}

/* ---- the pile and its slices */
for (const N of [1, 2, 4, 5, 6, 7]) {
  const all = cells(N);
  ok(all.length === tet(N) && new Set(all.map(keyOf)).size === all.length && all.every((p) => inBoard(N, p)), `side ${N}: ${tet(N)} distinct cubes, all on the pile`);
  ok(all.every((p, i) => i === 0 || depth(all[i - 1]) <= depth(p)), `side ${N}: listed summit first, a layer at a time`);
  for (let s = 0; s < 3; s++) {
    // slicing along any axis gives pyramids of every size N … 1, each a triangle
    const by = new Map();
    for (const p of all) by.set(p[s], (by.get(p[s]) || 0) + 1);
    let tri = true; for (let k = 0; k < N; k++) tri = tri && by.get(k) === ((N - k) * (N - k + 1)) / 2;
    ok(tri, `side ${N}, sliced along ${"abc"[s]}: pyramids of ${N} … 1 rows`);
  }
  // every hop changes the depth by exactly one; a hop off the pile is a fall
  let hopsOk = true, edge = 0;
  for (const p of all) for (const d of DIRS) { const q = add(p, d); if (Math.abs(depth(q) - depth(p)) !== 1) hopsOk = false; if (!inBoard(N, q)) edge++; }
  ok(hopsOk && edge > 0, `side ${N}: every hop is one step up or down`);
}
// a hop along the slicing axis lands on the same spot of the next pyramid
{
  const N = 5; let same = true;
  for (const p of cells(N)) for (let s = 0; s < 3; s++) { const q = add(p, DIRS[2 * s]); if (inBoard(N, q)) same = same && q[(s + 1) % 3] === p[(s + 1) % 3] && q[(s + 2) % 3] === p[(s + 2) % 3] && q[s] === p[s] + 1; }
  ok(same, "a hop across is the same (u, v) on the next pyramid");
}

/* ---- the colour rules */
{
  const seen = [1, 2, 3, 4, 5].map((lv) => rule(lv));
  ok(seen[0].stages === 1 && !seen[0].toggle && seen[1].stages === 2 && !seen[1].toggle && seen[2].stages === 1 && seen[2].toggle && seen[3].stages === 2 && seen[3].toggle, "level 1 one hop, 2 two hops, 3 one hop that toggles, 4+ two that toggle");
  const g = new Game(3);
  const p = [1, 0, 0]; g.colourAt(p); ok(g.top.get(keyOf(p)) === 1 && g.score === Z.PTS.colour && g.left === tet(5) - 1, "a landing finishes a cube on level 1, for 25");
  g.colourAt(p); ok(g.top.get(keyOf(p)) === 1 && g.score === Z.PTS.colour, "landing on a finished cube does nothing on level 1");
  g.rule = rule(3); g.colourAt(p); ok(g.top.get(keyOf(p)) === 0 && g.left === tet(5), "level 3: landing on a finished cube undoes it");
  // clearing a round pays its bonus and moves on
  const h = new Game(4); for (const c of h.all) h.colourAt(c);
  ok(h.state === "clear" && h.score === tet(5) * Z.PTS.colour + roundBonus(0), "every cube finished clears the round, with its bonus");
  h.update(Z.CLEAR + 40); ok(h.round === 2 && h.state === "play" && h.left === tet(5), "and the next round starts fresh");
}

/* ---- hops, falls and discs */
{
  const g = new Game(9); g.nextSpawn = 1e12;
  g.move(0); g.update(Z.HOP + 20); ok(g.hero.p.join() === "1,0,0" && g.stats.hops === 1, "a hop lands a cell deeper");
  g.move(3); g.update(Z.HOP + 20); ok(g.lives === Z.LIVES - 1 && g.state === "dying", "a hop off the pile is a fall, and a life");
  g.update(Z.DEATH + 40); ok(g.state === "play" && g.hero.p.join() === "0,0,0", "after a fall you start again at the summit");
  // a disc carries you home, and a coil right behind you follows you off it
  const k = new Game(11); k.nextSpawn = 1e12;
  const dsc = k.discs[0], d = DIRS.findIndex((v) => inBoard(k.N, add(dsc.p, v.map((x) => -x))) && v.some((x) => x < 0));
  const from = add(dsc.p, DIRS[d].map((x) => -x));
  k.hero.p = from;
  const coilAt = DIRS.map((v) => add(from, v)).find((q) => inBoard(k.N, q) && q.join() !== dsc.p.join() && Zg.l1(q, dsc.p) === 2);
  k.enemies = [{ kind: "coil", p: coilAt, mv: null, next: k.now, fall: null }];
  k.move(d); k.update(Z.HOP + 20);
  ok(k.hero.mv && k.hero.mv.ride && dsc.used, "a hop onto a disc rides it");
  const before = k.score; k.update(Z.RIDE);
  ok(k.stats.lures === 1 && k.score - before >= Z.PTS.lure && k.hero.p.join() === "0,0,0" && k.lives === Z.LIVES, "the coil follows you off the disc: +500, and you land on the summit");
}

/* ---- enemies */
{
  const g = new Game(12); g.nextSpawn = 1e12;
  g.hero.p = [1, 0, 0];
  g.enemies = [{ kind: "red", p: [0, 0, 0], mv: { from: [0, 0, 0], to: [1, 0, 0], t0: g.now, dur: 300 }, next: 1e12, fall: null }];
  g.update(320); ok(g.state === "dying" && g.cause === "hit", "a red ball landing on you costs a life");
  const s = new Game(13); s.nextSpawn = 1e12; s.colourAt([1, 0, 0]); s.hero.p = [0, 0, 1];
  s.enemies = [{ kind: "slick", p: [0, 0, 0], mv: { from: [0, 0, 0], to: [1, 0, 0], t0: s.now, dur: 300 }, next: 1e12, fall: null }];
  s.update(320); ok(s.top.get(keyOf([1, 0, 0])) === 0 && s.left === tet(5), "the cyan one undoes the cube it lands on");
  s.hero.p = [1, 0, 0]; s.update(40); ok(s.stats.catches === 1 && s.enemies.length === 0 && s.state === "play", "and catching it is worth points, not a life");
  const e = new Game(14); e.nextSpawn = 1e12; e.hero.p = [0, 0, 0];
  e.enemies = [{ kind: "egg", p: [4, 0, 0], mv: null, next: 0, fall: null }]; e.update(40);
  ok(e.enemies[0].kind === "coil", "a purple ball at the bottom hatches the coil");
}

/* ---- a player who can play: the autopilot, many seeds */
const runs = [];
{
  const t0 = Date.now();
  for (let seed = 1; seed <= 10; seed++) {
    const g = new Game(seed); let t = 0;
    while (!g.over && t < 25 * 60000) { g.update(20); t += 20; if (!g.hero.mv) { const d = autopilot(g); if (d != null) g.move(d); } g.events.length = 0; }
    runs.push({ seed, over: g.over, r: g.result(), level: g.level });
  }
  ok(runs.every((x) => x.over), "every game ends");
  const cleared = runs.map((x) => x.r.cleared);
  ok(Math.min(...cleared) >= 2 && Math.max(...cleared) >= 8, `the pile can be cleared, and it gets hard: rounds cleared ${cleared.join(" ")}`);
  ok(runs.some((x) => x.level >= 3), "the pile grows to side 6 by level 3, and the autopilot gets there");
  if (process.env.VERBOSE) console.log("   bot runs in " + (Date.now() - t0) + " ms");
  // same seed, same play: same game
  const a = new Game(77), b = new Game(77);
  for (const g of [a, b]) for (let t = 0; t < 120000 && !g.over; t += 20) { g.update(20); if (!g.hero.mv) { const d = autopilot(g); if (d != null) g.move(d); } }
  ok(a.score === b.score && a.stats.hops === b.stats.hops && a.now === b.now, "the same seed and the same moves give the same game");
}

/* ---- the board's records */
{
  ok(SC.ROUNDS === Z.ROUNDS && SC.DISCS === Z.DISCS && SC.BONUS0 === Z.BONUS0 && SC.BONUS_STEP === Z.BONUS_STEP && JSON.stringify(SC.PTS) === JSON.stringify(Z.PTS), "score.js's constants are the game's");
  let same = true; for (let lv = 1; lv <= 12; lv++) same = same && SC.sideFor(lv) === sideFor(lv) && SC.stagesFor(lv) === rule(lv).stages;
  ok(same, "score.js's pile sizes and colour rules are the game's");
  const rec = (r, over) => Object.assign({ $type: "com.minomobi.lab.score", site: "ziggurat", game: SC.GAME, createdAt: new Date().toISOString() }, SC.record(r), over || {});
  ok(runs.every((x) => SC.accept(rec(x.r))), "every real run's record is accepted");
  const r = runs.find((x) => x.r.cleared >= 3).r;
  const bad = [
    ["another site", rec(r, { site: "molt" })], ["another version", rec(r, { game: "score-v0" })], ["another unit", rec(r, { unit: "cubes" })],
    ["lower is better", rec(r, { higherIsBetter: false })], ["a bad date", rec(r, { createdAt: "soon" })], ["no value", rec(r, { value: 0 })],
    ["more points than it could earn", rec(r, { value: r.value * 3 })],
    ["fewer than the bonuses it must have", rec(Object.assign({}, r, { value: 10 }))],
    ["a level and round that don't fit what it cleared", rec(Object.assign({}, r, { cleared: r.cleared + 1 }))],
    ["rounds cleared in too few hops", rec(Object.assign({}, r, { hops: 30 }))],
    ["more coils lured than discs", rec(Object.assign({}, r, { lures: 2 * (r.cleared + 1) + 1 }))],
    ["no seed", rec(r, { detail: SC.detail(r).replace(/ seed=\d+/, "") })],
  ];
  for (const [what, v] of bad) ok(!SC.accept(v), "refused: " + what);
}

console.log(fails ? `\n✗ ${fails} of ${checks} ziggurat checks failed` : `ziggurat: ${checks} checks · bot runs reached level ${runs.map((x) => x.level).join(" ")}\n\n✓ ziggurat selftest passed`);
process.exit(fails ? 1 : 0);
