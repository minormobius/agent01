/* KATABASIS, checked: the flips are coupled quarter turns (rotations, every axis turned to a perpendicular
   one), each lands you on the wall it's named for, and together they reach every direction as up; the
   flip's ball holds the body however it's turned; every level's par is the fewest flips the solver finds,
   and the levels that are about flipping can't be done on foot; and the game's own continuous body, driven
   along the solver's solution, lands where the solver says after every move and finds the crystal at par.
     node games/katabasis/test/katabasis.selftest.mjs   (~30 s) */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const K = await import(path.join(here, "../js/cave.js"));
const { LEVELS, build } = await import(path.join(here, "../js/levels.js"));
const { Body, SPEED } = await import(path.join(here, "../js/body.js"));
const { decorate } = await import(path.join(here, "../js/grotto.js"));
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

{
  let good = true;
  for (const f of fs.readdirSync(path.join(here, "../js"))) {
    const r = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: fs.readFileSync(path.join(here, "../js", f)), encoding: "utf8" });
    if (r.status !== 0) { good = false; console.error(f, r.stderr); }
  }
  ok(good, "every script in js/ parses");
}

/* the flips */
{
  const det = (m) => { const d3 = (a) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]); let d = 0; for (let c = 0; c < 4; c++) d += (c % 2 ? -1 : 1) * m[0][c] * d3([1, 2, 3].map((r) => m[r].filter((_, j) => j !== c))); return d; };
  const frame = (o) => [0, 1, 2, 3].map((b) => K.axisVec(o, b));
  ok(K.ORIENTATIONS.every((o) => det(frame(o)) === 1), `every orientation the flips reach is a rotation (${K.ORIENTATIONS.length} of them)`);
  const iso = K.ORIENTATIONS.every((o, i) => K.FLIP_NAMES.every((_, f) => { const a = frame(o), b = frame(K.ORIENTATIONS[K.FLIP_TO[i][f]]); return a.every((v, k) => dot(v, b[k]) === 0); }));
  ok(iso, "every flip turns every one of your axes to a perpendicular one: a quarter turn at full coupling, twice over");
  const want = { ahead: [2, 1], behind: [2, -1], right: [0, 1], left: [0, -1], ana: [3, 1], kata: [3, -1] }; let named = true;
  for (let i = 0; i < K.ORIENTATIONS.length; i++) for (const [n, [b, sg]] of Object.entries(want)) {
    const o = K.ORIENTATIONS[i], o2 = K.ORIENTATIONS[K.FLIP_TO[i][K.FLIP_NAMES.indexOf(n)]], wall = K.axisVec(o, b).map((v) => v * sg), down = K.axisVec(o2, 1).map((v) => -v);
    if (dot(wall, down) !== 1) named = false;
  }
  ok(named, "from every orientation, each flip makes the wall it's named for your floor");
  ok(new Set(K.ORIENTATIONS.map((o) => o[1].join())).size === 8, "the flips can make any of the 8 directions of the cave your up");
  ok(Math.abs(K.FLIP_R - Math.hypot(...K.BODY.map((v) => v / 2))) < 1e-12, "the flip's ball is the body's half-diagonal: it holds the body however it's turned");
}

/* the ball check: a rock voxel inside the ball is found, one just outside isn't */
{
  const c = new K.Cave(12, 12, 12, 12); c.box([1, 1, 1, 1], [11, 11, 11, 11]); const p = [6, 6, 6, 6];
  ok(c.ballClear(p, K.FLIP_R), "an open room has room to flip");
  c.set(8, 6, 6, 6, 1); ok(!c.ballClear(p, K.FLIP_R), "a voxel 2 away is in the way");
  c.set(8, 6, 6, 6, 0); c.set(8, 8, 8, 6, 1); ok(c.ballClear(p, K.FLIP_R), "a voxel whose nearest corner is 2√3 > the radius away isn't");
}

