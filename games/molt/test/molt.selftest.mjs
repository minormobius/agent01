/* Molt's laws: a snake's body, as a word of turns, makes a world that is
   always a closed surface of squares (a sphere), the same size whatever its
   shape, with the bends' curvature where the cube corners say; and the game
   on it is classic snake that can dive into itself, level after level.
     node games/molt/test/molt.selftest.mjs   (~2 s) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const D = await import(path.join(here, "../js/duct.js"));
const { Game, M_ } = await import(path.join(here, "../js/game.js"));
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const C = D.D_.C;

/* ---- every page script parses as a module */
{
  const js = fs.readdirSync(path.join(here, "../js")).filter((f) => f.endsWith(".js"));
  const bad = js.filter((f) => spawnSync(process.execPath, ["--input-type=module", "--check"], { input: fs.readFileSync(path.join(here, "../js", f)) }).status !== 0);
  ok(js.length >= 4 && !bad.length, "every page script parses (" + js.length + " files" + (bad.length ? "; broken: " + bad.join(", ") : "") + ")");
}

/* ---- the world made from a body */
function check(M) {
  const c = D.census(M), L = M.L;
  let nbOk = true, faceOk = true;
  for (let x = 0; x < M.N; x++) {
    const ns = new Set();
    for (let s = 0; s < 4; s++) { const y = M.nb[x * 4 + s]; ns.add(y); if (y === x || M.nb[y * 4 + M.back[x * 4 + s]] !== x) nbOk = false; }
    if (ns.size !== 4) nbOk = false;
  }
  for (let f = 0; f < M.faces.length; f++) for (let s = 0; s < 4; s++) { const g = M.fn[f * 4 + s], t = M.fs[f * 4 + s]; if (M.fn[g * 4 + t] !== f || M.fs[g * 4 + t] !== s) faceOk = false; }
  const seen = new Uint8Array(M.N), q = [0]; seen[0] = 1;
  while (q.length) { const x = q.pop(); for (let s = 0; s < 4; s++) { const y = M.nb[x * 4 + s]; if (!seen[y]) { seen[y] = 1; q.push(y); } } }
  return { c, L, faces: M.faces.length === 4 * L + 2, cells: M.N === C * C * (4 * L + 2), nbOk, faceOk, connected: seen.every((v) => v) };
}
{
  const words = ["", "S", "L", "R", "LL", "RR", "LLL", "LLLL", "LLLLLLLL", "LRLRLR", "SLLSRRS"];
  for (let k = 0; k < 120; k++) { let w = ""; const n = (rnd() * 60) | 0; for (let i = 0; i < n; i++) w += (k % 2 && rnd() < 0.3 ? "UD"[(rnd() * 2) | 0] : "") + "SSLR"[(rnd() * 4) | 0]; words.push(w); }
  words.push("DSDSDS", "USUSUS", "DLURDLUR", "SSDSSDSSDSS");
  let all = true, sphere = true, curv = true, sizes = true, four = true, conn = true, worst = "";
  for (const w of words) {
    const r = check(D.buildDuct(w));
    if (!r.c.manifold) { all = false; worst = w; }
    if (r.c.chi !== 2) { sphere = false; worst = w; }
    if (r.c.defect !== 8) { curv = false; worst = w; }
    if (!r.faces || !r.cells) { sizes = false; worst = w; }
    if (!r.nbOk || !r.faceOk) { four = false; worst = w; }
    if (!r.connected) { conn = false; worst = w; }
  }
  ok(all, words.length + " bodies (random, half of them bending in 3D, and coils, spirals and rings that overlap themselves when laid out): every edge of every world joins exactly two faces" + (all ? "" : " — not " + worst));
  ok(sphere, "every world is a sphere: V − E + F = 2" + (sphere ? "" : " — not " + worst));
  ok(curv, "every world's curvature adds up to 720°: Σ(4 − squares at a corner) × 90° = 8 × 90°" + (curv ? "" : " — not " + worst));
  ok(sizes, "every body cube shows exactly 4 faces, so a body L long makes C²(4L + 2) cells whatever its shape" + (sizes ? "" : " — not " + worst));
  ok(four && conn, "every cell is a square with 4 different neighbours, each of which has it back; the world is all one piece");
}
{
  const S = D.census(D.buildDuct("SSSSSS")), T = D.census(D.buildDuct("SSLSS")), U = D.census(D.buildDuct("SLLS"));
  ok(S.hist[3] === 8 && !S.hist[5] && Object.keys(S.hist).every((k) => k === "3" || k === "4"), "a straight body: the only corners are the caps' 8 cube corners");
  ok(T.hist[3] === 10 && T.hist[5] === 2, "a single bend adds 2 corners where 3 squares meet (outside, +90° each) and 2 where 5 meet (inside, −90° each)");
  ok(U.hist[3] === 12 && U.hist[6] === 2, "a U-turn: 4 outside corners, and the two inside corners merge into one where 6 meet (−180°), top and bottom");
  const M = D.buildDuct("SSLSS"), turn = M.faces.filter((F) => F.k === 3).map((F) => F.d).sort().join(","), straight = M.faces.filter((F) => F.k === 1).map((F) => F.d).sort().join(",");
  ok(turn === "0,3,4,5" && straight === "2,3,4,5", "extra tiles on the wide end: the turning cube shows both outer walls (+x, −y) and no inner wall; a straight one shows both side walls");
}

