/* Naught's laws: noughts and crosses on (ℤ₃)ⁿ, where three cells are a line
   exactly when they sum to zero.
     node games/naught/test/naught.selftest.mjs   (~3 s) */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const G = await import(path.join(here, "../js/group.js"));
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/* ---- every page script parses as a module */
{
  let good = true;
  for (const f of fs.readdirSync(path.join(here, "../js"))) {
    const r = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: fs.readFileSync(path.join(here, "../js", f)), encoding: "utf8" });
    if (r.status !== 0) { good = false; console.error(f, r.stderr); }
  }
  ok(good, "every script in js/ parses as a module");
}

/* ---- lines are what they say: a, a + d, a + 2d with wrap, d ≠ 0, is exactly three cells summing to zero */
{
  let agree = true;
  for (const n of [1, 2, 3]) {
    const B = G.board(n), N = B.N, isAP = new Set();
    for (let a = 0; a < N; a++) for (let d = 1; d < N; d++) {
      const A = B.coords(a), Dd = B.coords(d), p = [0, 1, 2].map((t) => A.map((x, i) => (x + t * Dd[i]) % 3).reduce((s, x, i) => s + x * 3 ** i, 0));
      isAP.add([...p].sort((x, y) => x - y).join());
    }
    for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) for (let c = b + 1; c < N; c++)
      if (isAP.has([a, b, c].join()) !== G.isLine(B, a, b, c)) agree = false;
    if (isAP.size !== G.lineCount(n)) agree = false;
  }
  ok(agree, "for n = 1, 2, 3, the three-cell sets a, a+d, a+2d (wrapping, d ≠ 0) are exactly the triples that sum to zero, and there are 3ⁿ(3ⁿ − 1)/6 of them (12 lines on the 3 × 3 torus, 117 on the 3-torus)");
}
{
  let one = true;
  for (const n of [2, 3, 4]) {
    const B = G.board(n), N = B.N;
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
      const c = B.third[a * N + b];
      if (a === b ? c !== a : (c === a || c === b || !G.isLine(B, a, b, c) || B.third[a * N + c] !== b)) one = false;
    }
  }
  ok(one, "any two cells lie on exactly one line, and its third cell is −(a + b) (checked for every pair, n = 2 … 4)");
}

/* ---- caps: {0,1}ⁿ has no line; on the 3 × 3 torus the biggest cap is 4, so 5 marks always hold a line: no draws */
{
  let isCap = true;
  for (const n of [2, 3, 4, 5]) {
    const B = G.board(n), S = [];
    for (let c = 0; c < B.N; c++) if (B.coords(c).every((x) => x < 2)) S.push(c);
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) if (S.includes(B.third[S[i] * B.N + S[j]])) isCap = false;
  }
  const B = G.board(2);
  let biggest = 0;
  for (let m = 0; m < 512; m++) {
    const S = []; for (let c = 0; c < 9; c++) if (m >> c & 1) S.push(c);
    let cap = true; for (let i = 0; i < S.length && cap; i++) for (let j = i + 1; j < S.length; j++) if (S.includes(B.third[S[i] * 9 + S[j]])) { cap = false; break; }
    if (cap) biggest = Math.max(biggest, S.length);
  }
  const noDraws = G.CAP.every((c, n) => n < 2 || c < Math.ceil(3 ** n / 2));
  ok(isCap && biggest === G.CAP[2] && noDraws, "{0,1}ⁿ is a cap (no line) for n = 2 … 5; the largest cap on the 3 × 3 torus is " + biggest + " (all 512 subsets); and for n = 2 … 6 every cap is smaller than the first player's half of a full board, so there are no draws");
}

/* ---- the 3 × 3 torus is a first-player win (solved) */
{
  const memo = new Map();
  const solve = (g) => {        // +1 if the player to move can force a win, -1 if they lose, 0 draw
    const key = g.owner.join("") + g.turn;
    if (memo.has(key)) return memo.get(key);
    let best = -1;
    for (let c = 0; c < 9 && best < 1; c++) if (g.owner[c] === 0) {
      const h = new G.Game(2); h.owner.set(g.owner); h.marks = g.marks.map((m) => m.slice()); h.turn = g.turn; h.moves = g.moves;
      h.play(c);
      const v = h.winner === g.turn ? 1 : h.winner === 3 ? 0 : -solve(h);
      best = Math.max(best, v);
    }
    memo.set(key, best);
    return best;
  };
  ok(solve(new G.Game(2)) === 1, "solved: on the 3 × 3 torus the first player can force a win (" + memo.size + " positions)");
}

