/* Anabasis's laws: two downs, on little worlds (gravity takes you kata,
   only a ramp takes you ana); and every level solved walking, its par
   pinned, and each proved impossible without what it's about: the second
   down, its ramps, its crates, its wrap; and the generator's rooms, the
   same from the same seed, in band and proved the same way.
     node games/anabasis/test/anabasis.selftest.mjs   (< 1 s) */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const { parse, ACTIONS, World } = await import(path.join(here, "../../anakata/js/world.js"));
const { encode, decode } = await import(path.join(here, "../../anakata/js/gen.js"));
const { LEVELS } = await import(path.join(here, "../js/levels.js"));
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

/* ---- two downs, on little worlds */
const walk = (d) => ({ kind: "walk", d }), X = [1, 0, 0, 0], NX = [-1, 0, 0, 0];
const at = (w, s) => w.coords(s.p).join();
const two = (map, more) => parse(Object.assign({ name: "t", gravW: true, map }, more));
{
  const w = two(`
####  ####

####  ##..

####  @...`);
  let s = w.start;
  ok(at(w, s) === "0,0,1,2", "you start held: floor below, the wall kata of you");
  s = w.act(s, walk(X)); ok(at(w, s) === "1,0,1,2", "you walk along the wall kata of you");
  s = w.act(s, walk(X)); ok(at(w, s) === "2,0,1,1", "past its end you slip kata a slice, onto the next wall down");
  const flat = parse({ name: "t", map: `
####  ####

####  ##..

####  @...` });
  const f = flat.act(flat.act(flat.start, walk(X)), walk(X));
  ok(at(flat, f) === "2,0,1,2", "with z the only down, the same step stays in its slice");
}
{
  const w = two(`
####  #...

####  @...`);
  const n = w.act(w.start, walk(X));
  ok(n && n.dead, "off the kata end of the world you fall out, as off the bottom");
}
{
  const w = two(`
###  @..

###  #..`, { wrap: true });
  ok(at(w, w.start) === "0,0,1,0", "where w wraps, the last slice holds up the first");
  const n = w.act(w.start, walk(X));
  ok(n && n.dead, "round a wrapped w with nothing to land on, you fall for ever: lost");
}
{
  const w = two(`
####  ####

####  @#..

####  ....`);
  ok(w.act(w.start, walk(X)) === null, "a block in your slice stops you: you never climb in w, however clear it is a slice ana");
  const z = two(`
###  ###  ###

###  @#.  ...`);
  ok(at(z, z.act(z.start, walk(X))) === "1,0,2,1", "a step in z you still climb, held kata by what's beside it");
}
{
  const w = two(`
######  ######

##>###  @..###

######  ......`);
  let s = w.act(w.act(w.start, walk(X)), walk(X));
  ok(at(w, s) === "2,0,1,1", "you walk onto a ramp");
  s = w.act(s, walk(X));
  ok(s && at(w, s) === "3,0,1,2", "walking off it toward a wall, the ramp carries you a slice ana, round the wall: now kata of you, holding you up");
  ok(at(w, w.act(s, walk(NX))) === "2,0,1,1", "and back down it the other way");
}
{
  const ramp = two(`
#####  #####

#>...  @....

..>..  .....`);
  let s = ramp.act(ramp.act(ramp.start, walk(X)), walk(X));
  ok(at(ramp, s) === "2,0,1,2", "over a drop, the ramp carries you onto a ramp a slice ana");
  ok(ramp.resting(s, s.p, false), "and the ramp holds you there against w's gravity, with nothing kata of you");
  const floor = two(`
#####  #####

#>...  @....

..#..  .....`);
  s = floor.act(floor.act(floor.start, walk(X)), walk(X));
  ok(s && s.dead, "plain floor there doesn't hold you: you slip back kata, into the drop you were carried over");
}
{
  const w = two(`
#####  #####

#####  ###..

#####  @C...`);
  let s = w.act(w.start, walk(X));
  ok(s.crates.length === 1 && w.coords(s.crates[0]).join() === "2,0,1,2", "a crate rests where the wall kata holds it");
  s = w.act(s, walk(X));
  ok(s.crates.length === 1 && w.coords(s.crates[0]).join() === "3,0,1,1", "a crate past the wall's end falls kata too");
}

