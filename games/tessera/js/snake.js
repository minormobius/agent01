/* Tessera's snake — the game, headless (node runs it; js/game.js draws it).

   The board cycles through three shapes: hexagons leaning up, squares,
   hexagons leaning down, squares, and round again. Each one holds for HOLD
   ticks with the countdown in plain sight, then the change happens in a
   single tick. Going from squares to hexagons opens a short wall at every
   corner and gives each cell two more neighbours (a join: always safe).
   Going from hexagons to squares closes them (a pinch). Any joint of the
   snake that ran across a diagonal is cut, and everything behind the first
   cut falls off as pellets to gather again. Nothing is lost in the pinch:
   the snake's length before = its length after + the pellets it drops.

   Steering is relative: left turns to the next neighbour counter-clockwise,
   right to the next clockwise. Squares turn by 90°, these hexagons by 45° or
   90°. The heading is a lattice step; when the board changes and that step
   no longer exists, it falls to the nearest one, ties broken by where the
   snake has been going. */
import { Tiling, FIGURES, T_ } from "./tiling.js";

export const G_ = { TICK: 140, HOLD: 36, PREVIEW: 14, START: 4, FOOD_GROW: 3, FOOD_PTS: 5, PELLET_PTS: 1, PELLET_LIFE: 150, TURNS: 2 };
export const CYCLE = [1, 0, -1, 0];
export const SHAPE = { "1": "hexagons ↗", "0": "squares", "-1": "hexagons ↘" };

const ang = (dx, dy) => { const a = Math.atan2(dy, dx); return a < 0 ? a + 2 * Math.PI : a; };
const gap = (a, b) => { const d = Math.abs(a - b) % (2 * Math.PI); return Math.min(d, 2 * Math.PI - d); };

export class Game {
  constructor(W, H, seed = 1) {
    this.T = new Tiling(W, H);
    this.T.fig1 = FIGURES.fish; this.T.phiA.fill(1); this.T.phiB.fill(1);
    this.seed = seed >>> 0 || 1;
    this.phase = 1; this.setShape(CYCLE[this.phase]);       // squares first: the easy shape
    this.clock = G_.HOLD;                                     // ticks until the board changes
    const y = H >> 1, x = W >> 2;
    this.body = [];
    for (let k = 0; k < G_.START; k++) this.body.push(this.T.idx(x - k, y));
    this.heading = [1, 0]; this.trend = [[1, 0], [1, 0], [1, 0]];
    this.queue = []; this.pending = 0;
    this.pellets = new Map();                                 // cell → ticks left
    this.score = 0; this.ticks = 0; this.alive = true; this.cuts = 0; this.dropped = 0;
    this.events = [];
    this.food = -1; this.spawn();
  }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  setShape(s) { this.shape = s; this.T.h.fill(s * T_.HMAX); this._nb = new Map(); }
  get next() { return CYCLE[(this.phase + 1) % CYCLE.length]; }
  get pinchNext() { return this.shape !== 0 && this.next === 0; }

  /* neighbours under the current shape, counter-clockwise from east */
  options(i) {
    let o = this._nb.get(i);
    if (!o) { o = this.T.neighbours(i).map((n) => ({ nb: n.nb, dx: n.dx, dy: n.dy, a: ang(n.dx, n.dy) })).sort((p, q) => p.a - q.a); this._nb.set(i, o); }
    return o;
  }
  link(a, b) { return this.options(a).find((n) => n.nb === b) || null; }
  /* the joints a pinch would cut: index k means the link body[k] — body[k+1] runs on a diagonal */
  atRisk() {
    const out = [];
    for (let k = 0; k + 1 < this.body.length; k++) { const l = this.link(this.body[k + 1], this.body[k]); if (l && l.dx && l.dy) out.push(k); }
    return out;
  }
  turn(d) { if (this.alive && this.queue.length < G_.TURNS) this.queue.push(d > 0 ? 1 : -1); }

