/* Molt — the rules, headless (node runs them; js/main.js draws them).

   Classic snake on a closed surface: the world is the skin of a snake's body
   (js/duct.js), every cell a square with four neighbours, no walls. Eat and
   grow. Bite yourself and the run ends.

   MOLT: the moment you're MOLT_AT + depth long you shed this world and dive
   into your own body (8, then 9, 10, …). Your snake, read tail to head as a
   word of turns, becomes the next world: each one longer and twistier than
   the last. Every level down the clock ticks a little faster and food is
   worth one more point, and every third level there's one more of it about
   (foodAt).

   THE CLOCK: a run starts with CLOCK ms and every food adds BONUS. Each step
   spends one tick of game time, so the clock is part of the rules (headless
   and deterministic), not the page's wall clock; it stops while you molt.

   Steering is by neighbour (the side of the head's cell to leave by); turning
   screen directions into sides is the page's job, since only it knows where
   the camera is. With no steer the snake goes straight on: out through the
   side opposite the one it came in by. */
import { buildDuct, wordOf, sideTo, bends } from "./duct.js";

export const M_ = { TICK: 150, SPEEDUP: 0.95, TICK_MIN: 70, START: 3, MOLT_AT: 8, FIRST: 12, CLOCK: 60000, BONUS: 10000 };
/* how much food lies about at once, by level (depth + 1): 2 on the first two
   levels, 3 from level 3, and one more every third level after (4 at 6, 5 at 9) */
export const foodAt = (depth) => (depth + 1 < 3 ? 2 : 2 + Math.floor((depth + 1) / 3));

export class Game {
  constructor(seed = 1, word = "S".repeat(M_.FIRST - 2)) {
    this.seed = seed >>> 0 || 1;
    this.depth = 0; this.score = 0; this.eaten = 0; this.ticks = 0; this.alive = true; this.history = []; this.maxLength = 1;
    this.clock = M_.CLOCK; this.cause = null;
    this.enter(buildDuct(word));
  }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  /* start on a world: on top of its head end, crawling back along it towards the tail, so the world opens out ahead */
  enter(world) {
    this.world = world;
    const top = world.faces.findIndex((F) => F.k === world.L - 1 && F.d === world.upEnd);
    const C = world.C, mid = (C - 1) >> 1, c = top * C * C + mid * C + mid, F = world.faces[top];
    // come in from the side that faces the head cap, so straight on leads away from it
    const dirs = [F.p, F.r, F.p ^ 1, F.r ^ 1];
    this.body = [c];
    this.inSide = dirs.indexOf(world.dout[world.L - 1]); this.next = -1; this.pending = M_.START - 1; this.longest = 1;
    this.food = new Set(); this.spawn();
  }
  get head() { return this.body[0]; }
  /* how long you must get to molt out of this world, and how long a step takes in it */
  get moltAt() { return M_.MOLT_AT + this.depth; }
  get tickMs() { return Math.max(M_.TICK_MIN, Math.round(M_.TICK * M_.SPEEDUP ** this.depth)); }
  get canMolt() { return this.alive && this.body.length >= this.moltAt; }
  /* the next world, if you molted now: how many cells, how many bends */
  preview() { const w = wordOf(this.world, this.body), n = this.body.length; return { cells: this.world.C ** 2 * (4 * n + 2), bends: bends(w), word: w }; }

  spawn() {
    const want = foodAt(this.depth), busy = new Set(this.body);
    for (let tries = 0; this.food.size < want && tries < 2000; tries++) {
      const c = Math.floor(this.rnd() * this.world.N);
      if (!busy.has(c) && !this.food.has(c)) this.food.add(c);
    }
  }
  /* leave the head's cell by side s next tick (ignored if that's back onto the neck) */
  steer(s) { if (!this.alive || s < 0 || s > 3) return; if (this.body.length > 1 && this.world.nb[this.head * 4 + s] === this.body[1]) return; this.next = s; }
  straight() { return (this.inSide + 2) % 4; }

  tick() {
    this.events = [];
    if (!this.alive) return;
    this.ticks++; this.clock -= this.tickMs;
    const s = this.next >= 0 ? this.next : this.straight(); this.next = -1;
    const to = this.world.nb[this.head * 4 + s], tailMoves = this.pending === 0;
    const hit = this.body.indexOf(to);
    if (hit >= 0 && !(tailMoves && hit === this.body.length - 1)) { this.die("bitten"); return; }
    this.inSide = this.world.back[this.head * 4 + s];
    this.body.unshift(to);
    if (this.pending > 0) this.pending--; else this.body.pop();
    this.longest = Math.max(this.longest, this.body.length); this.maxLength = Math.max(this.maxLength, this.longest);
    if (this.food.has(to)) {
      this.food.delete(to); this.pending++; this.eaten++; this.score += this.depth + 1; this.clock += M_.BONUS;
      this.events.push({ kind: "eat" }); this.spawn();
    }
    if (this.clock <= 0) { this.clock = 0; this.die("time"); return; }      // food on the very last step still saves you
    if (this.canMolt) this.events.push({ kind: "ripe" });                    // the page plays the dive, then calls molt()
  }
  die(cause) { this.alive = false; this.cause = cause; this.events.push({ kind: "dead", cause }); }

  /* shed this world: the body becomes the next one */
  molt() {
    if (!this.canMolt) return null;
    const word = wordOf(this.world, this.body);
    this.history.push({ depth: this.depth, length: this.body.length, word, cells: this.world.N });
    this.depth++;
    this.enter(buildDuct(word));
    this.events = [{ kind: "molt", depth: this.depth }];
    return this.world;
  }
}
export { sideTo };
