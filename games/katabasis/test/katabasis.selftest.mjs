/* KATABASIS, checked: the flips are coupled quarter turns (rotations, every axis turned to a perpendicular
   one), each lands you on the wall it's named for, and together they reach every direction as up; the
   flip's ball holds the body however it's turned; the free view frame (turn, twist, tip, snap); every level's
   par is the fewest flips the solver finds,
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
const { Body, SPEED, TILT, turn, twist, tip, tidy, snap, flipUp } = await import(path.join(here, "../js/body.js"));
const { decorate } = await import(path.join(here, "../js/grotto.js"));
const G = await import(path.join(here, "../js/gen.js"));
const { advise } = await import(path.join(here, "../js/guide.js"));
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

/* the levels: par is the fewest flips; the flipping levels can't be walked; the turning ones can't be walked in
   the slice you start in; the w ones take more flips (or can't be done) without standing on a wall in w */
for (const L of LEVELS) {
  const lv = build(L), f = K.fewestFlips(lv), foot = K.solve(lv, { flips: false });
  ok(f && f.flips === L.par, `${L.name}: par ${L.par} is the fewest flips the solver finds (${f && f.flips})`);
  ok(L.par === 0 ? !!foot : !foot, `${L.name}: ${L.par === 0 ? "walkable" : "impossible on foot"}`);
  if (L.needs === "turning") ok(!K.solve(lv, { flips: false, steps: 4 }), `${L.name}: can't be walked in the slice you start in: you have to turn w into it`);
  if (L.needs === "w") { const nw = K.fewestFlips(lv, { noW: true }); ok(!nw || nw.flips > L.par, `${L.name}: without a wall in w under you it takes ${nw ? nw.flips + " flips" : "for ever"}, not ${L.par}`); }
}

/* the body, along the solver's par solutions: after every move it stands where the solver says, with the up the
   solver says, and at the end it's in the crystal, at par */
const DT = 1 / 60;
function settleBody(b) { for (let i = 0; i < 600; i++) { b.move(DT, [0, 0, 0, 0]); if (!b.flip && b.vy === 0 && b.grounded()) return true; } return false; }
const upOf = (o) => K.axisVec(K.ORIENTATIONS[o], 1).join();
function walkPar(name, lv, par) {
  const sol = K.fewestFlips(lv, { path: true }); if (!sol) { ok(false, `${name}: solvable`); return; }
  const b = new Body(lv.cave, lv.start.c, 0); settleBody(b);
  let c = K.settle(lv.cave, lv.start.c, 0), o = 0, good = true, why = "";
  for (const m of sol.path) {
    if (m.startsWith("step")) {
      const dir = +m.slice(4), O = K.ORIENTATIONS[o], ax = K.axisVec(O, K.STEPS[dir][0]).map((v) => v * K.STEPS[dir][1]), a = ax.findIndex((v) => v), next = K.step(lv.cave, c, o, dir);
      // walk the body one voxel that way: the last tick just reaches it
      for (let i = 0; i < 200; i++) { const left = next[a] - b.p[a]; if (Math.abs(left) < 1e-9) break; const dt = Math.min(DT, Math.abs(left) / SPEED); b.move(dt, ax.map((v) => v * SPEED)); }
      c = next;
    } else {
      const fname = m.slice(5), r = K.flipFrom(lv.cave, c, o, K.FLIP_NAMES.indexOf(fname)), why2 = b.tryFlipTo(K.axisVec(K.ORIENTATIONS[r.o], 1), fname);
      if (why2) { good = false; why = `the body may not flip to ${upOf(r.o)}: ${why2}`; break; }
      c = r.c; o = K.CANON[r.o];
    }
    settleBody(b);
    if (upOf(b.o) !== upOf(o) || b.p.some((v, i) => Math.abs(v - c[i]) > 1e-6)) { good = false; why = `after ${m} the body is at ${b.p.map((v) => +v.toFixed(3))} up ${upOf(b.o)}, the solver at ${c} up ${upOf(o)}`; break; }
  }
  ok(good && b.atGoal() && b.flips === par, `${name}: the game's body, on a par solution (${sol.path.length} moves, ${par} flips), stands where the solver says after every move and reaches the crystal${why ? " — " + why : ""}`);
}
for (const L of LEVELS) walkPar(L.name, build(L), L.par);

