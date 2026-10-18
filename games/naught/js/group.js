/* Naught — noughts and crosses on (ℤ₃)ⁿ, the n-dimensional torus of 3ⁿ
   cells. No DOM; the page is js/game.js.

   A cell is n coordinates, each 0, 1 or 2, added with wrap-around (2 + 1 =
   0). A LINE is three cells a, a + d, a + 2d for some direction d ≠ 0,
   wrapping as it goes: the torus's straight lines, diagonals of every kind
   included. Because 3 is prime that is one rule:

       three distinct cells are a line exactly when they sum to zero

   (coordinate by coordinate, mod 3). So any two cells lie on exactly one
   line, and its third cell is −(a + b): the THIRD table below. Everything
   (wins, threats, the engine, the cap puzzle) is lookups in it.

   Since every pair of your marks is a threat, MAKING a line is a race the
   first player wins at once: from n = 3 on, by their fourth mark (two
   threats come at once, and only one can be blocked). So there are two
   games, set by `rule`:
     make    complete a line of your own and you win (the classic)
     avoid   complete a line of your own and you LOSE (misère): every mark
             you place forbids you the third cell of each pair it makes, so
             each player is building a cap under pressure, and whoever runs
             out of safe cells first loses

   A CAP is a set of cells with no line in it. The biggest caps are known
   for n ≤ 6 (CAP); since each is less than half the board from n = 2 on,
   a full board always holds a line for the first player: there are no
   draws. */

/* the largest cap in (ℤ₃)ⁿ, n = 0 … 6 (n = 6: Potechin, 2008) */
export const CAP = [1, 2, 4, 9, 20, 45, 112];

const boards = new Map();
/* the board for n: its size, each cell's coordinates, and the third cell of every pair */
export function board(n) {
  if (boards.has(n)) return boards.get(n);
  const N = 3 ** n, dig = new Uint8Array(N * n);
  for (let c = 0; c < N; c++) for (let i = 0, x = c; i < n; i++, x = (x / 3) | 0) dig[c * n + i] = x % 3;
  const pow = Array.from({ length: n }, (_, i) => 3 ** i), third = new Int16Array(N * N);
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
    let c = 0;
    for (let i = 0; i < n; i++) c += ((6 - dig[a * n + i] - dig[b * n + i]) % 3) * pow[i];
    third[a * N + b] = c;
  }
  const B = { n, N, dig, third, coords: (c) => Array.from(dig.subarray(c * n, c * n + n)) };
  boards.set(n, B);
  return B;
}
export const isLine = (B, a, b, c) => a !== b && b !== c && a !== c && B.third[a * B.N + b] === c;
export const lineCount = (n) => (3 ** n * (3 ** n - 1)) / 6;

/* ---- a game: owner[c] is 0 (empty), 1 (X, who moves first) or 2 (O) */
export class Game {
  constructor(n, rule = "make") { this.B = board(n); this.n = n; this.rule = rule; this.owner = new Uint8Array(this.B.N); this.marks = [[], [], []]; this.turn = 1; this.winner = 0; this.line = null; this.moves = 0; }
  empty(c) { return this.owner[c] === 0; }
  /* the cells that would complete a line for player p, each with the pair it completes */
  threats(p) {
    const { N, third } = this.B, m = this.marks[p], out = new Map();
    for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) { const c = third[m[i] * N + m[j]]; if (this.owner[c] === 0 && !out.has(c)) out.set(c, [m[i], m[j]]); }
    return out;
  }
  /* would playing c complete a line for p? returns the line or null */
  completes(p, c) {
    const { N, third } = this.B;
    for (const a of this.marks[p]) { const b = third[c * N + a]; if (b !== c && this.owner[b] === p) return [a, b, c]; }
    return null;
  }
  /* how many new threats playing c would give p (distinct empty thirds) */
  newThreats(p, c, existing) {
    const { N, third } = this.B, seen = new Set();
    for (const a of this.marks[p]) { const t = third[c * N + a]; if (t !== c && this.owner[t] === 0 && !existing.has(t)) seen.add(t); }
    return seen.size;
  }
  play(c) {
    if (this.winner || this.owner[c] !== 0) return false;
    const p = this.turn, line = this.completes(p, c);
    this.owner[c] = p; this.marks[p].push(c); this.moves++;
    if (line) { this.winner = this.rule === "avoid" ? 3 - p : p; this.line = line; }
    else if (this.moves === this.B.N) this.winner = 3;                 // a full board with no line (only possible for n = 1)
    this.turn = 3 - p;
    return true;
  }
}

/* ---- the engine: win if you can; block if you must; otherwise make the move that makes the most new threats
   (two at once is a fork, which wins unless it can be blocked by a win), with a little noise among equals */
export function choose(g, rnd = Math.random, level = "sharp") {
  const p = g.turn, q = 3 - p, N = g.B.N, empties = [];
  for (let c = 0; c < N; c++) if (g.owner[c] === 0) empties.push(c);
  if (!empties.length) return -1;
  if (level === "random") return empties[(rnd() * empties.length) | 0];
  if (g.rule === "avoid") return chooseAvoid(g, empties, rnd);
  const mine = g.threats(p);
  if (mine.size) return [...mine.keys()][0];
  const theirs = g.threats(q);
  if (theirs.size) {
    // block; if there's more than one we've lost, but block the one that hurts them most
    let best = -1, bs = -1;
    for (const c of theirs.keys()) { const s = g.newThreats(p, c, mine); if (s > bs) { bs = s; best = c; } }
    return best;
  }
  let best = [], bs = -Infinity;
  for (const c of empties) {
    // our new threats, and how much the cell would have given them
    const s = 3 * g.newThreats(p, c, mine) + g.newThreats(q, c, theirs) + rnd() * 0.5;
    if (s > bs + 1e-9) { bs = s; best = [c]; } else if (Math.abs(s - bs) < 1e-9) best.push(c);
  }
  return best[(rnd() * best.length) | 0];
}

/* misère: never complete your own line if there's a cell that doesn't; among the safe cells, take the one that costs
   you the fewest new forbidden cells and, better still, one the opponent could still have used */
function chooseAvoid(g, empties, rnd) {
  const p = g.turn, q = 3 - p, mine = g.threats(p), theirs = g.threats(q);
  const safe = empties.filter((c) => !mine.has(c));
  if (!safe.length) return empties[(rnd() * empties.length) | 0];
  let best = [], bs = -Infinity;
  for (const c of safe) {
    const s = -g.newThreats(p, c, mine) + (theirs.has(c) ? 0 : 1.5) + rnd() * 0.3;
    if (s > bs) { bs = s; best = [c]; }
  }
  return best[0];
}
/* the cells player p can still take without completing a line of their own */
export function safeCells(g, p) { const f = g.threats(p), out = []; for (let c = 0; c < g.B.N; c++) if (g.owner[c] === 0 && !f.has(c)) out.push(c); return out; }

/* ---- the cap puzzle: cells you can't take any more (each would complete a line with two you have) */
export function forbidden(g, p = 1) { return new Set(g.threats(p).keys()); }