/* ---- the rounded tube the player sees */
{
  const R = 0.38, corners = [[1, 0, 1, 1], [0, 1, 1, 1], [0, 0, 0, 1], [0, 0, 1, 0]];
  let crack = 0, flipped = 0, slotted = 0, cells = 0, worstW = "";
  const words = ["SSSS", "SSLSS", "SLLS", "SRRSLLS", "LRLRLRLR", "SSLLSSRRSS", "SDSSDSS", "SUSLSDSRS", "SSDSSSDSSSDSS"];
  for (let k = 0; k < 24; k++) { let w = ""; const n = 4 + ((rnd() * 30) | 0); for (let i = 0; i < n; i++) w += (k % 2 && rnd() < 0.25 ? "UD"[(rnd() * 2) | 0] : "") + "SSLR"[(rnd() * 4) | 0]; words.push(w); }
  let tangled = 0;
  for (const w of words) {
    const M = D.buildDuct(w), line = D.centreline(M), CC = C * C;
    // where the body, laid out, runs into itself (two cubes in one place) or lies against itself (a slot of zero width between two arms)
    const gapOf = (i, j) => Math.hypot(M.P[i][0] - M.P[j][0], M.P[i][1] - M.P[j][1], M.P[i][2] - M.P[j][2]), tangle = new Set(), slot = new Set();
    for (let i = 0; i < M.L; i++) for (let j = i + 3; j < M.L; j++) { const g = gapOf(i, j); if (g < 0.01) for (let d = -2; d <= 2; d++) { tangle.add(i + d); tangle.add(j + d); } else if (g < 1.01) { slot.add(i); slot.add(j); } }
    const inTangle = (c) => tangle.has(M.faces[(c / CC) | 0].k), inSlot = (c) => slot.has(M.faces[(c / CC) | 0].k);
    const rp = (c, u, v) => D.roundPoint(line, M.faces[(c / CC) | 0].k, D.cellPoint(M, c, u, v), R);
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    for (let c = 0; c < M.N; c++) {
      cells++;
      if (inTangle(c)) { tangled++; continue; }
      for (let s = 0; s < 4; s++) {
        const d = M.nb[c * 4 + s], t = M.back[c * 4 + s], [a1, b1, a2, b2] = corners[s], [e1, f1, e2, f2] = corners[t];
        const P = [rp(c, a1, b1)[0], rp(c, a2, b2)[0]], Q = [rp(d, e1, f1)[0], rp(d, e2, f2)[0]];
        const m = Math.min(Math.max(dist(P[0], Q[0]), dist(P[1], Q[1])), Math.max(dist(P[0], Q[1]), dist(P[1], Q[0])));
        if (m > crack && !inTangle(d)) { crack = m; worstW = w; }
      }
      // the cell's corners, in order round it, wind the same way as its outward normal
      const q = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => rp(c, u, v)[0]), n = rp(c, 0.5, 0.5)[1];
      const e1 = q.map((p, i) => q[(i + 1) % 4].map((x, j) => x - p[j]));
      let wind = [0, 0, 0];
      for (let i = 0; i < 4; i++) { const a = q[i], b2_ = q[(i + 1) % 4]; wind = [wind[0] + a[1] * b2_[2] - a[2] * b2_[1], wind[1] + a[2] * b2_[0] - a[0] * b2_[2], wind[2] + a[0] * b2_[1] - a[1] * b2_[0]]; }
      if (wind[0] * n[0] + wind[1] * n[1] + wind[2] * n[2] <= 0 && e1.length) { if (inSlot(c)) slotted++; else flipped++; }
    }
  }
  ok(crack < 1e-9, "the rounded tube is watertight on " + words.length + " bodies, flat and 3D: every edge two cells share lands on the same points from both sides" + (crack < 1e-9 ? "" : " — " + crack.toExponential(2) + " on " + worstW));
  ok(flipped === 0, "every rounded cell faces outward, except " + slotted + " in the zero-width slots where two arms of a body lie against each other (hidden there anyway), and " + tangled + " of " + cells + " where a random body, laid out, runs into itself; the page skips cells turned inside out" + (flipped ? " — " + flipped + " others don't" : ""));
}
{
  const g = new Game(3), M = g.world, F = M.faces[(g.head / (C * C)) | 0], ahead = M.nb[g.head * 4 + g.straight()];
  const a = D.cellPoint(M, g.head, 0.5, 0.5), b = D.cellPoint(M, ahead, 0.5, 0.5), cap = M.dout[M.L - 1];
  ok(F.k === M.L - 1 && F.d === M.upEnd && (cap === 0 ? b[0] < a[0] : cap === 1 ? b[0] > a[0] : cap === 2 ? b[1] < a[1] : b[1] > a[1]), "a world starts on top of its head end, crawling back towards the tail");
}

