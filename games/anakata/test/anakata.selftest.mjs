/* Anakata's laws: the rules, and every level solved, its par pinned, and the
   ones that need w proved impossible without it.
     node games/anakata/test/anakata.selftest.mjs   (< 1 s) */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const W = await import(path.join(here, "../js/world.js"));
const { LEVELS } = await import(path.join(here, "../js/levels.js"));
const { parse, isW, ACTIONS, RANGE } = W;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };

/* ---- every page script parses as a module */
{
  let good = true;
  for (const f of fs.readdirSync(path.join(here, "../js"))) {
    const r = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: fs.readFileSync(path.join(here, "../js", f)), encoding: "utf8" });
    if (r.status !== 0) { good = false; console.error(f, r.stderr); }
  }
  ok(good, "every script in js/ parses");
}

/* ---- the rules, on little worlds */
const walk = (d) => ({ kind: "walk", d }), hook = (d) => ({ kind: "hook", d });
const X = [1, 0, 0, 0], NX = [-1, 0, 0, 0], ANA = [0, 0, 0, 1], KATA = [0, 0, 0, -1];
const at = (w, s) => w.coords(s.p).join();
{
  const w = parse({ name: "t", map: `
#######  .@.#...  ...#...
#######  .......  .......` });
  let s = w.start;
  ok(at(w, s) === "1,0,1,0", "you start standing on the floor");
  s = w.act(s, walk(X)); ok(at(w, s) === "2,0,1,0", "you walk a cell");
  ok(w.act(s, walk(X)) === null, "a wall two high stops you");
  const t = parse({ name: "t", map: `
#######  .@#....  .......` });
  const s2 = t.act(t.start, walk(X)); ok(t.coords(s2.p).join() === "2,0,2,0", "a step one high you climb");
  const u = parse({ name: "t", map: `
###.###  ..@....` });
  const s3 = u.act(u.start, walk(X)); ok(s3.dead, "walk off the floor of the world and you fall out of it");
}
{
  const w = parse({ name: "t", map: `
#######  .@C....` });
  const s = w.act(w.start, walk(X)); ok(w.coords(s.crates[0]).join() === "3,0,1,0" && at(w, s) === "2,0,1,0", "you push a crate");
  const v = parse({ name: "t", map: `
###.###  .@C....` });
  const s2 = v.act(v.start, walk(X)); ok(s2.crates.length === 0, "a crate pushed over a hole falls out of the world");
}
{ // the hook
  const w = parse({ name: "t", map: `
#########  .@.....A.` });
  const s = w.act(w.start, hook(X)); ok(at(w, s) === "6,0,1,0", "an anchor pulls you to the cell before it");
  const far = parse({ name: "t", map: `
#########  @.......A` });
  ok(far.act(far.start, hook(X)) === null && RANGE === 6, "beyond " + RANGE + " cells the hook comes back empty");
  const c = parse({ name: "t", map: `
#########  .@....C..` });
  const s2 = c.act(c.start, hook(X)); ok(c.coords(s2.crates[0]).join() === "2,0,1,0" && at(c, s2) === "1,0,1,0", "a crate comes to you, to the cell next to you");
  const near = parse({ name: "t", map: `
#########  .@A......` });
  ok(near.act(near.start, hook(X)) === null, "an anchor right next to you is no use: the hook needs room");
  const wall = parse({ name: "t", map: `
#########  .@..#..A.` });
  ok(wall.act(wall.start, hook(X)) === null, "a wall in the way stops the hook");
}
{ // through w
  const w = parse({ name: "t", map: `
###  @..

###  ...

###  A..` });
  const s = w.act(w.start, hook(ANA)); ok(at(w, s) === "0,0,1,1", "hooked ana, you land in the slice before the anchor");
  ok(w.act(s, hook(KATA)) === null, "with nothing kata, the hook comes back");
  ok(w.act(w.start, walk(ANA)) === null || isW(walk(ANA)), "you never step in w");
  const c = parse({ name: "t", map: `
###  @..

###  ...

###  C..` });
  const s2 = c.act(c.start, hook(ANA)); ok(c.coords(s2.crates[0]).join() === "0,0,1,1", "a crate hooked from two slices off lands in the slice next to yours, where you stand");
  const fall = parse({ name: "t", map: `
###  @..

...  ...

###  A..` });
  ok(fall.act(fall.start, hook(ANA)).dead, "land in a slice with no floor under you and you fall out of the world");
}
{ // plates and doors
  const w = parse({ name: "t", map: `
#####  @.D.G
#P###  .....` });
  ok(!w.doorsOpen(w.start) && w.act(w.act(w.start, walk(X)), walk(X)) === null, "a door is shut while its plate is bare");
  let s = w.act(w.start, walk([0, 1, 0, 0])); s = w.act(s, walk(X));
  ok(w.doorsOpen(s), "standing on the plate opens it");
  const t = parse({ name: "t", map: `
###P###  .@C.D.G` });
  const s2 = t.act(t.start, walk(X));
  ok(!t.doorsOpen(t.start) && t.coords(s2.crates[0]).join() === "3,0,1,0" && t.doorsOpen(s2), "a crate left on the plate keeps the doors open");
}

