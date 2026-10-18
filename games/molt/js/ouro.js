/* Ouroboros — snake on yourself, live. The rules, headless (node runs them;
   ouro-lab.js draws them).

   In Molt the world is your body as it was when you molted. Here it is your
   body as it IS: the world has one cube for each cell of you, and every step
   reshapes it. The turn you just made, read off the surface the way Molt
   reads a body (duct.js wordOf: yaw from the sides of the cell, pitch from
   the fold behind it), becomes the bend of the cube behind the world's head,
   and every bend moves one cube on, the way a snake's body slides through the
   bends its head made. Eat and you grow; so does the world.

   Every rule below is a choice the lab can flip (opts), because each one is
   a guess at what "the same place" means on a world that changed.

   GROUND (opts.ground): when the world reshapes, every cell of it has to land
   somewhere on the new one.
     skin   a cell belongs to its cube: the same cube of the body, wherever
            that cube now lies. A cube keeps its place along the body and takes
            the bend of the one ahead of it, so the bends sweep back along the
            world, through you. Nothing is destroyed: a bent cube shows its
            front and three walls, a straight one four walls, and the wall a
            bend swallows comes back as its front, turned 90° (opts.turn picks
            which way).
     space  a cell belongs to its place in space. The world grows at the head
            and leaves at the tail, a cube a step; you walk a third of a cube a
            step (C = 3), so the ground runs out under you three times faster
            than you can walk. Kept to show why the skin is the ground.

   BODY (opts.body): where your body lies on the new world.
     retrace  your head stays on its own cell; your body is laid back down
              behind it by its own turns (straight, left, right at each cell),
              which is what a body IS in Molt. Where nothing changed that is
              the very same cells; where the world bent, your shape holds and
              the world bends under it. It breaks only where it now runs into
              itself.
     carry    every cell of you is carried over by name, like the ground, and
              you are cut where two of them stop being neighbours. A bent
              cube's inside lane has 1 cell where a straight one has 3, so no
              naming of cells keeps every joint: about one step in six cuts
              you (measured; see the selftest).

   DAMAGE: cut at the first break from the head, as Tessera cuts at a pinch;
   everything behind it falls off where it lay and becomes food. With
   opts.shrink "body" the world loses as many cubes as you lost cells, from
   its tail end (you are the world), which can cut you again, and if the
   ground under your head goes, you fall; with "keep" the world stays as long
   as you have been. Biting yourself kills you, or (opts.bite "cut") bites
   off what's behind the bite.

   Steering is by side of the head's cell, as in game.js. */
import { buildDuct, VEC, neg, crossD, sideTo, fold, census } from "./duct.js";

export const O_ = { TICK: 180, START: 6, FOOD_EVERY: 200, C: 3 };
export const DEFAULTS = { ground: "skin", body: "retrace", shrink: "keep", bite: "cut", fall: "die", anchor: "head", turn: [-1, 1] };
const SLOTS = 5;                    // a cube's skin: up, down, left and right walls, and (at either end) a cap

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/* every cell of a world, named so it can be found again on the next one.
   skin: (cube, slot, row, column) in the cube's own frame (entered along F with U up), so a wall keeps its
   name however the cube bends. space: (cube, direction, row, column) as built. axes[f] is the pair of
   directions those rows and columns run along on face f, so a side of a cell can be named too. */