/* ---- the word read back from a snake */
{
  const M = D.buildDuct("SSSSSS"), CC = C * C, top = M.faces.findIndex((F) => F.k === 3 && F.d === 4);
  // on the top face (outward +z): a step in +x, then a turn towards +y, is a LEFT turn as seen from outside
  const near = (c, dir) => { const p = D.cellPoint(M, c, 0.5, 0.5); let best = -1, bd = -1; for (let s = 0; s < 4; s++) { const q = D.cellPoint(M, M.nb[c * 4 + s], 0.5, 0.5), v = [q[0] - p[0], q[1] - p[1]], m = Math.hypot(...v); const d = (v[0] * dir[0] + v[1] * dir[1]) / m; if (d > bd) { bd = d; best = M.nb[c * 4 + s]; } } return best; };
  const a = top * CC + 4, b = near(a, [1, 0]), c = near(b, [0, 1]), d = near(b, [0, -1]);
  ok(D.wordOf(M, [c, b, a]) === "L" && D.wordOf(M, [d, b, a]) === "R" && D.wordOf(M, [near(b, [1, 0]), b, a]) === "S", "turning anticlockwise as seen from outside reads as L, clockwise as R, on to the far side as S");
  // straight on comes back to where it started: round the tube after 4C cells, along the whole capsule (over both caps) after 2C(L + 1)
  const loop = (start, from) => { let x = start, n = 0; do { const sIn = D.sideTo(M, x, from), nx = M.nb[x * 4 + (sIn + 2) % 4]; from = x; x = nx; n++; } while (x !== start && n < 500); return n; };
  const round = loop(a, M.nb[a * 4 + 3]), along = loop(a, M.nb[a * 4 + 2]);
  ok(round === 4 * C && along === 2 * C * (M.L + 1), "straight on, you come back where you started: round the tube after " + round + " cells, along it and over both caps after " + along);
  // straight on round the tube, the body bends down over each of its four outside edges: D every third cell
  const walk = (start, from, n) => { const b = []; let y = start, f2 = from; for (let k = 0; k < n; k++) { b.unshift(y); const sIn = D.sideTo(M, y, f2), ny = M.nb[y * 4 + (sIn + 2) % 4]; f2 = y; y = ny; } return b; };
  const ringBody = walk(a, M.nb[a * 4 + 3], 12), ring = D.wordOf(M, ringBody), R = D.buildDuct(ring);
  const gap = Math.hypot(...[0, 1, 2].map((i) => R.P[R.L - 1][i] - R.P[0][i]));
  ok((ring.match(/D/g) || []).length === 3 && !/[LRU]/.test(ring) && gap === 1,
    "a snake wrapped straight round the tube reads " + ring + ": down over each edge it crossed (the fourth is under its head, which can't bend); its world is a ring whose two ends touch");
  const capWord = D.wordOf(M, walk(a, M.nb[a * 4 + 2], 30));
  ok((capWord.match(/D/g) || []).length >= 2 && !/[LRU]/.test(capWord), "a snake that went straight on over a cap reads " + capWord + ": a hook, bent down over the cap's edges");
  // into an inside corner: the inner walls of a bend meet at a concave edge, and crossing it reads U
  const B = D.buildDuct("SSLSS");
  let found = null;
  for (let x = 0; x < B.N && !found; x++) for (let s2 = 0; s2 < 4 && !found; s2++) if (D.fold(B, x, B.nb[x * 4 + s2]) < 0) found = [x, B.nb[x * 4 + s2], s2];
  let uWord = "";
  if (found) { const [x, y, s2] = found, before = B.nb[x * 4 + (s2 + 2) % 4], sIn = D.sideTo(B, y, x), after = B.nb[y * 4 + (sIn + 2) % 4]; uWord = D.wordOf(B, [after, y, x, before]); }
  ok(!!found && /^S?US$|^SUS$|^SU?S$/.test(uWord) && uWord.includes("U"), "crossing the inside corner of a bend reads " + uWord + ": U, up into it");
  const body = walk(top * CC + 1, M.nb[(top * CC + 1) * 4 + 2], 9), w = D.wordOf(M, body);
  ok(/^S+$/.test(w) && D.buildDuct(w).N === C * C * (4 * 9 + 2), "a straight 9-long snake along the top reads " + w + " and makes a " + C * C * 38 + "-cell world");
}