/* the levels: par is the fewest flips; the flipping levels can't be walked */
for (const L of LEVELS) {
  const lv = build(L), f = K.fewestFlips(lv), foot = K.solve(lv, { flips: false });
  ok(f && f.flips === L.par, `${L.name}: par ${L.par} is the fewest flips the solver finds (${f && f.flips})`);
  ok(L.par === 0 ? !!foot : !foot, `${L.name}: ${L.par === 0 ? "walkable" : "impossible on foot"}`);
}

/* the body, along the solver's solutions: after every move it stands where the solver says, and at the end
   it's in the crystal */
const DT = 1 / 60;
function settleBody(b) { for (let i = 0; i < 600; i++) { b.move(DT, [0, 0, 0, 0]); if (!b.flip && b.vy === 0 && b.grounded()) return true; } return false; }
for (const L of LEVELS) {
  const lv = build(L), sol = K.solve(lv); if (!sol) { ok(false, `${L.name}: solvable`); continue; }
  const b = new Body(lv.cave, lv.start.c, 0); settleBody(b);
  let c = K.settle(lv.cave, lv.start.c, 0), o = 0, good = true, why = "";
  for (const m of sol.path) {
    if (m.startsWith("step")) {
      const dir = +m.slice(4), O = K.ORIENTATIONS[o], ax = K.axisVec(O, K.STEPS[dir][0]).map((v) => v * K.STEPS[dir][1]), a = ax.findIndex((v) => v), next = K.step(lv.cave, c, o, dir);
      // walk the body one voxel that way: the last tick just reaches it
      for (let i = 0; i < 200; i++) { const left = next[a] - b.p[a]; if (Math.abs(left) < 1e-9) break; const dt = Math.min(DT, Math.abs(left) / SPEED); b.move(dt, ax.map((v) => v * SPEED)); }
      c = next;
    } else {
      const name = m.slice(5), r = K.flipFrom(lv.cave, c, o, K.FLIP_NAMES.indexOf(name)), why2 = b.tryFlip(name);
      if (why2) { good = false; why = `the body may not flip ${name}: ${why2}`; break; }
      c = r.c; o = r.o;
    }
    settleBody(b);
    if (b.o !== o || b.p.some((v, i) => Math.abs(v - c[i]) > 1e-6)) { good = false; why = `after ${m} the body is at ${b.p.map((v) => +v.toFixed(3))} (${b.o}), the solver at ${c} (${o})`; break; }
  }
  ok(good && b.atGoal() && b.flips === sol.flips, `${L.name}: the game's body, on the solver's solution (${sol.path.length} moves, ${sol.flips} flips), stands where the solver says after every move and reaches the crystal${why ? " — " + why : ""}`);
}

/* no room, no flip */
{
  const c = new K.Cave(10, 10, 10, 10); c.box([2, 1, 2, 2], [6, 7, 6, 6]); // a closet, 4 wide
  const b = new Body(c, [3, 1, 3, 3], 0); settleBody(b);
  ok(b.tryFlip("ahead") === "room" && !b.flip, "in a closet you can't flip: there's no room to turn");
}

/* the grotto dresses the cave and changes nothing: its lights hang in open air, apart, and decoration lies only on rock */
for (const [li, L] of LEVELS.entries()) {
  const lv = build(L), before = Uint8Array.from(lv.cave.v), g = decorate(lv.cave, li * 97 + 13);
  const air = g.lights.every((l) => l.goal || lv.cave.at(...l.p.map(Math.floor)) === 0);
  const apart = g.lights.every((a, i) => g.lights.every((b, j) => j <= i || a.goal || b.goal || Math.hypot(...a.p.map((v, k) => v - b.p[k])) >= 5));
  const onRock = g.deco.every((d, i) => !d || lv.cave.v[i] === 1), same = lv.cave.v.every((v, i) => v === before[i]);
  ok(g.lights.length > 8 && g.lights.filter((l) => l.goal).length === 1 && air && apart && onRock && same,
    `${L.name}: the grotto hangs ${g.lights.length} lights in open air, 5 voxels apart, one of them the crystal; decoration only on rock, and the cave unchanged`);
}

console.log(fails ? `\n✗ ${fails} of ${checks} katabasis checks failed` : `katabasis: ${checks} checks\n\n✓ katabasis selftest passed`);
process.exit(fails ? 1 : 0);