/* ---- the levels */
const PAR = { reach: 1, fetch: 8, ana: 6, kata: 6, elsewhere: 15, plate: 5, relay: 17 };
{
  const names = new Set();
  for (const def of LEVELS) {
    const w = parse(def), sol = w.solve();
    names.add(def.name);
    ok(!!sol.moves, `${def.name}: solvable`);
    if (!sol.moves) continue;
    ok(sol.moves.length === PAR[def.name], `${def.name}: par ${sol.moves.length} (pinned ${PAR[def.name]})`);
    // replaying the solution through act() wins
    let s = w.start; for (const ai of sol.moves) s = w.act(s, ACTIONS[ai]);
    ok(w.won(s), `${def.name}: its solution replays to the goal`);
    const no = w.solve((a) => !isW(a));
    if (def.needsW) ok(!no.moves && sol.moves.some((ai) => isW(ACTIONS[ai])), `${def.name}: impossible without hooking along w (searched ${no.states} states)`);
    else ok(!!no.moves, `${def.name}: a 3D level, solvable without w`);
    ok(w.X * w.Y * w.Z * w.W <= 4096 && w.W <= 8, `${def.name}: small enough to draw (${w.X}×${w.Y}×${w.Z}×${w.W})`);
  }
  ok(names.size === LEVELS.length, "every level has its own name");
  ok(LEVELS.filter((d) => d.needsW).length >= 5, "most levels need the fourth dimension");
}

/* ---- the generator and the codes */
{
  const G = await import(path.join(here, "../js/gen.js"));
  const t0 = Date.now();
  // the codes: every level survives the round trip, cell for cell
  ok(LEVELS.every((def) => { const w = parse(def), c = G.encode(w), b = G.decode(c); return G.encode(b) === c && b.cells.every((v, i) => v === w.cells[i]) && b.start.p === w.start.p && b.start.crates.join() === w.start.crates.join(); }), "every level survives encode → decode cell for cell");
  let bad = 0; for (const junk of ["", "B1234AAAA", "A0000AA", "A7534", "A7534!!!!", "A7534AAAA"]) { try { G.decode(junk); } catch (e) { bad++; } }
  ok(bad === 6, "codes that aren't rooms are refused, not half-built");
  // rooms: same seed, same room; every one solvable, needing w (proved by the exact search), in its tier's band
  const rooms = [];
  for (const tier of ["easy", "medium", "hard"]) for (const seed of [11, 12, 13]) {
    const r = G.generate(seed, tier);
    if (!r) { ok(false, `${tier} ${seed}: a room`); continue; }
    rooms.push(r);
    const T = G.TIERS[tier], sol = r.world.solve(), flat = r.world.solve((a) => !isW(a), 2e6);
    const wh = sol.moves.filter((ai) => isW(ACTIONS[ai])).length;
    ok(sol.moves.length === r.par && r.par >= T.len[0] && r.par <= T.len[1] && wh >= T.minW, `${tier} ${seed}: par ${r.par}, ${wh} w-hooks, in the tier's band`);
    ok(!flat.moves, `${tier} ${seed}: impossible without w (an exhaustive search of ${flat.states} states)`);
    const again = G.generate(seed, tier);
    ok(G.encode(again.world) === G.encode(r.world), `${tier} ${seed}: the same seed makes the same room`);
    const back = G.decode(G.encode(r.world));
    ok(back.solve().moves.length === r.par, `${tier} ${seed}: its link opens a room with the same par`);
  }
  // the cheap proof never lies: wherever the exact search finds a way, the loose one does too
  let sound = true, tested = 0;
  for (const tier of ["easy", "medium", "hard"]) {
    const rnd = G.rng(99);
    for (let k = 0; k < 120; k++) {
      const c = G.candidate(rnd, G.TIERS[tier]); if (!c) continue;
      const w = new W.World(Object.assign({ name: "", hint: "" }, c));
      for (const allowW of [true, false]) {
        const ex = w.solve(allowW ? () => true : (a) => !isW(a), 30000);
        if (ex.moves) { tested++; if (!w.relaxedReach(allowW)) sound = false; }
      }
    }
  }
  ok(sound && tested > 20, `the loose search finds a way wherever the exact one does (${tested} solvable rooms, with and without w)`);
  if (process.env.VERBOSE) console.log("   generator checks in " + (Date.now() - t0) + " ms");
}

console.log(fails ? `\n✗ ${fails} of ${checks} anakata checks failed` : `anakata: ${checks} checks · ${LEVELS.length} levels, pars ${LEVELS.map((d) => PAR[d.name]).join(" ")}\n\n✓ anakata selftest passed`);
process.exit(fails ? 1 : 0);
