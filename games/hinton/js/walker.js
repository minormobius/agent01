/* Hinton's walker: you move continuously, the world stays Anakata's grid,
   and every cell you cross into is decided by its rules. No DOM, so the
   selftest can drive it.

   You are a point in x and y with a radius R, at the centre of your cell in
   z and w. Within a cell you move freely. When your edge reaches the next
   cell, the walker asks the world what a step that way does (World.act):
     nothing          you're stopped at the wall, R short of it;
     a plain step,    you carry on, and the step happens when your centre
     a push, a fall,  crosses into the next cell; then gravity takes you
     a slip           down in z (and kata in w, where w is a down) at its
                      own pace, and you can move about meanwhile, but not
                      leave the cell;
     a climb          (up a step in z) or a ramp step (a slice along w):
                      it happens at once, and you rise (or lean through w)
                      and glide over into the next cell before you can move
                      again.
   So the walker only ever makes the moves the rules make, one per cell
   crossed: every level's par, and every proof about it, holds here too.
   The hook is the same: one action, then you're pulled along its line.

   w can wrap round: your w is a real number that keeps counting past the
   seam, and the cell you're in is read mod W. */
export const R = 0.22, SPEED = 3.2, RISE = 5, G = 30, PULL = 14;

export class Walker {
  constructor(world) { this.world = world; this.reset(); }
  reset() {
    const w = this.world;
    this.s = { p: w.start.p, crates: w.start.crates.slice() };
    this.hist = []; this.moves = 0;
    this.P = this.center(this.s.p); this.v = [0, 0, 0, 0];
    this.glide = null; this.pull = null; this.dead = 0; this.probes = new Map();
    this.crates = this.s.crates.map((c) => ({ at: this.center(c), to: this.center(c) }));
  }
  /* the centre of cell i (in the copy of a wrapped w nearest `near`) */
  center(i, near = this.P) {
    const c = this.world.coords(i), p = [c[0] + 0.5, c[1] + 0.5, c[2] + 0.5, c[3] + 0.5];
    if (this.world.wrap && near) { const W = this.world.W; p[3] += W * Math.round((near[3] - p[3]) / W); }
    return p;
  }
  cell() { return this.world.coords(this.s.p); }
  target() { return this.center(this.s.p); }
  /* still moving to where the rules put you: rising, gliding, pulled, falling */
  busy() {
    if (this.glide || this.pull || this.dead > 0) return true;
    const T = this.target();
    return Math.abs(T[2] - this.P[2]) > 0.02 || Math.abs(T[3] - this.P[3]) > 0.02;
  }
  won() { return this.world.won(this.s) && !this.busy(); }

  /* what a step along d would do from here (cached until the next move) */
  probe(d) {
    const k = d.join();
    if (!this.probes.has(k)) this.probes.set(k, this.world.act(this.s, { kind: "walk", d }));
    return this.probes.get(k);
  }
  commit(n) {
    const old = this.crates.map((c) => c.to);
    this.hist.push(this.s); this.s = n; this.moves++; this.probes.clear();
    // each crate's drawing follows the crate it was, nearest first
    const now = n.crates.map((c) => this.center(c)), used = new Set(), pairs = [], next = Array(old.length).fill(null);
    old.forEach((o, i) => now.forEach((q, j) => pairs.push([Math.hypot(o[0] - q[0], o[1] - q[1], o[2] - q[2], o[3] - q[3]), i, j])));
    pairs.sort((a, b) => a[0] - b[0]);
    for (const [, i, j] of pairs) if (next[i] === null && !used.has(j)) { next[i] = j; used.add(j); }
    this.crates = this.crates.map((c, i) => (next[i] === null ? { at: c.at, to: [c.at[0], c.at[1], c.at[2] - 6, c.at[3]], gone: true } : { at: c.at, to: now[next[i]] }));
  }
  /* a step that moves you up or through w isn't walked into: it's taken, and you glide */
  glides(n) {
    if (n.dead) return false;
    const a = this.cell(), b = this.world.coords(n.p);
    if (b[2] > a[2]) return true; // a climb
    return b[2] === a[2] && b[3] !== a[3] && (this.world.onRamp(this.s.p) || this.world.onRamp(n.p)); // a ramp step
  }

