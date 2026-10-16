/* Tessera — a tiling of the flat torus that can change shape without breaking.

   The cells are the points of a fixed square lattice, and they never move,
   appear or vanish: a morph only redraws the walls between them. That one
   choice buys most of the conservation laws for nothing:

     cells        N = W·H, always; cell i is always lattice point i
     torus        the wrap is a lattice vector, so the board's frame never shears
     coverage     every wall is ONE curve owned by the wall, drawn by both of
                  the cells it separates, so there is never a gap or an overlap
     Euler        V − E + F = 0 on a torus, so 1/f̄ + 1/v̄ = 1/2 exactly, where
                  f̄ is the mean number of neighbours and v̄ the mean number of
                  cells meeting at a corner

   Each lattice point L carries a split h ∈ [−HMAX, HMAX]. At h = 0 four cells
   meet at L (a square corner). At h > 0 the corner splits into two vertices
   L ± h(1,−1) joined by a short wall, and the cells to the lower left and
   upper right of L become neighbours; at h < 0 the split is L ± |h|(1,1) and
   the other diagonal pair meets. So a neighbour is gained or lost only when
   a wall's length passes through zero (a T1 move, in the language of foams):
   the topology changes only where the geometry is continuous.

   Every lattice point has four ports — where the wall going up, down, left
   and right from it ends:
       up = L + (−h, |h|)   dn = L + (h, −|h|)   lt = L + (−|h|, h)   rt = L + (|h|, −h)
   h > 0: up = lt and dn = rt.  h < 0: up = rt and dn = lt.  The short wall
   C(L) runs dn → up and has length 2√2|h|.

   Walls are curves: a chord P→Q bent by g(t)·perp(Q−P), with
       g(t) = sin(πt) · Σ c_k sin(kπt)
   which leaves both ends along the chord, so the curve can't kink into the
   next wall at a corner. Only c_1 moves area: a wall moves L²·c_1/2 from the
   cell on its left to the cell on its right. That makes area a FLUX: a cell's
   area changes by the divergence of the c_1 field around it. Figures with
   c_1 = 0 can vary freely in space and time and every cell keeps area 1. */

export const T_ = { HMAX: 0.25, EPS: 1e-9, SAMPLES: 10, H_PERIOD: 12, F_PERIOD: 17, RIPPLE: 6 };

/* Wall shapes, as the c_k of g(t), per wall family: A walls run up the right
   side of a cell, B walls along its top. C walls (the short ones) stay straight. */
export const FIGURES = {
  plain:  { A: [0, 0, 0, 0], B: [0, 0, 0, 0], note: "straight walls" },
  fish:   { A: [0, 0.37, 0, -0.065], B: [0, 0.33, 0.13, 0], note: "S-curves that move no area: every cell keeps area 1, however the shape varies" },
  bulge:  { A: [0.22, 0.16, 0, 0], B: [-0.2, 0.16, 0, 0], note: "walls that bulge, so each one moves area: where the shape varies across the board, cells swell and shrink" },
  tangle: { A: [0, 0.962, 0, -0.169], B: [0, 0.858, 0.338, 0], note: "the same S-curves pushed too far: walls cross, and the cells they cross are no longer cells. Note that it is the fronts, where neighbouring corners differ, that tangle first" },
};

export const MODES = {
  breathe: "the whole board at once: squares ↔ hexagons leaning one way ↔ squares ↔ hexagons leaning the other",
  wave: "a front along the board: the morph is the same down every column, so every cell keeps area 1",
  ripple: "a front spreading from the centre: it bends, so area moves between cells",
};

const mod = (a, n) => ((a % n) + n) % n;

export class Tiling {
  constructor(W, H) {
    if (W % 2 || H % 2) throw new Error("the torus needs even sides (for the four-colouring)");
    this.W = W; this.H = H; this.N = W * H;
    this.h = new Float64Array(this.N);      // split at each lattice point
    this.phiA = new Float64Array(this.N);   // blend from fig0 to fig1, per A wall
    this.phiB = new Float64Array(this.N);   // ... and per B wall
    this.fig0 = FIGURES.plain; this.fig1 = FIGURES.fish;
  }
  idx(x, y) { return mod(x, this.W) + this.W * mod(y, this.H); }
  xy(i) { return [i % this.W, (i / this.W) | 0]; }

