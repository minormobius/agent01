/* Anabasis's laws: two downs, on little worlds; and every level solved
   walking, its par pinned, and the ones that need the second down (or the
   wrap) proved impossible without it.
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
const walk = (d) => ({ kind: "walk", d }), X = [1, 0, 0, 0];
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
  const s = w.act(w.start, walk(X));
  ok(s && at(w, s) === "1,0,1,2", "a block too tall in z you climb ana, onto it in w");
  const t = two(`
####  ####

####  @#..

####  .#..`);
  ok(t.act(t.start, walk(X)) === null, "two slices high in w stops you, as two cells high in z does");
}
{
  const both = two(`
###  ###  ###

###  @#.  ...

###  ...  ...`);
  ok(at(both, both.act(both.start, walk(X))) === "1,0,2,1", "where both ways up hold you, you climb in z");
  const wOnly = two(`
###  ###  #.#

###  @#.  ...

###  ...  ...`);
  ok(at(wOnly, wOnly.act(wOnly.start, walk(X))) === "1,0,1,2", "where only ana holds you, you climb ana");
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
const PAR = { held: 5, slip: 6, ledge: 5, stair: 6, boost: 6, ascending: 11, hoist: 13, cairn: 19 };
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
  if (def.wrap) ok(w.withWrap(false).solve(WALKING).moves === null, `${def.name}: impossible if w didn't wrap round`);
  const back = decode(encode(w));
  ok(back.gravW === true && back.wrap === !!def.wrap && back.solve(WALKING).moves.length === PAR[def.name], `${def.name}: its room code (${encode(w)[0]}…) opens the same room`);
}

console.log(fails ? `\n✗ ${fails} of ${checks} anabasis checks failed` : `anabasis: ${checks} checks · ${LEVELS.length} levels, pars ${LEVELS.map((d) => PAR[d.name]).join(" ")}\n\n✓ anabasis selftest passed`);
process.exit(fails ? 1 : 0);