/* ---- the game, and diving into yourself */
function bot(g, wild) {
  const W = g.world, busy = new Set(g.pending ? g.body : g.body.slice(0, -1)), prev = new Map([[g.head, -1]]), q = [g.head];
  if (!wild || rnd() < 0.8) while (q.length) {
    const c = q.shift();
    if (g.food.has(c) && c !== g.head) { let x = c; while (prev.get(x) !== g.head) x = prev.get(x); for (let s = 0; s < 4; s++) if (W.nb[g.head * 4 + s] === x) { g.steer(s); return; } }
    for (let s = 0; s < 4; s++) { const n = W.nb[c * 4 + s]; if (!prev.has(n) && !busy.has(n)) { prev.set(n, c); q.push(n); } }
  }
  const free = [0, 1, 2, 3].filter((s) => !busy.has(W.nb[g.head * 4 + s]));
  if (free.length) g.steer(free[(rnd() * free.length) | 0]);
}
{
  let path = true, early = true, sizes = true, curv = true, deepest = 0, ticks = 0, neck = true;
  const made = [];
  for (let s = 1; s <= 6; s++) {
    const g = new Game(s * 7919);
    if (g.molt() !== null) early = false;
    for (let t = 0; t < 6000 && g.alive && g.depth < 5; t++) {
      const before = g.body.slice();
      bot(g, true); g.tick(); ticks++;
      if (!g.alive) break;
      if (g.body.length > 1 && g.body[0] === before[1]) neck = false;
      for (let k = 0; k + 1 < g.body.length; k++) if (D.sideTo(g.world, g.body[k], g.body[k + 1]) < 0) path = false;
      if (new Set(g.body).size !== g.body.length) path = false;
      if (g.body.length >= M_.MOLT_MIN + 4 + 2 * g.depth) {
        const pv = g.preview(), w = g.molt(), c = D.census(w);
        made.push(w.P.some((p, i) => w.P.some((q, j) => j > i + 2 && p[0] === q[0] && p[1] === q[1] && p[2] === q[2])));
        if (w.N !== pv.cells || w.word !== pv.word) sizes = false;
        if (c.chi !== 2 || c.defect !== 8) curv = false;
      }
    }
    deepest = Math.max(deepest, g.depth);
  }
  ok(early, "no molting before you're " + M_.MOLT_MIN + " long");
  ok(path && neck, ticks + " ticks of bot play: the body is always a path of distinct cells, each joint a shared edge, and the head never folds onto its neck");
  ok(sizes && curv, "every molt makes the world the preview promised, from the body's own word, and it's a sphere with 720° of curvature");
  ok(deepest >= 4, "bots dive " + deepest + " worlds deep (" + made.length + " worlds made by play; " + (100 * made.filter((x) => x).length / Math.max(1, made.length)).toFixed(0) + "% run into themselves somewhere when laid out)");
}
{
  const run = () => { const g = new Game(42); for (let t = 0; t < 800 && g.alive; t++) { if (t % 6 === 0) g.steer((t / 6) % 4); g.tick(); if (g.canMolt && t % 200 === 199) g.molt(); } return [g.ticks, g.score, g.depth, g.body.join()].join("|"); };
  ok(run() === run(), "deterministic: the same seed and the same steering play the same game");
}

console.log(fails ? `molt: ${fails} of ${checks} checks FAILED` : `molt: all ${checks} checks ok`);
process.exit(fails ? 1 : 0);