  /* the four ports of lattice point (X, Y), in absolute (unwrapped) coordinates */
  port(X, Y, which) {
    const h = this.h[this.idx(X, Y)], a = Math.abs(h);
    switch (which) {
      case "up": return [X - h, Y + a];
      case "dn": return [X + h, Y - a];
      case "lt": return [X - a, Y + h];
      default:   return [X + a, Y - h];   // rt
    }
  }
  coeffs(fam, i) {
    const p = fam === "A" ? this.phiA[i] : this.phiB[i], a = this.fig0[fam], b = this.fig1[fam];
    return a.map((v, k) => v + (b[k] - v) * p);
  }

  /* One cell's boundary, counter-clockwise, as sides. Each side is a wall in
     its canonical direction (P0→Q0, coefficients c) plus whether this cell
     walks it backwards, and who is on the other side. */
  sides(i) {
    const [x, y] = this.xy(i), out = [];
    const wall = (kind, id, P0, Q0, c, rev, nb, dx, dy) => out.push({ kind, id, P0, Q0, c, rev, nb, dx, dy,
      P: rev ? Q0 : P0, Q: rev ? P0 : Q0 });
    const corner = (X, Y, from, to, rev, nb, dx, dy) => {
      const A = this.port(X, Y, from), B = this.port(X, Y, to);
      if (Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) < T_.EPS) return;
      const P0 = this.port(X, Y, "dn"), Q0 = this.port(X, Y, "up");
      wall("C", 2 * this.N + this.idx(X, Y), P0, Q0, null, rev, nb, dx, dy);
    };
    const N = this.N;
    // bottom: B wall of the cell below, walked forwards
    wall("B", N + this.idx(x, y - 1), this.port(x, y, "rt"), this.port(x + 1, y, "lt"), this.coeffs("B", this.idx(x, y - 1)), false, this.idx(x, y - 1), 0, -1);
    corner(x + 1, y, "lt", "up", false, this.idx(x + 1, y - 1), 1, -1);
    // right: this cell's own A wall, forwards
    wall("A", i, this.port(x + 1, y, "up"), this.port(x + 1, y + 1, "dn"), this.coeffs("A", i), false, this.idx(x + 1, y), 1, 0);
    corner(x + 1, y + 1, "dn", "lt", false, this.idx(x + 1, y + 1), 1, 1);
    // top: this cell's own B wall, backwards
    wall("B", N + i, this.port(x, y + 1, "rt"), this.port(x + 1, y + 1, "lt"), this.coeffs("B", i), true, this.idx(x, y + 1), 0, 1);
    corner(x, y + 1, "rt", "dn", true, this.idx(x - 1, y + 1), -1, 1);
    // left: the A wall of the cell to the left, backwards
    wall("A", this.idx(x - 1, y), this.port(x, y, "up"), this.port(x, y + 1, "dn"), this.coeffs("A", this.idx(x - 1, y)), true, this.idx(x - 1, y), -1, 0);
    corner(x, y, "up", "rt", true, this.idx(x - 1, y - 1), -1, -1);
    return out;
  }

  /* the neighbours, in counter-clockwise order, with the lattice step to each */
  neighbours(i) { return this.sides(i).map((s) => ({ nb: s.nb, dx: s.dx, dy: s.dy, kind: s.kind, len: Math.hypot(s.Q[0] - s.P[0], s.Q[1] - s.P[1]) })); }

  /* the boundary as a closed polyline (last point omitted), S segments per curved wall */
  outline(i, S = T_.SAMPLES) {
    const pts = [];
    for (const s of this.sides(i)) {
      const n = s.c && s.c.some((v) => v) ? S : 1, seg = arc(s.P0, s.Q0, s.c, n);
      if (s.rev) seg.reverse();
      for (let k = 0; k < n; k++) pts.push(seg[k]);
    }
    return pts;
  }

  /* exact area: the polygon of the corners, plus what each wall's c_1 moves */
  area(i) {
    const sd = this.sides(i);
    let a = 0;
    for (const s of sd) {
      a += (s.P[0] * s.Q[1] - s.Q[0] * s.P[1]) / 2;
      if (s.c) { const L2 = (s.Q0[0] - s.P0[0]) ** 2 + (s.Q0[1] - s.P0[1]) ** 2; a += (s.rev ? 1 : -1) * L2 * s.c[0] / 2; }
    }
    return a;
  }

  /* the counts, taken from the walls themselves rather than from a formula */
  census() {
    const V = new Set(), E = new Set(), key = (p) => mod(Math.round(p[0] * 1e9), this.W * 1e9) + "," + mod(Math.round(p[1] * 1e9), this.H * 1e9);
    let nb = 0, amin = Infinity, amax = -Infinity, atot = 0;
    for (let i = 0; i < this.N; i++) {
      const sd = this.sides(i);
      nb += sd.length;
      for (const s of sd) { V.add(key(s.P)); E.add(s.id); }
      const a = this.area(i); atot += a; if (a < amin) amin = a; if (a > amax) amax = a;
    }
    const v = V.size, e = E.size, f = this.N;
    return { V: v, E: e, F: f, chi: v - e + f, fbar: nb / f, vbar: 2 * e / v, amin, amax, atot, split: v - f };
  }

  /* law 5, the one that must be checked: a boundary that crosses itself */
  simple(i, S = 8) {
    const p = this.outline(i, S), n = p.length;
    let a = 0;
    for (let k = 0; k < n; k++) { const q = p[(k + 1) % n]; a += p[k][0] * q[1] - q[0] * p[k][1]; }
    if (a <= 0) return false;
    for (let k = 0; k < n; k++) for (let m = k + 2; m < n; m++) {
      if (k === 0 && m === n - 1) continue;
      if (cross(p[k], p[(k + 1) % n], p[m], p[(m + 1) % n])) return false;
    }
    return true;
  }

  /* the corner states: +1 / 0 / −1 per lattice point, to count joins and pinches */
  states() { return Int8Array.from(this.h, (h) => (h > T_.EPS ? 1 : h < -T_.EPS ? -1 : 0)); }
}