/* ---- the engine */
{
  let wins = true, blocks = true;
  for (let t = 0; t < 300; t++) {
    const n = 2 + (t % 3), g = new G.Game(n);
    // random play until someone has a threat
    for (let k = 0; k < 200 && !g.winner; k++) {
      const me = g.threats(g.turn), them = g.threats(3 - g.turn);
      if (me.size) { const c = G.choose(g, rnd); if (!me.has(c)) wins = false; break; }
      if (them.size === 1) { const c = G.choose(g, rnd); if (!them.has(c)) blocks = false; break; }
      g.play(G.choose(g, rnd, "random"));
    }
  }
  ok(wins && blocks, "the engine always takes a win when it has one, and always blocks a single threat");
  let won = 0, games = 0, endedRight = true;
  for (const n of [2, 3, 4]) for (let t = 0; t < 40; t++) {
    const g = new G.Game(n), engineIs = 1 + (t % 2);
    while (!g.winner) g.play(G.choose(g, rnd, g.turn === engineIs ? "sharp" : "random"));
    games++; if (g.winner === engineIs) won++;
    if (g.winner === 3 || !G.isLine(g.B, ...g.line) || !g.line.every((c) => g.owner[c] === g.winner)) endedRight = false;
  }
  ok(won / games > 0.95 && endedRight, "against a random player the engine wins " + won + " of " + games + " (n = 2 … 4, first and second), and every game ends on a real line of the winner's, never a draw");
  const e = new G.Game(6);
  const t0 = Date.now(); while (!e.winner) e.play(G.choose(e, rnd)); const ms = Date.now() - t0;
  ok(ms < 3000 && e.winner !== 3, "on the 6-torus (729 cells) engine against engine ends in " + e.moves + " moves, " + ms + " ms in all");
}

/* ---- making a line is a race: from n = 3 the first player wins by their fourth mark */
{
  let fast = true, worst = 0;
  for (const n of [3, 4, 5, 6]) for (let t = 0; t < 20; t++) {
    const g = new G.Game(n);
    while (!g.winner) g.play(G.choose(g, rnd));
    worst = Math.max(worst, g.moves);
    if (g.winner !== 1 || g.moves > 7) fast = false;
  }
  ok(fast, "making a line is a race: every pair of your marks is a threat, so from n = 3 to 6 the engine moving first wins against itself by move " + worst + " (its fourth mark), every time");
}

/* ---- avoiding one (misère) */
{
  const memo = new Map();
  const solve = (g) => {
    const key = g.owner.join("") + g.turn;
    if (memo.has(key)) return memo.get(key);
    let best = -1;
    for (let c = 0; c < 9 && best < 1; c++) if (g.owner[c] === 0) {
      const h = new G.Game(2, "avoid"); h.owner.set(g.owner); h.marks = g.marks.map((m) => m.slice()); h.turn = g.turn; h.moves = g.moves;
      h.play(c);
      const v = h.winner === g.turn ? 1 : h.winner === 3 - g.turn ? -1 : h.winner === 3 && h.rule !== "avoid" ? 0 : -solve(h);
      best = Math.max(best, v);
    }
    memo.set(key, best);
    return best;
  };
  const v = solve(new G.Game(2, "avoid"));
  let won = 0, games = 0, long = 0, always = true;
  for (const n of [2, 3, 4]) for (let t = 0; t < 40; t++) {
    const g = new G.Game(n, "avoid"), engineIs = 1 + (t % 2);
    while (!g.winner) g.play(G.choose(g, rnd, g.turn === engineIs ? "sharp" : "random"));
    games++; if (g.winner === engineIs) won++;
    long += g.moves;
    if (!g.line || g.owner[g.line[0]] === g.winner || !G.isLine(g.B, ...g.line)) always = false;
  }
  ok(always && won / games > 0.85, "avoiding a line: somebody always completes one of their own and loses (no draws); the engine beats a random player " + won + " of " + games + ", games running " + (long / games).toFixed(0) + " moves on average; on the 3 × 3 torus, solved, the " + (v > 0 ? "first" : "second") + " player wins");
  const g = new G.Game(5, "avoid");
  while (!g.winner) g.play(G.choose(g, rnd));
  ok(g.moves > 40, "avoiding a line on the 5-torus, engine against engine lasts " + g.moves + " moves: a long game, each side building a cap (the biggest possible is " + G.CAP[5] + ")");
}

console.log(fails ? `naught: ${fails} of ${checks} checks FAILED` : `naught: all ${checks} checks ok`);
process.exit(fails ? 1 : 0);