  /* move by (dx, dy) in x and y; returns what happened: null, "step", "blocked", "fell" */
  move(dx, dy) {
    let out = null;
    for (const [a, dd] of [[0, dx], [1, dy]]) {
      if (!dd || this.glide || this.pull || this.dead > 0) continue;
      const c = this.cell(), lo = c[a], hi = c[a] + 1, dir = Math.sign(dd);
      let x = this.P[a] + Math.max(-0.4, Math.min(0.4, dd));
      if (this.busy()) { this.P[a] = Math.max(lo + R, Math.min(hi - R, x)); continue; } // landing: stay in your cell
      if (dir > 0 ? x + R > hi : x - R < lo) {
        const d = [0, 0, 0, 0]; d[a] = dir;
        const n = this.probe(d);
        if (!n) { x = dir > 0 ? Math.min(x, hi - R) : Math.max(x, lo + R); out = out || "blocked"; }
        else if (this.glides(n)) {
          const from = this.P.slice();
          this.commit(n);
          const T = this.target(), end = from.slice(); end[a] = dir > 0 ? hi + R + 0.05 : lo - R - 0.05; end[2] = T[2]; end[3] = T[3];
          const up = from.slice(); up[2] = T[2];
          const pts = T[2] > from[2] + 0.01 ? [from, up, end] : [from, end]; // a climb rises, then goes over; a ramp step leans straight through

          this.glide = { pts, k: 0, t: 0 };
          return "step";
        } else if (dir > 0 ? x >= hi : x < lo) { // your centre's across: the step happens
          this.commit(n); out = n.dead ? "fell" : "step";
          if (n.dead) { this.dead = 0.9; this.v = [0, 0, 0, 0]; }
        }
      }
      this.P[a] = x;
    }
    return out;
  }

  /* the hook along d (Anakata's lane): returns { what, k } for the line, or null if busy */
  hook(d) {
    if (this.busy()) return null;
    const r = this.world.reach(this.s, d), n = this.world.act(this.s, { kind: "hook", d });
    if (!n) return { what: "miss", k: r.k, moved: false };
    const from = this.P.slice(), c = this.center(this.s.p), wasAt = this.s.p;
    this.commit(n);
    if (n.p !== wasAt) { // pulled along the line to the cell before the anchor, then down from there
      const to = c.map((v, j) => v + d[j] * (r.k - 1)); // straight out, even round a wrapped w
      this.pull = { from, to, t: 0, dur: Math.max(0.12, (r.k - 1) / PULL) };
    }
    return { what: r.what, k: r.k, moved: n.p !== wasAt };
  }

  undo() {
    if (!this.hist.length) return false;
    this.s = this.hist.pop(); this.moves = Math.max(0, this.moves - 1); this.probes.clear();
    this.P = this.center(this.s.p); this.v = [0, 0, 0, 0]; this.glide = null; this.pull = null; this.dead = 0;
    this.crates = this.s.crates.map((c) => ({ at: this.center(c), to: this.center(c) }));
    return true;
  }

  /* time passes: gliding, pulling, falling, crates sliding. Returns "fell" when a fall out of the world is undone */
  update(dt) {
    for (const c of this.crates) for (let j = 0; j < 4; j++) {
      const d = c.to[j] - c.at[j], step = (j === 2 || (j === 3 && this.world.gravW) ? 7 : 5) * dt;
      c.at[j] = Math.abs(d) <= step ? c.to[j] : c.at[j] + Math.sign(d) * step;
    }
    this.crates = this.crates.filter((c) => !(c.gone && c.at[2] <= c.to[2]));
    if (this.dead > 0) {
      this.dead -= dt; this.v[2] += G * dt; this.P[2] -= this.v[2] * dt; if (this.world.gravW) this.P[3] -= this.v[2] * dt * 0.7;
      if (this.dead <= 0) { this.undo(); return "fell"; }
      return null;
    }
    if (this.glide) {
      const g = this.glide, a = g.pts[g.k], b = g.pts[g.k + 1], len = Math.max(0.05, Math.hypot(...b.map((v, j) => v - a[j]))), dur = len / (g.k === 0 && g.pts.length === 3 ? RISE : SPEED * 1.2);
      g.t += dt / dur;
      if (g.t >= 1) { g.k++; g.t = 0; if (g.k >= g.pts.length - 1) { this.P = g.pts[g.pts.length - 1].slice(); this.glide = null; } else this.P = b.slice(); }
      else this.P = a.map((v, j) => v + (b[j] - v) * g.t);
      return null;
    }
    if (this.pull) {
      const p = this.pull; p.t += dt / p.dur;
      if (p.t >= 1) { this.P = p.to.slice(); this.pull = null; } else this.P = p.from.map((v, j) => v + (p.to[j] - v) * p.t);
      return null;
    }
    // to where the rules put you: up at a steady rate, down under gravity; sideways in w (Anakata) steadily
    const T = this.target();
    for (const j of [0, 1]) if (Math.abs(T[j] - this.P[j]) > 0.5 + 1e-6) this.P[j] += Math.sign(T[j] - this.P[j]) * Math.min(Math.abs(T[j] - this.P[j]) - 0.5, SPEED * dt);
    for (const j of [2, 3]) {
      const d = T[j] - this.P[j];
      if (Math.abs(d) < 1e-4) { this.P[j] = T[j]; this.v[j] = 0; continue; }
      const down = j === 2 || this.world.gravW;
      if (d > 0 || !down) { this.P[j] += Math.sign(d) * Math.min(Math.abs(d), (down ? RISE : SPEED * 1.5) * dt); this.v[j] = 0; }
      else { this.v[j] += G * dt; this.P[j] = Math.max(T[j], this.P[j] - this.v[j] * dt); }
    }
    return null;
  }
}