  spawn() {
    const busy = new Set(this.body), [hx, hy] = this.T.xy(this.body[0]);
    for (let tries = 0; tries < 500; tries++) {
      const i = Math.floor(this.rnd() * this.T.N), [x, y] = this.T.xy(i);
      const dx = Math.min(Math.abs(x - hx), this.T.W - Math.abs(x - hx)), dy = Math.min(Math.abs(y - hy), this.T.H - Math.abs(y - hy));
      if (!busy.has(i) && !this.pellets.has(i) && dx + dy >= 3) { this.food = i; return; }
    }
    this.food = -1;
  }

  /* the board changes shape; on a pinch, the snake is cut at its first diagonal joint */
  change() {
    const was = this.shape;
    this.phase = (this.phase + 1) % CYCLE.length;
    this.setShape(CYCLE[this.phase]);
    if (was !== 0 && this.shape === 0) {
      let cut = -1;
      for (let k = 0; k + 1 < this.body.length; k++) if (!this.link(this.body[k + 1], this.body[k])) { cut = k + 1; break; }
      if (cut > 0) {
        const off = this.body.splice(cut);
        for (const c of off) this.pellets.set(c, G_.PELLET_LIFE);
        this.cuts++; this.dropped += off.length;
        this.events.push({ kind: "cut", n: off.length, cells: off });
      }
      this.events.push({ kind: "pinch" });
    } else this.events.push({ kind: "join" });
  }

  /* the heading, made legal under the current shape, then the queued turn applied */
  steer() {
    const o = this.options(this.body[0]), [hx, hy] = this.heading;
    let k = o.findIndex((n) => n.dx === hx && n.dy === hy);
    if (k < 0) {
      const a = ang(hx, hy), best = Math.min(...o.map((n) => gap(n.a, a)));
      const tied = o.map((n, j) => j).filter((j) => gap(o[j].a, a) < best + 1e-9);
      const tx = this.trend.reduce((s, t) => s + t[0], 0), ty = this.trend.reduce((s, t) => s + t[1], 0);
      tied.sort((p, q) => (o[q].dx * tx + o[q].dy * ty) - (o[p].dx * tx + o[p].dy * ty));
      k = tied[0];
    }
    if (this.queue.length) {
      const d = this.queue.shift(), j = (k + d + o.length) % o.length;
      if (o[j].nb !== this.body[1]) k = j;                    // never fold back onto the neck
    }
    this.heading = [o[k].dx, o[k].dy];
    return o[k].nb;
  }

  tick() {
    this.events = [];
    if (!this.alive) return;
    this.ticks++;
    if (--this.clock === 0) { this.change(); this.clock = G_.HOLD; }
    const to = this.steer(), tailMoves = this.pending === 0;
    const hits = this.body.indexOf(to);
    if (hits >= 0 && !(tailMoves && hits === this.body.length - 1)) { this.alive = false; this.events.push({ kind: "dead", at: to }); return; }
    this.body.unshift(to);
    if (this.pending > 0) this.pending--; else this.body.pop();
    this.trend.unshift(this.heading); this.trend.length = 3;
    if (to === this.food) { this.pending += G_.FOOD_GROW; this.score += G_.FOOD_PTS; this.events.push({ kind: "eat" }); this.spawn(); }
    if (this.pellets.has(to)) { this.pellets.delete(to); this.pending += 1; this.score += G_.PELLET_PTS; this.events.push({ kind: "gather" }); }
    for (const [c, t] of this.pellets) if (t <= 1) this.pellets.delete(c); else this.pellets.set(c, t - 1);
    if (this.food < 0) this.spawn();
  }

  /* the split the renderer should draw, f ∈ [0,1) of the way to the next tick:
     a closing wall shrinks to nothing during the last tick before a pinch, an
     opening one grows during the first tick after a join */
  drawnSplit(f) {
    if (this.clock === 1 && this.pinchNext) return this.shape * T_.HMAX * (1 - f);
    if (this.clock === G_.HOLD && this.shape !== 0 && this.ticks > 0) return this.shape * T_.HMAX * Math.min(1, f);
    return this.shape * T_.HMAX;
  }
}
