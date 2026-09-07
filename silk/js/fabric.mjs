// fabric.mjs — the silk, as a physical object.
//
// This is the agent's ENVIRONMENT and its MEMORY at the same time. The weaver
// in weaver.mjs holds no map of the web it is building: every question it asks
// ("how far is the next radius?", "where does this frame edge run?", "what is
// under my feet?") is answered by measuring *this* structure, in its current,
// sagging, already-loaded state. That is the whole reason the fabric is a
// physics object and not a display list.
//
// Two consequences that matter and are easy to miss:
//
//   1. THREADS PULL, THEY DO NOT PUSH. A silk line under compression is slack;
//      it exerts nothing. So the constraint solver only ever shortens an
//      over-long thread. Structure is held by pre-tension against pinned
//      anchors, exactly as a real web is, which is why cutting one frame
//      thread visibly slackens a whole sector instead of doing nothing.
//
//   2. GEOMETRY IS READ LIVE. A radius attached at "40% of the way out" is
//      attached 40% of the way along the radius AS IT NOW HANGS, not along the
//      straight line it was laid on. Early threads sag under the ones added
//      after them, so the same instruction executed later lands somewhere
//      else. This is one of the four path dependencies the surface is about.

// ---------------------------------------------------------------- geometry --

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Ray (o, d) against a closed polygon. Returns the nearest forward hit.
// Solve o + t·d = a + u·e by crossing with e and with d.
export function rayPolygon(ox, oy, dx, dy, poly) {
  let best = Infinity;
  let hit = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - ox) * ey - (a.y - oy) * ex) / den;
    const u = ((a.x - ox) * dy - (a.y - oy) * dx) / den;
    if (t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 && t < best) {
      best = t;
      hit = { x: ox + dx * t, y: oy + dy * t, t, edge: i, u: Math.min(1, Math.max(0, u)) };
    }
  }
  return hit;
}

// Andrew's monotone chain. The frame of a real web is convex for a mechanical
// reason — a re-entrant corner would be pulled straight by the radii the moment
// they were tensioned — so the hull is not a simplification here, it is the
// shape the tension field admits.
export function convexHull(points) {
  const pts = points.slice().sort((p, q) => (p.x - q.x) || (p.y - q.y));
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// ------------------------------------------------------------ thread kinds --
//
// Kind is not decoration. It sets stiffness, whether the thread is sticky (and
// therefore counts as capture area), and whether the spider is allowed to walk
// on it — a real orb-weaver does not walk on its own capture spiral.

export const KIND = {
  bridge:  { stiff: 1.00, pre: 0.036, walk: true,  sticky: false },
  frame:   { stiff: 1.00, pre: 0.032, walk: true,  sticky: false },
  anchor:  { stiff: 1.00, pre: 0.035, walk: true,  sticky: false },
  radius:  { stiff: 0.95, pre: 0.008, walk: true,  sticky: false },
  hub:     { stiff: 0.90, pre: 0.015, walk: true,  sticky: false },
  aux:     { stiff: 0.55, pre: 0.004, walk: true,  sticky: false },
  capture: { stiff: 0.45, pre: 0.000, walk: false, sticky: true },
};

// -------------------------------------------------------------- the fabric --

export class Fabric {
  constructor({ gravity = 0.18, damping = 0.94 } = {}) {
    this.nodes = [];
    this.threads = [];
    this.gravity = gravity;
    this.damping = damping;
    this.silkSpent = 0;   // total length ever laid (reclaimed silk is credited back)
    this.silkReclaimed = 0;
    this.generation = 0;  // bumped on every topology change, for cheap render caching
  }

  node(x, y, { pinned = false, kind = 'free' } = {}) {
    const n = { x, y, px: x, py: y, pinned, kind };
    this.nodes.push(n);
    return n;
  }

  thread(a, b, kind, { rest = null } = {}) {
    const k = KIND[kind] || KIND.radius;
    const L = dist(a, b);
    const t = {
      a, b, kind,
      rest: rest === null ? L * (1 - k.pre) : rest,
      laid: L,
      stiff: k.stiff,
      dead: false,
    };
    this.threads.push(t);
    this.silkSpent += L;
    this.generation++;
    return t;
  }

  len(t) { return dist(t.a, t.b); }

  // Remove a thread and credit the silk back. A real orb-weaver eats the
  // auxiliary spiral as it lays the capture spiral over it, recovering most of
  // the protein — which is why the budget in this model is a *running* balance
  // and not a one-way meter.
  cut(t, { reclaim = 1 } = {}) {
    if (t.dead) return;
    t.dead = true;
    this.silkReclaimed += this.len(t) * reclaim;
    this.generation++;
  }

  compact() {
    this.threads = this.threads.filter((t) => !t.dead);
    this.generation++;
  }

  get silkUsed() { return this.silkSpent - this.silkReclaimed; }

  // Split a thread at parameter s along its CURRENT geometry, returning the new
  // node. Both halves keep the parent's kind, and their rest lengths are split
  // in the same proportion, so an attachment neither slackens nor tightens the
  // line it lands on.
  split(t, s) {
    const u = Math.min(0.985, Math.max(0.015, s));
    const x = t.a.x + (t.b.x - t.a.x) * u;
    const y = t.a.y + (t.b.y - t.a.y) * u;
    const n = this.node(x, y, { kind: 'joint' });
    const rest = t.rest;
    const b = t.b;
    t.b = n;
    t.rest = rest * u;
    const t2 = {
      a: n, b, kind: t.kind,
      rest: rest * (1 - u),
      laid: t.laid * (1 - u),
      stiff: t.stiff,
      dead: false,
    };
    t.laid *= u;
    this.threads.push(t2);
    this.generation++;
    return { node: n, first: t, second: t2 };
  }

  // ------------------------------------------------------------- integrate --

  step(sub = 1, iters = 4) {
    for (let s = 0; s < sub; s++) {
      const g = this.gravity;
      for (const n of this.nodes) {
        if (n.pinned) continue;
        const vx = (n.x - n.px) * this.damping;
        const vy = (n.y - n.py) * this.damping;
        n.px = n.x;
        n.py = n.y;
        n.x += vx;
        n.y += vy + g;
      }
      for (let i = 0; i < iters; i++) this.relax();
    }
  }

  relax() {
    for (const t of this.threads) {
      if (t.dead) continue;
      const a = t.a;
      const b = t.b;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-9) continue;
      // TENSION ONLY. A slack thread is not a strut; do nothing.
      if (d <= t.rest) continue;
      const diff = ((d - t.rest) / d) * t.stiff;
      dx *= diff * 0.5;
      dy *= diff * 0.5;
      if (a.pinned && b.pinned) continue;
      if (a.pinned) { b.x -= dx * 2; b.y -= dy * 2; continue; }
      if (b.pinned) { a.x += dx * 2; a.y += dy * 2; continue; }
      a.x += dx; a.y += dy;
      b.x -= dx; b.y -= dy;
    }
  }
}

