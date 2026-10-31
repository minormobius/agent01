/* Ziggurat — the game, with no DOM, so node can play it.

   The board is the top of a staircase of tesseracts. A staircase of cubes
   (the classic hopping pyramid) has square tops arranged in a triangle; a
   staircase of tesseracts has CUBE tops, arranged in a tetrahedral pile:
   every (a, b, c) of whole numbers ≥ 0 with a + b + c ≤ N − 1. Its depth
   below the summit is a + b + c, and you hop six ways: ±a, ±b, ±c. A +
   hop goes one step down, a − hop one step up, and a hop that leaves the
   pile is a fall.

   Fix any one coordinate and the cells left form a triangle: an ordinary
   pyramid, one row smaller each step in. So the pile is N pyramids side by
   side, and the hop along the fixed coordinate takes you from a pyramid to
   the same spot on the next one. Which coordinate you fix is up to you (the
   view turns): it changes which pyramids you see, never the game.

   Everything here runs on a clock you feed (update(ms)); the same seed and
   the same moves at the same times give the same game. */

export const Z = {
  HOP: 260,             // ms a hop of yours takes
  RIDE: 1500,           // ms a disc takes to carry you to the summit
  TICK0: 900, TICK_MIN: 420, TICK_STEP: 45, // ms between enemy hops, by round
  AIR: 0.45,            // the part of an enemy's tick it spends in the air
  DROP: 520,            // ms an enemy takes to drop onto the pile
  SPAWN0: 3200, SPAWN_MIN: 1500, SPAWN_STEP: 140,
  FIRST: 1800,          // ms before a round's first enemy
  FREEZE: 4000, DEATH: 1400, CLEAR: 1700, HATCH: 700,
  LIVES: 3, ROUNDS: 4,  // rounds a level
  PTS: { colour: 25, lure: 500, slick: 300, green: 100 },
  BONUS0: 1000, BONUS_STEP: 250, // a round's bonus: BONUS0 + BONUS_STEP × (rounds before it)
  HIT: 0.62,            // how close (in cells) an enemy has to be to touch you
  DISCS: 2,
};

/* the six hops: d = 2·axis + (0 for +, 1 for −) */
export const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export const dirOf = (axis, sign) => 2 * axis + (sign < 0 ? 1 : 0);

/* the pile grows after the first two levels */
export const sideFor = (level) => (level <= 2 ? 5 : 6);
/* how a cube's top changes under your feet, by level: how many hops to finish it, and whether a finished one goes back */
export function rule(level) {
  if (level === 1) return { stages: 1, toggle: false };
  if (level === 2) return { stages: 2, toggle: false };
  if (level === 3) return { stages: 1, toggle: true };
  return { stages: 2, toggle: true };
}
export const roundBonus = (ri) => Z.BONUS0 + Z.BONUS_STEP * ri;

export const inBoard = (N, p) => p[0] >= 0 && p[1] >= 0 && p[2] >= 0 && p[0] + p[1] + p[2] <= N - 1;
export const depth = (p) => p[0] + p[1] + p[2];
export const add = (p, d) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
export const l1 = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
export const same = (p, q) => p[0] === q[0] && p[1] === q[1] && p[2] === q[2];
/* a key for any cell within a step of the pile (−1 … 62 on each axis) */
export const keyOf = (p) => (p[0] + 1) * 4096 + (p[1] + 1) * 64 + (p[2] + 1);

/* every cell, summit first, then down a layer at a time */
export function cells(N) {
  const out = [];
  for (let s = 0; s < N; s++) for (let a = s; a >= 0; a--) for (let b = s - a; b >= 0; b--) out.push([a, b, s - a - b]);
  return out;
}

