/* Tessera's snake: the board's three shapes on a visible clock, the pinch
   that cuts, and the conservation that makes a cut fair — the snake's length
   before a pinch is its length after plus the pellets it drops.
     node games/tessera/test/snake.selftest.mjs   (~2 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const { Game, G_, CYCLE } = await import(path.join(here, "../js/snake.js"));
const { T_ } = await import(path.join(here, "../js/tiling.js"));
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };

/* a player: of the moves that don't bite, the one that leaves the most room (a flood fill), then the one nearest the food */
function room(g, from, busy) {
  const seen = new Set([from]), q = [from];
  while (q.length && seen.size < 60) { const c = q.shift(); for (const n of g.options(c)) if (!busy.has(n.nb) && !seen.has(n.nb)) { seen.add(n.nb); q.push(n.nb); } }
  return seen.size;
}
function bot(g, wild) {
  const o = g.options(g.body[0]), k = Math.max(0, o.findIndex((n) => n.dx === g.heading[0] && n.dy === g.heading[1]));
  const [fx, fy] = g.T.xy(g.food >= 0 ? g.food : g.body[0]);
  const dist = (i) => { const [x, y] = g.T.xy(i); return Math.min(Math.abs(x - fx), g.T.W - Math.abs(x - fx)) + Math.min(Math.abs(y - fy), g.T.H - Math.abs(y - fy)); };
  const busy = new Set(g.pending ? g.body : g.body.slice(0, -1));   // a growing tail stays put
  const c = [0, 1, -1].map((d) => ({ d, i: o[(k + d + o.length) % o.length].nb })).filter((c) => !busy.has(c.i));
  if (!c.length) return;
  for (const m of c) m.room = Math.min(room(g, m.i, busy), g.body.length + 8);
  c.sort((a, b) => b.room - a.room || dist(a.i) - dist(b.i));
  const pick = wild && g.rnd() < 0.25 ? c.filter((m) => m.room === c[0].room)[(g.rnd() * 9) | 0 % 1] || c[0] : c[0];
  if (pick.d) g.turn(pick.d);
}

const starve = (g) => { g.spawn = () => { g.food = -1; }; g.food = -1; return g; };   // no food: the snake stays short and the bot can run all day

/* ---- the clock: three shapes, each held for HOLD ticks, the change in one tick */
{
  const g = starve(new Game(12, 10, 5)), seen = [];
  let changes = 0, gaps = new Set(), last = 0;
  for (let t = 0; t < G_.HOLD * 8; t++) {
    const before = g.shape;
    bot(g); g.tick();
    if (!g.alive) break;
    if (g.shape !== before) { changes++; seen.push(g.shape); gaps.add(g.ticks - last); last = g.ticks; }
  }
  ok(seen.slice(0, 4).join() === [-1, 0, 1, 0].join() && new Set(seen).size === 3, "the board cycles squares → hexagons ↘ → squares → hexagons ↗ (" + seen.slice(0, 5).join(", ") + " …)");
  ok(changes >= 7 && gaps.size === 1 && gaps.has(G_.HOLD), "every shape holds for exactly " + G_.HOLD + " ticks (" + (G_.HOLD * G_.TICK / 1000).toFixed(1) + " s), and the change is one tick");
}

/* ---- what the player sees: a closing wall reaches zero length at the pinch, an opening one grows from zero */
{
  const g = starve(new Game(12, 10, 9));
  let pinchOk = 0, joinOk = 0, bad = 0;
  for (let t = 0; t < G_.HOLD * 8; t++) {
    if (g.clock === 1 && g.pinchNext) { if (Math.abs(g.drawnSplit(0)) === T_.HMAX && Math.abs(g.drawnSplit(0.999999)) < 1e-5) pinchOk++; else bad++; }
    bot(g); g.tick(); if (!g.alive) break;
    if (g.clock === G_.HOLD && g.shape !== 0) { if (g.drawnSplit(0) === 0 && Math.abs(g.drawnSplit(1)) === T_.HMAX) joinOk++; else bad++; }
  }
  ok(pinchOk >= 2 && joinOk >= 2 && !bad, "the drawn wall shrinks to nothing in the tick before each pinch (" + pinchOk + ") and grows from nothing in the tick after each join (" + joinOk + ")");
}

/* ---- many games: the body is always a path on the current board, and a pinch conserves the snake */
{
  let ticks = 0, games = 0, cuts = 0, path = true, neck = true, legal = true, conserved = true, onlyPinch = true, diagOnly = true, fair = true;
  for (let s = 1; ticks < 40000; s++) {
    const g = new Game(s % 2 ? 16 : 12, s % 3 ? 12 : 14, s * 7919);
    games++;
    for (let t = 0; t < 2500 && g.alive; t++) {
      const before = g.body.slice(), wasPinch = g.clock === 1 && g.pinchNext, risk = g.pinchNext ? g.atRisk() : [];
      const pelletsBefore = g.pellets.size;
      bot(g, true); g.tick(); ticks++;
      if (!g.alive) break;
      const cut = g.events.find((e) => e.kind === "cut");
      if (cut) {
        cuts++;
        if (!wasPinch) onlyPinch = false;
        // the cut falls exactly at the first joint that was at risk; length is conserved through it
        const at = before.length - cut.n;
        if (risk[0] !== at - 1) diagOnly = false;
        // the snake then moved one step: head added, tail dropped (or not, if growing)
        if (before.length !== at + cut.n || cut.cells.some((c, j) => c !== before[at + j])) conserved = false;
        if (g.pellets.size < pelletsBefore + cut.n - 1) fair = false;
      }
      for (let k = 0; k + 1 < g.body.length; k++) if (!g.link(g.body[k + 1], g.body[k])) path = false;
      if (new Set(g.body).size !== g.body.length) path = false;
      if (g.body.length > 1 && g.body[0] === before[1]) neck = false;
      if (!g.options(g.body[0]).some((n) => n.dx === g.heading[0] && n.dy === g.heading[1])) legal = false;
    }
  }
  ok(cuts > 100, games + " games, " + ticks + " ticks, " + cuts + " cuts");
  ok(path, "after every tick the body is a path of distinct cells, each joint a wall shared on the current board");
  ok(onlyPinch, "only a pinch cuts: joins and holds never do");
  ok(diagOnly, "the cut falls at the first joint that was shown at risk");
  ok(conserved && fair, "a pinch conserves the snake: length before = length kept + pellets dropped, cell for cell");
  ok(neck, "the head never folds back onto its neck");
  ok(legal, "the heading is always a step that exists on the current board");
}