export function namesOf(M, ground, turn = DEFAULTS.turn) {
  const C = M.C, CC = C * C, key = new Int32Array(M.N), at = new Map(), axes = [];
  const idx = (x) => Math.round(x * C + (C - 1) / 2), sgn = (t, d) => (t > 0 ? d : neg(d));
  M.faces.forEach((F, f) => {
    const k = F.k, d = F.d, Fd = M.din[k], U = M.uin[k], Lf = crossD(U, Fd), slots = [U, neg(U), Lf, neg(Lf)];
    let s, A, B;
    if (ground === "space") { s = d; A = F.p; B = F.r; }
    else if ((d === Fd && k === M.L - 1) || (d === neg(Fd) && k === 0)) { s = 4; A = U; B = Lf; }
    else if (d === Fd) { const X = M.dout[k]; s = slots.indexOf(X); A = sgn(turn[0], X); B = sgn(turn[1], crossD(X, Fd)); }
    else { s = slots.indexOf(d); A = Fd; B = crossD(d, Fd); }
    axes.push([A, B]);
    for (let i = 0; i < C; i++) for (let j = 0; j < C; j++) {
      const c = f * CC + i * C + j;
      const v = [0, 1, 2].map((a) => ((i + 0.5) / C - 0.5) * VEC[F.p][a] + ((j + 0.5) / C - 0.5) * VEC[F.r][a]);
      const name = (k * (ground === "space" ? 6 : SLOTS) + s) * CC + idx(dot(v, VEC[A])) * C + idx(dot(v, VEC[B]));
      key[c] = name; at.set(name, c);
    }
  });
  return { key, at, axes };
}
/* a side of a cell by name (0 along +A, 1 +B, 2 −A, 3 −B), and back */
function sideName(M, names, c, s) {
  const f = (c / (M.C * M.C)) | 0, F = M.faces[f], dir = [F.p, F.r, neg(F.p), neg(F.r)][s], [A, B] = names.axes[f];
  return [A, B, neg(A), neg(B)].indexOf(dir);
}
function sideByName(M, names, c, n) { for (let s = 0; s < 4; s++) if (sideName(M, names, c, s) === n) return s; return -1; }

/* a body laid down from its head by its own turns: out of the head by side neck, then at each cell turn as
   joints says (2 straight on, 3 left, 1 right: the side left by, less the side come in by). Where it would
   run into itself it stops, and cut says where. */
export function lay(W, head, neck, joints, n) {
  const body = [head], busy = new Set(body);
  let prev = head, side = neck;
  for (let i = 1; i < n; i++) {
    const c = W.nb[prev * 4 + side];
    if (busy.has(c)) return { body, cut: i };
    body.push(c); busy.add(c);
    if (i < n - 1) side = (W.back[prev * 4 + side] - joints[i - 1] + 4) % 4;
    prev = c;
  }
  return { body, cut: -1 };
}

/* where a name goes when the world changes: kind "step" (moved, same length), "grow" (one longer), "cut" (m
   shorter, from the tail end), "same". Returns the new name, or -1 if that piece of ground is gone. */
function carry(name, kind, m, ground, Lold, CC, Mnew) {
  const per = (ground === "space" ? 6 : SLOTS) * CC, k = Math.floor(name / per), rest = name % per, s = Math.floor(rest / CC);
  if (kind === "same") return name;
  if (ground === "skin") {
    if (kind === "step") return name;                                                    // a cube keeps its place along the body
    if (kind === "grow") return k === Lold - 1 && s === 4 ? (k + 1) * per + rest : name; // the head's cap rides out to the new head
    if (k < m) return k === 0 && s === 4 ? rest : -1;                                     // the tail's cap is pulled in; the rest is gone
    return (k - m) * per + rest;
  }
  // space: the head grows into new space (the face it grows from is pushed out to be the new cap); on a step the tail leaves
  let kk = k;
  if ((kind === "grow" || kind === "step") && k === Lold - 1 && s === Mnew.dout[kind === "step" ? Lold - 2 : Lold - 1]) kk = k + 1;
  const drop = kind === "step" ? 1 : kind === "cut" ? m : 0;
  if (kk < drop) return kk === 0 && kind === "step" && s === neg(Mnew.dout[0]) ? rest : -1;
  return (kk - drop) * per + rest;
}