/* ---- the levels: solved walking (the only moves the page has), par pinned, proofs */
const PAR = { held: 5, slip: 6, around: 5, stair: 4, bridge: 6, plumb: 10, ascending: 11 };
const WALKING = (a) => a.kind === "walk";
ok(LEVELS.length === Object.keys(PAR).length, "every level has its par pinned");
for (const def of LEVELS) {
  const w = parse(def), sol = w.solve(WALKING);
  ok(w.gravW, `${def.name}: w is a down`);
  if (w.start.crates.length) ok(new World(Object.assign({}, w, { start: w.start.p, crates: [] })).solve(WALKING).moves === null, `${def.name}: impossible without its crates`);
  ok(sol.moves && sol.moves.length === PAR[def.name], `${def.name}: solved walking in par ${PAR[def.name]} (got ${sol.moves ? sol.moves.length : "none"})`);
  if (!sol.moves) continue;
  let s = w.start;
  for (const ai of sol.moves) s = w.act(s, ACTIONS[ai]);
  ok(w.won(s), `${def.name}: the solution replays to the goal`);
  const any = w.solve();
  ok(any.moves && any.moves.length === sol.moves.length, `${def.name}: nothing beats walking (the hook, which the page doesn't offer, saves nothing)`);
  if (def.needsDown) ok(parse(Object.assign({}, def, { gravW: false })).solve().moves === null, `${def.name}: impossible with z the only down (searched exhaustively)`);
  if (def.needsRamp) { w.rampsOff = true; ok(w.solve(WALKING).moves === null, `${def.name}: impossible without its ramps`); w.rampsOff = false; }
  if (def.wrap) ok(w.withWrap(false).solve(WALKING).moves === null, `${def.name}: impossible if w didn't wrap round`);
  const back = decode(encode(w));
  ok(back.gravW === true && back.wrap === !!def.wrap && back.solve(WALKING).moves.length === PAR[def.name], `${def.name}: its room code (${encode(w)[0]}…) opens the same room`);
}

/* ---- the generator: the same seed makes the same room; every room in band and proved */
{
  const G = await import(path.join(here, "../js/gen.js")), t0 = Date.now();
  ok(G.encode(G.generate(42, "medium").world) === G.encode(G.generate(42, "medium").world), "the same seed makes the same room");
  let rooms = 0, good = true, slow = 0;
  for (const tier of ["easy", "medium", "hard"]) for (let k = 1; k <= 8; k++) {
    const t = Date.now(), r = G.generate(k * 7919, tier); slow = Math.max(slow, Date.now() - t);
    if (!r) { good = false; console.error(`no ${tier} room from seed ${k * 7919}`); continue; }
    rooms++;
    const w = G.decode(G.encode(r.world)), T = G.TIERS[tier], sol = w.solve(WALKING, T.limit);
    const fail = (m) => { good = false; console.error(`${tier} ${k * 7919}: ${m}`); };
    if (!w.gravW) fail("its code lost w's gravity");
    if (!sol.moves || sol.moves.length !== r.par) fail(`par ${r.par}, but the code's room solves in ${sol.moves && sol.moves.length}`);
    if (r.par < T.len[0] || r.par > T.len[1]) fail(`par ${r.par} out of band`);
    w.rampsOff = true; if (w.solve(WALKING, T.limit).moves) fail("solvable without its ramps"); w.rampsOff = false;
    if (r.m.needsCrates && new World(Object.assign({}, w, { start: w.start.p, crates: [] })).solve(WALKING, T.limit).moves) fail("solvable without the crates it says it needs");
    if (r.m.ramps < T.minRamps || r.m.slips < T.minSlips) fail("too few ramps or slips");
  }
  ok(good && rooms === 24, `24 generated rooms (8 a tier): each solved at its par from its own code, in band, proved impossible without its ramps (and its crates, where it says)`);
  ok(slow < 3000, `a room builds in under 3 s (slowest ${slow} ms)`);
  if (process.env.VERBOSE) console.log("   generator checks in " + (Date.now() - t0) + " ms");
}

console.log(fails ? `\n✗ ${fails} of ${checks} anabasis checks failed` : `anabasis: ${checks} checks · ${LEVELS.length} levels, pars ${LEVELS.map((d) => PAR[d.name]).join(" ")}\n\n✓ anabasis selftest passed`);
process.exit(fails ? 1 : 0);