/* no room, no flip */
{
  const c = new K.Cave(10, 10, 10, 10); c.box([2, 1, 2, 2], [6, 7, 6, 6]); // a closet, 4 wide
  const b = new Body(c, [3, 1, 3, 3], 0); settleBody(b);
  ok(b.tryFlip("ahead") === "room" && !b.flip, "in a closet you can't flip: there's no room to turn");
}

/* the view frame: turning and twisting keep it a frame and never move up; a half turn swings w by twice the tilt;
   a flip's tip lands up exactly on its axis; and from any way of facing, the six flips name six walls, and the
   body lands on the one named */
{
  const dot = (a, b) => a.reduce((t, v, i) => t + v * b[i], 0), grid = () => ({ R: [1, 0, 0, 0], U: [0, 1, 0, 0], F: [0, 0, 1, 0], N: [0, 0, 0, 1] });
  const ortho = (fr) => { const v = [fr.R, fr.U, fr.F, fr.N]; let e = 0; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) e = Math.max(e, Math.abs(dot(v[i], v[j]) - (i === j ? 1 : 0))); return e; };
  let rs = 12345; const rnd = () => ((rs = (Math.imul(rs, 1103515245) + 12345) >>> 0) / 4294967296);
  let fr = grid(), worst = 0;
  for (let i = 0; i < 4000; i++) { fr = rnd() < 0.5 ? turn(fr, (rnd() - 0.5) * 0.3) : twist(fr, (rnd() - 0.5) * 0.3); if (i % 7 === 0) fr = tidy(fr); worst = Math.max(worst, ortho(fr)); }
  ok(worst < 1e-9 && fr.U.join() === "0,1,0,0", `4000 turns and twists: still a frame (worst ${worst.toExponential(1)}), and up hasn't moved`);
  const swing = (t) => { const h = turn(grid(), Math.PI, t); return (Math.acos(Math.abs(h.N[3])) * 180) / Math.PI; };
  ok(Math.abs(swing(Math.PI / 4) - 90) < 1e-6 && Math.abs(swing(Math.PI / 6) - 60) < 1e-6 && TILT === Math.PI / 4,
    `a half turn swings w by twice the tilt: 90° at 45° (the game's), 60° at 30°`);
  const back = turn(turn(grid(), Math.PI, TILT), Math.PI, TILT);
  ok(["R", "U", "F", "N"].every((k) => back[k].every((v, i) => Math.abs(v - grid()[k][i]) < 1e-9)), "a whole turn brings you back as you were");
  // tips, snaps and flips from 200 random ways of facing
  const open = new K.Cave(22, 22, 22, 22); open.box([1, 1, 1, 1], [21, 21, 21, 21]);
  let good = true, why = "";
  for (let n = 0; n < 200 && good; n++) {
    let g = grid(); for (let i = 0; i < 8; i++) g = tidy(rnd() < 0.5 ? turn(g, rnd() * 6.3) : twist(g, rnd() * 6.3));
    const sn = snap(g), axes = ["R", "F", "N"].map((k) => sn[k].findIndex((v) => v)), ups = K.FLIP_NAMES.map((nm) => flipUp(g, nm));
    if (new Set(axes).size !== 3 || axes.includes(1)) { good = false; why = "snap didn't give three different axes off up"; break; }
    if (new Set(ups.map((u) => u.join())).size !== 6 || ups.some((u) => u[1] !== 0 || Math.abs(u.reduce((a, b) => a + Math.abs(b), 0) - 1) > 0)) { good = false; why = "the six flips don't name six walls"; break; }
    const nm = K.FLIP_NAMES[n % 6], b = new Body(open, [9, 1, 9, 9], 0); settleBody(b);
    if (b.tryFlipTo(ups[n % 6], nm)) { good = false; why = `no room to flip ${nm} in an open cave`; break; }
    const pending = b.flip; settleBody(b);
    const after = tidy(tip(g, pending.U0, pending.U1, Math.PI / 2));
    if (K.axisVec(K.ORIENTATIONS[b.o], 1).join() !== ups[n % 6].join() || after.U.join() !== ups[n % 6].join() || ortho(after) > 1e-9) { good = false; why = `flip ${nm} landed with up ${K.axisVec(K.ORIENTATIONS[b.o], 1)}, the view's up ${after.U.map((v) => +v.toFixed(3))}, not ${ups[n % 6]}`; }
  }
  ok(good, `from 200 random ways of facing, the six flips name six different walls, and the body and the view both land with the named one under them${why ? " — " + why : ""}`);
}