// ----------------------------------------------------------------- chains --
//
// A radius or a frame edge is not one thread for long: every spiral turn that
// crosses it splits it. A Chain keeps that subdivision ordered so an attachment
// "d along this line" can be resolved without searching the whole fabric —
// and, crucially, so attachments can arrive OUT OF ORDER. The spider works
// alternate sides of the hub and lays the capture spiral inward over an
// auxiliary spiral that went outward, so the same radius is cut at 0.9, then
// 0.2, then 0.85, then 0.25.

export class Chain {
  constructor(fabric, a, b, kind) {
    this.f = fabric;
    this.kind = kind;
    this.nodes = [a, b];
    this.links = [fabric.thread(a, b, kind)];
  }

  get start() { return this.nodes[0]; }
  get end() { return this.nodes[this.nodes.length - 1]; }

  length() {
    let L = 0;
    for (const t of this.links) L += this.f.len(t);
    return L;
  }

  // Attach `d` from the start, measured along the chain as it currently hangs.
  // `snap`: reuse an existing joint within this distance rather than making a
  // near-zero segment — a spider gluing two lines a micron apart has made one
  // junction, not two, and zero-length segments blow up the constraint solver.
  attachAt(d, snap = 3) {
    let acc = 0;
    for (let i = 0; i < this.links.length; i++) {
      const t = this.links[i];
      const L = this.f.len(t);
      const isLast = i === this.links.length - 1;
      if (d <= acc + L || isLast) {
        if (d - acc <= snap) return this.nodes[i];
        if (acc + L - d <= snap) return this.nodes[i + 1];
        const s = (d - acc) / (L || 1);
        const { node, second } = this.f.split(t, s);
        this.links.splice(i + 1, 0, second);
        this.nodes.splice(i + 1, 0, node);
        return node;
      }
      acc += L;
    }
    return this.end;
  }

  attachAtParam(u, snap = 3) { return this.attachAt(u * this.length(), snap); }

  // Distance from the start to a node already on this chain (-1 if absent).
  distanceTo(node) {
    let acc = 0;
    for (let i = 0; i < this.links.length; i++) {
      if (this.nodes[i] === node) return acc;
      acc += this.f.len(this.links[i]);
    }
    return this.end === node ? acc : -1;
  }
}