/* lay out a word so that cube k sits where (and as) an old cube sat: the world reshapes round the player */
function anchored(word, C, k, old) {
  const flat = buildDuct(word, C), F1 = flat.din[k], U1 = flat.uin[k], F0 = old.f, U0 = old.u;
  const L1 = crossD(U1, F1), L0 = crossD(U0, F0), map = new Array(6);
  map[F1] = F0; map[neg(F1)] = neg(F0); map[U1] = U0; map[neg(U1)] = neg(U0); map[L1] = L0; map[neg(L1)] = neg(L0);
  const rot = (v) => [0, 1, 2].map((a) => v[0] * VEC[map[0]][a] + v[1] * VEC[map[2]][a] + v[2] * VEC[map[4]][a]);
  const p = rot(flat.P[k]), pos = [0, 1, 2].map((a) => old.pos[a] - p[a]);
  return buildDuct(word, C, { pos, f: map[0], u: map[4] });
}

export class Ouro {
  constructor(seed = 1, opts = {}) {
    this.opts = Object.assign({ C: O_.C, start: O_.START }, DEFAULTS, opts);
    this.seed = seed >>> 0 || 1;
    this.ticks = 0; this.eaten = 0; this.score = 0; this.alive = true; this.cause = null; this.maxLength = 1;
    this.cuts = 0; this.lostToFood = 0; this.lostToVoid = 0; this.reshaped = 0; this.log = []; this.events = [];
    this.word = []; this.carry = 0; this.joints = [];
    this.world = buildDuct("", this.opts.C);
    this.names = namesOf(this.world, this.opts.ground, this.opts.turn);
    // start on top of the head end, crawling back along it, like Molt
    const W = this.world, top = W.faces.findIndex((F) => F.k === W.L - 1 && F.d === W.uin[W.L - 1]);
    const C = W.C, mid = (C - 1) >> 1, F = W.faces[top];
    this.body = [top * C * C + mid * C + mid];
    this.inSide = [F.p, F.r, neg(F.p), neg(F.r)].indexOf(W.dout[W.L - 1]);
    this.next = -1; this.pending = this.opts.start - 1;
    this.food = new Set(); this.spawn();
  }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  get head() { return this.body[0]; }
  straight() { return (this.inSide + 2) % 4; }
  steer(s) { if (!this.alive || s < 0 || s > 3) return; if (this.body.length > 1 && this.world.nb[this.head * 4 + s] === this.body[1]) return; this.next = s; }
  spawn() {
    const want = Math.max(1, Math.round(this.world.N / O_.FOOD_EVERY)), busy = new Set(this.body);
    for (let tries = 0; this.food.size < want && tries < 2000; tries++) {
      const c = Math.floor(this.rnd() * this.world.N);
      if (!busy.has(c) && !this.food.has(c)) this.food.add(c);
    }
  }
  note(kind, text, extra = {}) { const e = { kind, tick: this.ticks, text, ...extra }; this.events.push(e); this.log.push(e); if (this.log.length > 200) this.log.shift(); }
  die(cause, text) { this.alive = false; this.cause = cause; this.note("dead", text, { cause }); }
  lose(cells, why, text) {
    const kept = cells.filter((c) => c >= 0);
    this.cuts++; this.lostToFood += kept.length; this.lostToVoid += cells.length - kept.length;
    for (const c of kept) this.food.add(c);
    this.note("cut", text, { lost: cells.length, food: kept.length, why });
  }

  /* the world as the word now says; returns how to carry a cell of the old world onto it (-1: gone) */
  reshape(word, kind, m) {
    const ground = this.opts.ground, Old = this.world, C = Old.C, CC = C * C, oldNames = this.names;
    // anchor "head": keep the cube under the head where it was (same place, same frame), so the world bends round you.
    // anchor "path": keep the path where it was, so the world slithers along it like a snake, a cube a step, its
    // bends staying put in space (the new tail cube sits where the old cube behind it was, leaving the way that one did)
    const off = kind === "cut" ? m : (ground === "space" || this.opts.anchor === "path") && kind === "step" ? 1 : 0;
    let W;
    if (this.opts.anchor === "path") { const ok = Math.min(Old.L - 1, off); W = anchored(word.join(""), C, 0, { f: Old.dout[ok], u: Old.uin[Math.min(Old.L - 1, ok + 1)], pos: Old.P[ok] }); }
    else {
      const nk = Math.max(0, Math.min(word.length + 1, Old.faces[(this.head / CC) | 0].k - off)), ok = Math.min(Old.L - 1, nk + off);
      W = anchored(word.join(""), C, nk, { f: Old.din[ok], u: Old.uin[ok], pos: Old.P[ok] });
    }
    const names = namesOf(W, ground, this.opts.turn);
    const map = (c) => { if (c < 0) return -1; const n = carry(oldNames.key[c], kind, m, ground, Old.L, CC, W); return n >= 0 && names.at.has(n) ? names.at.get(n) : -1; };
    // how many cubes changed shape: each cube's bend, before and after
    const bend = (w, k, L) => (k >= 1 && k <= L - 2 ? w[k - 1] : "");
    for (let k = 0; k < W.L; k++) if (k + off >= Old.L || bend(word, k, W.L) !== bend(this.word, k + off, Old.L)) this.reshaped++;
    this.world = W; this.names = names; this.word = word;
    return { map, Old, oldNames };
  }