/* a curved wall, n+1 points from P to Q */
export function arc(P, Q, c, n) {
  const dx = Q[0] - P[0], dy = Q[1] - P[1], out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    let g = 0;
    if (c) { const s = Math.sin(Math.PI * t); for (let j = 0; j < c.length; j++) if (c[j]) g += c[j] * Math.sin((j + 1) * Math.PI * t); g *= s; }
    out.push([P[0] + t * dx - g * dy, P[1] + t * dy + g * dx]);
  }
  return out;
}

function cross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && d1 && d2 && d3 && d4;
}

/* The morph, as fields over the lattice: split h at each lattice point and
   figure blend φ on each wall, at time t (seconds). */
export function morph(T, mode, t) {
  const { W, H } = T, wH = (2 * Math.PI) / T_.H_PERIOD, wF = (2 * Math.PI) / T_.F_PERIOD;
  const phase = (x, y) => {
    if (mode === "wave") return (2 * Math.PI * x) / W;
    if (mode === "ripple") {
      const dx = Math.min(Math.abs(x - W / 2), W - Math.abs(x - W / 2)), dy = Math.min(Math.abs(y - H / 2), H - Math.abs(y - H / 2));
      return (2 * Math.PI * Math.hypot(dx, dy)) / T_.RIPPLE;
    }
    return 0;
  };
  for (let i = 0; i < T.N; i++) {
    const x = i % W, y = (i / W) | 0;
    T.h[i] = T_.HMAX * Math.sin(wH * t - phase(x, y));
    T.phiA[i] = (1 - Math.cos(wF * t - phase(x + 1, y + 0.5))) / 2;
    T.phiB[i] = (1 - Math.cos(wF * t - phase(x + 0.5, y + 1))) / 2;
  }
}
