// trajectory.js — projectile paths for the tactical arena. The grid-arena cousin of fable's /flux engine
// (flux/js/engine.js simulate() — a full continuous-physics launch with attractors, bumpers, walls, drag,
// traced to a sampled path). The arena doesn't need the physics search: a thrown potion is LOBBED at a
// known target cell, arcing OVER the heads between (potions don't need line-of-sight — that's the point of
// throwing one). So this is the lightweight half: a deterministic parabolic arc between two points, sampled
// for the throw animation, plus a couple of helpers that will serve any future projectile (grenades,
// bolts, tossed gear). Pure, DOM-free, node-tested.

// arcPoint — the position along a lob from `a` to `b` at parameter t∈[0,1]. The parabola rises `apex`
// units above the straight chord at its midpoint (t=0.5) and returns to b. In arena coords y grows DOWN,
// so "up" is −y: the arc bulges toward smaller y. apex defaults to a fraction of the throw distance so a
// long throw arcs higher than a lob to an adjacent cell.
export function arcPoint(a, b, t, apex) {
  const x = a.x + (b.x - a.x) * t;
  const yLine = a.y + (b.y - a.y) * t;
  const h = (apex == null ? defaultApex(a, b) : apex) * 4 * t * (1 - t);   // parabola peaking at t=0.5
  return { x, y: yLine - h };
}

// a sensible arc height from the throw distance (bounded so short lobs still read as a toss).
export function defaultApex(a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return Math.max(0.6, Math.min(4, d * 0.34));
}

// lob — sample the whole arc into `n+1` points (for drawing a trail or stepping a projectile). Deterministic.
export function lob(a, b, { apex = null, n = 24 } = {}) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(arcPoint(a, b, i / n, apex));
  return pts;
}

// spin — a cosmetic rotation angle (radians) for a tumbling thrown object, from its progress t and the
// throw distance (a longer throw tumbles more). Deterministic; no wall-clock.
export function spin(a, b, t) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return t * (2 + d * 0.5) * Math.PI * 2;
}

export default { arcPoint, defaultApex, lob, spin };