/* ---- a heading the board takes away falls to the nearest step, the way the snake has been going */
{
  const g = new Game(12, 10, 3);
  while (g.shape === 0) g.tick();                              // to hexagons
  const diag = g.options(g.body[0]).find((n) => n.dx && n.dy);
  g.heading = [diag.dx, diag.dy]; g.trend = [[diag.dx, 0], [diag.dx, 0], [diag.dx, diag.dy]];
  g.body = [g.body[0], g.T.idx(...g.T.xy(g.body[0]).map((v, j) => v - (j ? 0 : diag.dx)))];
  while (g.shape !== 0) { g.heading = [diag.dx, diag.dy]; g.queue = []; if (g.clock === 1) { g.tick(); break; } g.clock = 1; }
  ok(g.heading[0] === diag.dx && g.heading[1] === 0, "a diagonal heading on a pinch falls to the axis the snake was travelling (" + diag.dx + "," + diag.dy + " → " + g.heading + ")");
}

/* ---- the same seed and the same turns play the same game */
{
  const run = () => { const g = new Game(12, 10, 42); for (let t = 0; t < 600 && g.alive; t++) { if (t % 7 === 0) g.turn(t % 14 ? 1 : -1); g.tick(); } return [g.ticks, g.score, g.body.join(), [...g.pellets.keys()].join()].join("|"); };
  ok(run() === run(), "deterministic: the same seed and turns give the same game");
}

/* ---- the torus view borrows Orb's TorusCam (../orb/js/torus.js): the parts of it the page leans on */
{
  await import(path.join(here, "../../orb/js/torus.js"));
  const cam = new globalThis.ORB.TorusCam({ W: 24, H: 10, n: 240 });
  let worst = 0;
  for (const [u, v] of [[3.5, 4.5], [17.2, 0.3], [23.9, 9.9]]) {
    cam.toward(u, v, 1);
    const s = cam.sweet(), e = cam.embed(u, v);
    const du = s[0] - u - 24 * Math.round((s[0] - u) / 24), dv = s[1] - v - 10 * Math.round((s[1] - v) / 10);
    worst = Math.max(worst, Math.abs(du), Math.abs(dv), Math.abs(e.X), Math.abs(1 - e.face));
  }
  const k = cam.scale(800, 600), o = cam.origin(800, 600);
  ok(worst < 1e-9 && k > 0 && Math.abs(o[0]) < 1e-9, "Orb's TorusCam brings any point of the board to the front, facing the camera squarely (the head's place)");
}

/* ---- the score records: what the board will read back, and what it refuses */
{
  const S = await import(path.join(here, "../js/score.js"));
  ok(S.FOOD_PTS === G_.FOOD_PTS && G_.PELLET_PTS <= S.FOOD_PTS, "the board's ceiling (" + S.FOOD_PTS + " points a step) is what food is actually worth");
  const a = S.dailySeed("2026-10-16"), b = S.dailySeed("2026-10-17");
  ok(a === S.dailySeed("2026-10-16") && a !== b && a >= 1 && a < 2147483647 && S.dailyId("2026-10-16") === "daily-" + S.VERSION + "-2026-10-16",
    "the daily seed is the same for everyone on a date and new the next day (" + a + ", " + b + ")");
  const good = { site: "tessera", game: S.dailyId("2026-10-16"), value: 120, unit: "points", higherIsBetter: true, detail: S.detail({ seed: a, steps: 300, longest: 30, cuts: 2 }), createdAt: "2026-10-16T12:00:00Z" };
  const bad = [{ ...good, site: "orb" }, { ...good, game: "daily-v0-2026-10-16" }, { ...good, game: "open" }, { ...good, higherIsBetter: false }, { ...good, unit: "ms" },
    { ...good, value: 0 }, { ...good, value: 12.5 }, { ...good, value: 1501 }, { ...good, detail: "seed=1" }, { ...good, createdAt: "nope" }];
  ok(S.accept(good) && S.accept({ ...good, game: S.OPEN, value: 1500 }) && bad.every((v) => !S.accept(v)),
    "the board reads back a daily or open score, and refuses another site's, another version's, a time, a zero, a fraction, more points than steps allow, no steps, a bad date");
  let within = true;
  for (let s = 1; s <= 30; s++) { const g = new Game(24, 10, s * 104729); for (let t = 0; t < 3000 && g.alive; t++) { bot(g, true); g.tick(); } if (g.score > S.FOOD_PTS * g.ticks) within = false; }
  ok(within, "no played game scores more than the ceiling the board enforces");
}

console.log(fails ? `snake: ${fails} of ${checks} checks FAILED` : `snake: all ${checks} checks ok`);
process.exit(fails ? 1 : 0);