export function rng(seed) { // mulberry32
  let t = seed >>> 0;
  return () => { t = (t + 0x6d2b79f5) >>> 0; let x = t; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

const lerp3 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

export class Game {
  constructor(seed = 1) {
    this.seed = seed >>> 0; this.rnd = rng(this.seed);
    this.now = 0; this.score = 0; this.lives = Z.LIVES; this.ri = 0;
    this.stats = { hops: 0, lures: 0, catches: 0, cleared: 0 };
    this.events = []; // what happened, for the page's sounds and pops: { type, at, p, … }
    this.over = false;
    this.startRound();
  }
  get level() { return 1 + Math.floor(this.ri / Z.ROUNDS); }
  get round() { return 1 + (this.ri % Z.ROUNDS); }
  get frozen() { return this.now < this.frozenUntil; }

  emit(type, extra) { this.events.push(Object.assign({ type, at: this.now }, extra)); if (this.events.length > 64) this.events.shift(); }

  startRound() {
    this.N = sideFor(this.level); this.rule = rule(this.level);
    this.all = cells(this.N);
    this.top = new Map(this.all.map((p) => [keyOf(p), 0]));
    this.left = this.all.length; // cubes not finished
    this.hero = { p: [0, 0, 0], mv: null, queued: null, face: 0, fall: null };
    this.enemies = []; this.frozenUntil = 0;
    this.discs = this.makeDiscs();
    this.tick = Math.max(Z.TICK_MIN, Z.TICK0 - Z.TICK_STEP * this.ri);
    this.spawnEvery = Math.max(Z.SPAWN_MIN, Z.SPAWN0 - Z.SPAWN_STEP * this.ri);
    this.nextSpawn = this.now + Z.FIRST;
    this.state = "play"; this.until = 0;
    this.emit("round", { level: this.level, round: this.round, N: this.N });
  }

  /* discs float just off the pile's three outer faces (a, b or c = −1), never by the summit */
  makeDiscs() {
    const seen = new Map();
    for (const p of this.all) {
      if (depth(p) < 2) continue;
      for (const d of [1, 3, 5]) { const q = add(p, DIRS[d]); if (!inBoard(this.N, q)) seen.set(keyOf(q), q); }
    }
    const pool = [...seen.values()], out = [];
    while (out.length < Z.DISCS && pool.length) out.push({ p: pool.splice((this.rnd() * pool.length) | 0, 1)[0], used: false });
    return out;
  }

  /* ------------------------------------------------------------ you */
  move(d) {
    if (this.state !== "play" || this.over || this.hero.fall) return false;
    if (this.hero.mv) { if (!this.hero.mv.ride) this.hero.queued = d; return false; }
    this.hop(d); return true;
  }
  hop(d) {
    const H = this.hero;
    H.mv = { from: H.p, to: add(H.p, DIRS[d]), t0: this.now, dur: Z.HOP, d };
    H.face = d; this.emit("jump", { d });
  }
  landHero() {
    const H = this.hero, mv = H.mv, p = mv.to;
    if (mv.ride) { H.mv = null; H.p = [0, 0, 0]; this.emit("land", { p: H.p }); this.colourAt(H.p); return; }
    if (!inBoard(this.N, p)) {
      const disc = this.discs.find((x) => !x.used && same(x.p, p));
      if (disc) { disc.used = true; H.discFrom = p; H.mv = { from: p, to: [0, 0, 0], t0: this.now, dur: Z.RIDE, ride: true }; this.emit("disc", { p }); return; }
      H.mv = null; H.fall = { p, t0: this.now }; this.die("fall"); return;
    }
    H.p = p; H.mv = null; this.stats.hops++;
    this.emit("land", { p });
    this.colourAt(p);
    if (H.queued != null && this.state === "play") { const q = H.queued; H.queued = null; this.hop(q); }
  }
  colourAt(p) {
    const k = keyOf(p), s = this.top.get(k), R = this.rule;
    if (s < R.stages) {
      this.top.set(k, s + 1); this.score += Z.PTS.colour;
      if (s + 1 === R.stages) this.left--;
      this.emit("colour", { p, s: s + 1 });
    } else if (R.toggle) { this.top.set(k, s - 1); this.left++; this.emit("uncolour", { p }); }
    if (this.left === 0 && this.state === "play") {
      this.state = "clear"; this.until = this.now + Z.CLEAR;
      const b = roundBonus(this.ri); this.score += b; this.stats.cleared++;
      this.emit("clear", { bonus: b });
    }
  }
  die(cause) {
    this.lives--; this.state = "dying"; this.until = this.now + Z.DEATH; this.cause = cause;
    this.hero.queued = null;
    this.emit("die", { cause });
  }

  /* ------------------------------------------------------------ them */
  spawn() {
    const live = this.enemies.filter((e) => !e.fall);
    if (live.length >= Math.min(5, 2 + (this.ri >> 1))) return;
    const pool = [["red", 4], ["green", 1]];
    if (!live.some((e) => e.kind === "egg" || e.kind === "coil")) pool.push(["egg", 3]);
    if (this.ri >= 1) pool.push(["slick", 2]);
    let r = this.rnd() * pool.reduce((s, x) => s + x[1], 0), kind = pool[0][0];
    for (const [k, w] of pool) { if ((r -= w) < 0) { kind = k; break; } }
    const at = DIRS[[0, 2, 4][(this.rnd() * 3) | 0]];
    const e = { kind, p: at.slice(), mv: { from: at, to: at, t0: this.now, dur: Z.DROP, drop: true }, next: this.now + Z.DROP + this.tick * 0.6, fall: null };
    this.enemies.push(e); this.emit("spawn", { kind });
  }
  stepEnemy(e) {
    const N = this.N;
    let to = null;
    if (e.kind === "coil") {
      const H = this.hero, target = H.mv && H.mv.ride ? H.discFrom : H.mv && inBoard(N, H.mv.to) ? H.mv.to : H.p;
      let best = Infinity, opts = [];
      for (const d of DIRS) {
        const q = add(e.p, d);
        if (!inBoard(N, q) && !same(q, target)) continue; // it only ever leaves the pile after you
        const s = l1(q, target);
        if (s < best) { best = s; opts = [q]; } else if (s === best) opts.push(q);
      }
      if (!opts.length || l1(e.p, target) < best) { e.next = this.now + this.tick; return; }
      to = opts[(this.rnd() * opts.length) | 0];
    } else {
      const downs = [0, 2, 4].map((d) => add(e.p, DIRS[d]));
      if (e.kind === "egg") {
        const stay = downs.filter((q) => inBoard(N, q));
        if (!stay.length) { e.kind = "coil"; e.next = this.now + Z.HATCH; this.emit("hatch", { p: e.p }); return; }
        to = stay[(this.rnd() * stay.length) | 0];
      } else to = downs[(this.rnd() * 3) | 0];
    }
    e.mv = { from: e.p, to, t0: this.now, dur: this.tick * Z.AIR };
    e.next = this.now + this.tick * (e.kind === "coil" ? 0.92 : 1);
  }
  landEnemy(e) {
    const p = e.mv.to; e.p = p; const drop = e.mv.drop; e.mv = null;
    if (drop) return;
    if (!inBoard(this.N, p)) {
      e.fall = { p, t0: this.now };
      if (e.kind === "coil") { this.score += Z.PTS.lure; this.stats.lures++; this.emit("lure", { p }); }
      return;
    }
    if (e.kind === "slick") {
      const k = keyOf(p), s = this.top.get(k);
      if (s > 0) { this.top.set(k, s - 1); if (s === this.rule.stages) this.left++; this.emit("uncolour", { p }); }
    }
  }

  /* where something is right now, in cells (between two when it's hopping) */
  posOf(x) {
    if (!x.mv) return x.p;
    return lerp3(x.mv.from, x.mv.to, Math.min(1, (this.now - x.mv.t0) / x.mv.dur));
  }
  collide() {
    const H = this.hero;
    if (this.state !== "play" || H.fall || (H.mv && H.mv.ride)) return;
    if (H.mv && !inBoard(this.N, H.mv.to) && this.now - H.mv.t0 > H.mv.dur * 0.5) return; // already over the edge
    const hp = this.posOf(H);
    for (const e of this.enemies) {
      if (e.fall || (e.mv && e.mv.drop && this.now - e.mv.t0 < e.mv.dur * 0.7)) continue;
      if (dist(hp, this.posOf(e)) >= Z.HIT) continue;
      if (e.kind === "green") { this.frozenUntil = this.now + Z.FREEZE; this.score += Z.PTS.green; this.stats.catches++; e.gone = true; this.emit("catch", { kind: "green", p: e.p }); continue; }
      if (e.kind === "slick") { this.score += Z.PTS.slick; this.stats.catches++; e.gone = true; this.emit("catch", { kind: "slick", p: e.p }); continue; }
      this.die("hit"); return;
    }
    this.enemies = this.enemies.filter((e) => !e.gone);
  }

  /* ------------------------------------------------------------ the clock */
  update(ms) {
    while (ms > 0 && !this.over) { const h = Math.min(ms, 20); this.now += h; ms -= h; this.step(); }
  }
  step() {
    if (this.state === "clear") { if (this.now >= this.until) { this.ri++; this.startRound(); } return; }
    if (this.state === "dying") {
      if (this.now < this.until) return;
      const H = this.hero;
      if (H.fall) { H.fall = null; H.p = [0, 0, 0]; }
      H.mv = null; this.enemies = []; this.frozenUntil = 0;
      if (this.lives <= 0) { this.over = true; this.state = "over"; this.emit("over", { score: this.score }); return; }
      this.state = "play"; this.nextSpawn = this.now + Z.FIRST; return;
    }
    const H = this.hero;
    if (H.mv && this.now >= H.mv.t0 + H.mv.dur) this.landHero();
    if (this.state !== "play") return;
    const frozen = this.frozen;
    for (const e of this.enemies) {
      if (e.fall) continue;
      if (e.mv && this.now >= e.mv.t0 + e.mv.dur) this.landEnemy(e);
      if (!e.fall && !e.mv && !frozen && this.now >= e.next) this.stepEnemy(e);
    }
    if (frozen) for (const e of this.enemies) if (!e.mv) e.next = Math.max(e.next, this.frozenUntil);
    this.enemies = this.enemies.filter((e) => !e.fall || this.now - e.fall.t0 < 1200);
    if (!frozen && this.now >= this.nextSpawn) { this.spawn(); this.nextSpawn = this.now + this.spawnEvery; }
    this.collide();
  }

  /* what a run posts to the board */
  result() { return { value: this.score, level: this.level, round: this.round, hops: this.stats.hops, lures: this.stats.lures, catches: this.stats.catches, cleared: this.stats.cleared, seed: this.seed }; }
}

/* ---------------------------------------------------------------- autopilot
   A fair player for the selftest and the arcade's attract loop: it walks to
   the nearest unfinished cube, never onto a cube an enemy is on or landing
   on, shies away from the cubes one hop from an enemy, and when the coil
   gets close it heads for a disc. Returns a hop, or null to wait. */
export function autopilot(g) {
  const H = g.hero, N = g.N;
  if (g.state !== "play" || H.mv || H.fall) return null;
  const hard = new Set(), soft = new Map();
  let coil = null;
  for (const e of g.enemies) {
    if (e.fall || e.kind === "green" || e.kind === "slick") continue;
    if (e.kind === "coil") coil = e;
    for (const p of [e.p, e.mv ? e.mv.to : e.p]) {
      hard.add(keyOf(p));
      for (const d of e.kind === "coil" ? DIRS : [DIRS[0], DIRS[2], DIRS[4]]) { const q = add(p, d); soft.set(keyOf(q), (soft.get(keyOf(q)) || 0) + (e.kind === "coil" ? 6 : 3)); }
    }
  }
  const goal = (p) => g.top.get(keyOf(p)) < g.rule.stages;
  const fleeing = coil && l1(coil.p, H.p) <= 3 && g.discs.some((x) => !x.used);
  // Dijkstra over the pile from where you stand
  const start = keyOf(H.p), cost = new Map([[start, 0]]), first = new Map(), done = new Set();
  const queue = [[0, H.p]];
  let found = null;
  while (queue.length) {
    queue.sort((x, y) => x[0] - y[0]);
    const [c, p] = queue.shift(), k = keyOf(p);
    if (done.has(k)) continue; done.add(k);
    if (k !== start) {
      if (fleeing) { const disc = g.discs.find((x) => !x.used && l1(x.p, p) === 1); if (disc) { found = { k, disc }; break; } }
      else if (goal(p)) { found = { k }; break; }
    } else if (fleeing) { const disc = g.discs.find((x) => !x.used && l1(x.p, p) === 1); if (disc) return DIRS.findIndex((d) => same(add(p, d), disc.p)); }
    for (let d = 0; d < 6; d++) {
      const q = add(p, DIRS[d]), qk = keyOf(q);
      if (!inBoard(N, q) || hard.has(qk) || done.has(qk)) continue;
      const done_ = g.top.get(qk) >= g.rule.stages;
      const nc = c + 1 + (soft.get(qk) || 0) + (g.rule.toggle && done_ ? 4 : 0);
      if (!cost.has(qk) || nc < cost.get(qk)) { cost.set(qk, nc); first.set(qk, k === start ? d : first.get(k)); queue.push([nc, q]); }
    }
  }
  if (found) return first.get(found.k);
  // nowhere worth going: any hop that isn't onto an enemy
  const safe = [];
  for (let d = 0; d < 6; d++) { const q = add(H.p, DIRS[d]); if (inBoard(N, q) && !hard.has(keyOf(q))) safe.push(d); }
  return safe.length && soft.get(keyOf(H.p)) ? safe[(g.rnd() * safe.length) | 0] : null;
}
