/* Ouroboros computes: a tag system run on the snake's own body.

   A TAG SYSTEM is a queue of symbols and a table: read the front symbol,
   delete d symbols from the front, append the word the table gives for the
   one you read; stop when fewer than d are left. That is enough to compute
   anything a computer can (Cocke and Minsky, 1964: 2-tag systems are
   universal). The snake already is one:

     the tape   the world's word, which is the snake's own body: one turn
                token for each joint, oldest at the tail end
     write      every move appends the turn just made at the head end
     delete     every move drops the oldest token from the tail end; to delete
                more, the snake sheds tail segments (shed); to delete fewer,
                it swallows and grows (the tail stays put)
     read       the oldest bends, at the world's tail end: the ouroboros reads
                its own tail. (The program reads them straight off the word;
                it doesn't crawl round to look. That is the one thing here
                that isn't the snake's own geometry.)

   A symbol is a GLYPH of two moves that ends facing the way it began and is
   always a step further along: a = straight, straight; b = left, right;
   c = right, left. On the tube that can never run into itself: every row
   along it holds at most two cells of the path, so the program's own moves
   can't bite. The pitch the world adds when a move crosses a fold is not
   part of the symbol; only the yaw is.

   Each tag step reads the front glyph and makes the moves of its
   production, growing or shedding so that exactly d symbols come off the
   front. Then the tape is checked against the same tag system run by itself
   (tagStep): the body has to say exactly what the machine says. */
import { Ouro } from "./ouro.js";

export const GLYPHS = {
  2: { a: "SS", b: "LR", c: "RL" },
  4: { a: "SSSS", b: "LSRS", c: "RSLS" },
  6: { a: "SSSSSS", b: "LSRSSS", c: "RSLSSS" },
};
export let GLYPH = GLYPHS[2];

/* De Mol's tag system for Collatz: a^n becomes a^(n/2) for even n and a^((3n+1)/2) for odd, by way of b's and c's */
export const COLLATZ = { name: "Collatz", d: 2, rules: { a: "bc", b: "a", c: "aaa" } };

/* one step of a tag system by itself; null once it has halted */
export function tagStep(tape, sys) { return tape.length < sys.d ? null : tape.slice(sys.d) + sys.rules[tape[0]]; }
/* where Collatz is: the tape is a^m exactly when the machine has arrived at m */
export const collatzValue = (tape) => (/^a+$/.test(tape) ? tape.length : null);

/* the symbols a world's word spells (yaw only), or null if it's not whole glyphs */
export function readTape(word, glyph = GLYPH) {
  const w = glyph.a.length, sym = Object.fromEntries(Object.entries(glyph).map(([k, v]) => [v, k]));
  if (word.length % w) return null;
  let t = "";
  for (let i = 0; i < word.length; i += w) { let g = ""; for (let j = 0; j < w; j++) g += word[i + j].slice(-1); const s = sym[g]; if (!s) return null; t += s; }
  return t;
}

export class TagSnake {
  constructor(input, sys = COLLATZ, seed = 1, opts = {}) {
    this.sys = sys; this.input = input; this.glyph = GLYPHS[opts.glyph || 2]; delete opts.glyph;
    // the world is exactly as long as the snake, cut and grown only by the program; no food, a bite ends it
    // it sets off towards the world's head end, where the world grows (from the tail end it winds round the cap)
    this.g = new Ouro(seed, Object.assign({ shrink: "body", fall: "slide", bite: "die", food: false, start: 1, facing: "head" }, opts));
    this.g.food.clear();
    this.plan = []; this.tagSteps = 0; this.moves = 0; this.halted = false; this.broken = null;
    this.expect = input;
    // lay the input down: crawl, swallowing as you go, until the body spells it (a token per joint: two a symbol, and
    // a body one cell longer than its joints at each end)
    for (const ch of input) this.plan.push(...[...this.glyph[ch]].map((t) => ({ t, grow: true })));
    this.plan.push({ t: "S", grow: true });
    this.laying = true;
  }
  get tape() { return readTape(this.g.word, this.glyph); }
  /* one move of the snake; returns what happened */
  step() {
    const g = this.g;
    if (this.halted || this.broken || !g.alive) return null;
    if (!this.plan.length) {
      if (this.laying) { this.laying = false; this.check(); if (this.broken) return null; }
      const tape = this.tape;
      if (tape.length < this.sys.d) { this.halted = true; return { halted: true }; }
      // read the front glyph, plan the production's moves, growing or shedding so d symbols come off the front
      const p = this.sys.rules[tape[0]], moves = [...p].flatMap((ch) => [...this.glyph[ch]]), extra = moves.length - this.glyph.a.length * this.sys.d;
      this.plan = moves.map((t, i) => ({ t, grow: i < extra }));
      if (extra < 0) this.plan.push({ shed: -extra });
      this.plan.push({ done: true });
      this.reading = tape[0];
      this.expect = tagStep(tape, this.sys);
    }
    const m = this.plan.shift();
    if (m.done) { this.tagSteps++; this.check(); return { tag: true, read: this.reading }; }
    if (m.shed) { g.shed(m.shed); this.check(true); return { shed: m.shed }; }
    if (m.grow) g.pending++;
    g.steer((g.inSide + (m.t === "L" ? 3 : m.t === "R" ? 1 : 2)) % 4);
    g.tick(); this.moves++;
    if (!g.alive) this.broken = "the snake bit itself";
    else if (g.log.some((e) => e.kind === "cut" && e.tick === g.ticks)) this.broken = "the world's bends cut the snake, and its tape with it";
    return { move: m.t };
  }
  /* the body must spell exactly what the tag system says (only whole tag steps are checked) */
  check(partial) {
    if (partial) return;
    const t = this.tape;
    if (t !== this.expect) this.broken = this.broken || `the body spells ${t === null ? "something that isn't glyphs" : '"' + t + '"'} where the machine has "${this.expect}"`;
  }
  /* run to the end (or a limit) */
  run(maxMoves = 1e6) { while (!this.halted && !this.broken && this.moves < maxMoves) this.step(); return this; }
}