  /* put the body on the new world (r: what reshape returned) */
  place(r) {
    const { map, Old, oldNames } = r, W = this.world, old = this.body;
    let h = map(old[0]);
    let neck;
    if (h < 0) {
      if (this.opts.fall !== "slide") { this.die("fell", "the ground under your head went with your tail"); this.body = [0]; return false; }
      // slide: the world's tail end pulls you in with it, onto the middle of its new cap, facing back along it
      const C = W.C, mid = (C - 1) >> 1, cap = W.faces.findIndex((F) => F.k === 0 && F.d === neg(W.dout[0])), F = W.faces[cap];
      h = cap * C * C + mid * C + mid;
      neck = [F.p, F.r, neg(F.p), neg(F.r)].indexOf(W.uin[0]);
      this.note("cut", "the world shrank from under your head: you slid down onto its new tail end", { lost: 0, food: 0, why: "slide" });
    } else neck = sideByName(W, this.names, h, sideName(Old, oldNames, old[0], this.inSide));
    if (neck >= 0) this.inSide = neck;
    let body = [h], cut = -1, why = "fold";
    if (this.opts.body === "retrace") {
      ({ body, cut } = lay(W, h, this.inSide, this.joints, old.length));
      why = "knot";
    } else {
      body = old.map(map);
      for (let i = 1; i < body.length; i++) if (body[i] < 0 || sideTo(W, body[i - 1], body[i]) < 0) { cut = i; why = body[i] < 0 ? "ground" : "fold"; break; }
      if (cut > 0) body = body.slice(0, cut);
      if (body.length > 1) this.inSide = sideTo(W, body[0], body[1]);
    }
    const food = [...this.food].map(map).filter((c) => c >= 0);
    this.food = new Set(food);
    if (cut > 0) {
      const busy = new Set(body);
      this.lose(old.slice(cut).map(map).map((c) => (busy.has(c) ? -1 : c)), why,
        `cut ${old.length - cut} off your tail: ` + (why === "knot" ? "your shape, laid on the bent world, ran into itself" : why === "ground" ? "its ground went" : "a bend swept between two of your cells"));
    }
    this.body = body; this.joints.length = Math.max(0, body.length - 2);
    // food your body was laid over is pressed flat
    for (const c of body) this.food.delete(c);
    return true;
  }

  /* after a cut the world is as long as you are (shrink "body"): cubes off its tail end, which can cut again */
  fit() {
    for (let round = 0; this.alive && this.opts.shrink === "body"; round++) {
      const m = this.word.length - Math.max(0, this.body.length - 2);
      if (m <= 0) return;
      const before = this.body.length;
      if (!this.place(this.reshape(this.word.slice(m), "cut", m))) return;
      if (this.body.length < before && this.log.length) this.log[this.log.length - 1].text += " (the shorter world broke you again)";
    }
  }