/* made caves: the same seed makes the same cave; par is the tier's and the fewest flips, none on foot; a cave
   that says it needs a wall in w does; nothing within a voxel of the crystal is reachable sooner; and the
   game's body walks a par solution into the crystal */
for (const tier of G.TIER_NAMES) for (const seed of [7919, 5 * 7919]) {
  const g = G.generate(tier, seed), par = G.TIERS[tier], name = `made ${tier} ${seed}`;
  if (!g) { ok(false, `${name}: a cave`); continue; }
  const again = G.generate(tier, seed), same = again && again.cave.v.every((v, i) => v === g.cave.v[i]) && again.start.c.join() === g.start.c.join();
  const f = K.fewestFlips(g), foot = K.fewestFlips(g, { maxFlips: 0 }), nw = g.needs === "w" ? K.fewestFlips(g, { noW: true }) : null;
  const { touch } = G.reach(g.cave, g.start, { maxFlips: par }), [X, Y, Z, W] = g.cave.dims;
  let early = 0;
  for (let i = 0; i < g.cave.v.length; i++) {
    if (g.cave.v[i] !== 2) continue;
    const x = i % X, y = Math.floor(i / X) % Y, z = Math.floor(i / (X * Y)) % Z, w = Math.floor(i / (X * Y * Z));
    for (let dw = -1; dw <= 1; dw++) for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      if (g.cave.in(x + dx, y + dy, z + dz, w + dw) && touch[g.cave.idx(x + dx, y + dy, z + dz, w + dw)] < par) early++;
  }
  ok(same && g.par === par && f && f.flips === par && !foot && (g.needs !== "w" || !nw || nw.flips > par) && early === 0,
    `${name}: the same cave every time; par ${par} is the fewest flips (${f && f.flips}), none on foot${g.needs === "w" ? `, and it needs a wall in w (${nw ? nw.flips + " flips without" : "impossible without"})` : ""}; nothing near the crystal sooner${early ? ` (${early} voxels)` : ""}`);
  if (seed === 7919) walkPar(name, g, par);
}
ok(G.seedOf("katabasis 2026-10-23") === G.seedOf("katabasis 2026-10-23") && G.seedOf("katabasis 2026-10-23") !== G.seedOf("katabasis 2026-10-24"), "the daily seed is the date's, and changes with it");

/* the tactical guide: from the start it counts par; at the spot it names, the flip it names is one of the right
   ones there and leaves one fewer; and so on down to walking into the crystal */
function followGuide(name, lv, par) {
  let c = lv.start.c, o = 0, a = advise(lv.cave, c, o), steps = [a.flips], good = a.flips === par, why = "";
  while (good && a.flips > 0) {
    const oAt = K.ORIENTATIONS.findIndex((O) => K.axisVec(O, 1).join() === a.atUp.join()), at = advise(lv.cave, a.at, oAt);
    if (at.flips !== a.flips || !at.here.some((u) => u.join() === a.to.join())) { good = false; why = `at ${a.at} the guide doesn't stand by its own flip`; break; }
    const f = K.flipToward(oAt, a.to), l = K.flipFrom(lv.cave, a.at, oAt, f);
    if (!l) { good = false; why = `the named flip can't be made at ${a.at}`; break; }
    const b = advise(lv.cave, l.c, l.o); steps.push(b.flips);
    if (b.flips !== a.flips - 1) { good = false; why = `after it, ${b.flips} left, not ${a.flips - 1}`; break; }
    c = l.c; o = l.o; a = b;
  }
  ok(good && a.flips === 0, `${name}: the guide counts ${par} from the start, and each flip it names leaves one fewer (${steps.join(" → ")})${why ? " — " + why : ""}`);
}
for (const L of LEVELS) if (L.par > 0) followGuide(L.name, build(L), L.par);
for (const tier of G.TIER_NAMES) { const g = G.generate(tier, 7919); followGuide(`made ${tier} 7919`, g, g.par); }

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