  tick() {
    this.events = [];
    if (!this.alive) return;
    this.ticks++;
    const W = this.world, s = this.next >= 0 ? this.next : this.straight(); this.next = -1;
    const a = this.head, b = W.nb[a * 4 + s], tailMoves = this.pending === 0;
    const hit = this.body.indexOf(b);
    let bitten = 0;
    if (hit >= 0 && !(tailMoves && hit === this.body.length - 1)) {
      if (this.opts.bite !== "cut" || hit < 2) { this.die("bitten", "you bit yourself"); return; }
      const off = this.body.splice(hit);                   // the bite itself is gone; what's behind it is food
      this.joints.length = Math.max(0, this.body.length - 2);
      bitten = off.length;
      this.lose(off.map((c) => (c === b ? -1 : c)), "bite", `you bit off ${off.length} of your tail`);
    }
    // the turn you make here, read off the world as Molt reads a body: yaw from the cell's sides, pitch from the fold behind it
    const before = this.body.slice();
    const d = (s - this.inSide + 4) % 4, y = d === 2 ? "S" : d === 3 ? "L" : "R";
    const p = this.carry + (this.body.length > 1 ? fold(W, this.body[1], a) : 0), now = Math.sign(p);
    this.carry = p - now;
    const tok = (now > 0 ? "D" : now < 0 ? "U" : "") + y;
    this.inSide = W.back[a * 4 + s];
    this.body.unshift(b); this.joints.unshift(d);
    if (this.pending > 0) this.pending--; else this.body.pop();
    this.joints.length = Math.max(0, this.body.length - 2);
    if (this.food.has(b)) { this.food.delete(b); this.pending++; this.eaten++; this.score++; this.note("eat", "ate"); }
    this.maxLength = Math.max(this.maxLength, this.body.length);
    // the world follows: your newest turn becomes the bend behind its head. A bite is the world's to catch up
    // with afterwards (fit), so the step is taken at the length you were.
    const tokensNow = Math.max(this.opts.shrink === "keep" ? this.word.length : 0, this.body.length + bitten - 2);
    const w = tokensNow ? [...this.word, tok].slice(-tokensNow) : [];
    const kind = !this.word.length && !w.length ? "same" : w.length > this.word.length ? "grow" : "step";
    // what this step did to the world, for anything drawing it in motion: the world before, the turn, how it moved
    this.last = { kind, prev: this.world, prevNames: this.names, prevBody: before, tok, cuts: this.cuts };
    if (this.place(this.reshape(w, kind, 0))) this.fit();
    this.last.cut = this.cuts !== this.last.cuts;
    if (this.alive) this.spawn();
  }
}
export { census };

/* time slows as the world bends. Every bend sweeps a cube a step, so the more of the world is bent, the more of it
   changes under you each step, and a step takes longer: full speed while no more than EASY of the world's cubes
   bend (a snake going round its tube crosses a fold every C cells, and every fold is a bend), up to 1 + SLOW times
   as long when every cube does. The share of the world, not the count, so a long snake isn't slowed for its length. */
export const SLOW = 1, EASY = 0.2;
export function pace(g) {
  const w = g.word;
  if (!w.length) return 1;
  const bent = w.filter((t) => t !== "S").length / w.length;
  return 1 + SLOW * Math.max(0, bent - EASY) / (1 - EASY);
}

/* a simple player for the lab and the selftest: the shortest way to food round your own body, sometimes a random free turn */
export function autopilot(g, rnd = Math.random, focus = 0.85) {
  const W = g.world, busy = new Set(g.pending ? g.body : g.body.slice(0, -1)), prev = new Map([[g.head, -1]]), q = [g.head];
  if (rnd() < focus) while (q.length) {
    const c = q.shift();
    if (g.food.has(c) && c !== g.head) { let x = c; while (prev.get(x) !== g.head) x = prev.get(x); for (let s = 0; s < 4; s++) if (W.nb[g.head * 4 + s] === x) { g.steer(s); return; } }
    for (let s = 0; s < 4; s++) { const n = W.nb[c * 4 + s]; if (!prev.has(n) && !busy.has(n)) { prev.set(n, c); q.push(n); } }
  }
  const free = [0, 1, 2, 3].filter((s) => !busy.has(W.nb[g.head * 4 + s]));
  if (free.length) g.steer(free[(rnd() * free.length) | 0]);
}
