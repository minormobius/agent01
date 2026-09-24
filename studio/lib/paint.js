// paint.js — watercolour, gouache and ink on paper, for canvas 2D.
//
// Everything here is a MARK: something a brush lays down over an interval
// [t0, t1] and that then stays on the paper. A Painter keeps a list of marks
// and, given a time, brings a canvas up to date by drawing only what is new
// since the last call — a wash puts down a few more of its glazes, a stroke
// travels a little further. So the painting accumulates like a real one, at the
// cost of nothing but the new paint each frame.
//
// It is still a function of time. Every mark's randomness is a HASH of (mark,
// layer, bristle, segment), never a running generator, so a mark drawn in forty
// slices is identical to the same mark drawn at once. Seeking backwards is
// `reset()` and replay; a still at t is one call.
//
// Techniques:
//   wash    — Tyler Hobbs's layered deformed polygon: a shape is jittered by
//             recursive midpoint displacement, then drawn forty or so times,
//             each time deformed again, at a few percent opacity. The overlaps
//             pile up in the middle and thin out at the edges, which is what a
//             watercolour wash does as it dries.
//   bristle — a brush is N hairs. Each hair follows the stroke at its own offset,
//             carries its own load of paint and runs dry at its own rate, so a
//             stroke breaks up into dry-brush streaks toward its end.
//   ink     — a sumi line: width that swells with pressure, a faint bleed.
//   dab     — a gouache blot: opaque, small, several jittered layers.

export const TAU = Math.PI * 2;

// ------------------------------------------------------------ randomness --

/** A hash to [0, 1) of up to four integers. */
export function hash(a, b = 0, c = 0, d = 0) {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d) ^ Math.imul(d | 0, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(r) {
  let u = 0, v = 0;
  while (u === 0) u = r();
  v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

export const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);

// ------------------------------------------------------------------ paper --

/**
 * Cold-pressed paper: a warm white with mottling at two scales, a fine tooth,
 * and the odd fibre. Rendered once per size.
 */
export function makePaper(w, h, dpr, seed = 5) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4eee2';
  ctx.fillRect(0, 0, c.width, c.height);
  // mottling: value noise at low resolution, scaled up smoothly
  const lw = Math.ceil(c.width / 6), lh = Math.ceil(c.height / 6);
  const small = document.createElement('canvas');
  small.width = lw; small.height = lh;
  const sctx = small.getContext('2d');
  const img = sctx.createImageData(lw, lh);
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const v = vnoise(x / 22, y / 22, seed) * 0.6 + vnoise(x / 6, y / 6, seed + 1) * 0.4;
      const k = (y * lw + x) * 4;
      const d = (v - 0.5) * 22;
      img.data[k] = 150 + d; img.data[k + 1] = 135 + d; img.data[k + 2] = 110 + d; img.data[k + 3] = 26;
    }
  }
  sctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, c.width, c.height);
  // fibres
  const r = rng(seed * 31);
  ctx.lineWidth = Math.max(0.6, dpr * 0.5);
  for (let i = 0; i < (c.width * c.height) / 9000; i++) {
    const x = r() * c.width, y = r() * c.height, a = r() * TAU, l = (6 + r() * 18) * dpr;
    ctx.strokeStyle = `rgba(${r() < 0.5 ? '120,100,80' : '255,255,250'},${0.05 + r() * 0.06})`;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  return c;
}

/** The tooth of the paper, as a small tile to lay over everything (multiply). */
export function makeGrain(seed = 9) {
  const s = 192;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(s, s);
  const r = rng(seed);
  for (let i = 0; i < s * s; i++) {
    const v = 255 - Math.floor(Math.pow(r(), 3) * 46);
    img.data[i * 4] = v; img.data[i * 4 + 1] = v - 2; img.data[i * 4 + 2] = v - 6; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
export { vnoise };

// ------------------------------------------------------------------ shapes --

/** Recursive midpoint displacement: each pass doubles the points and roughens the edge. */
export function deform(poly, passes, amount, r) {
  let p = poly;
  let amt = amount;
  for (let k = 0; k < passes; k++) {
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const w = a[2] ?? 1;
      out.push(a);
      const g = gauss(r) * amt * len * w, ang = r() * TAU;
      out.push([(a[0] + b[0]) / 2 + Math.cos(ang) * g, (a[1] + b[1]) / 2 + Math.sin(ang) * g, clamp(w + gauss(r) * 0.15, 0.2, 2)]);
    }
    p = out;
    amt *= 0.62;
  }
  return p;
}

/** A rough ellipse as a polygon, with a per-vertex wobble weight. */
export function blob(cx, cy, rx, ry, n = 18, rot = 0, r = Math.random) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 0.9 + r() * 0.18;
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot), 0.6 + r() * 0.8]);
  }
  return out;
}

function fillPoly(ctx, p) {
  ctx.beginPath();
  ctx.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
  ctx.closePath();
  ctx.fill();
}

// ------------------------------------------------------------------- marks --

let nextId = 1;

/** A watercolour wash. `layers` glazes, laid down evenly across [t0, t1]. */
export class Wash {
  constructor({ poly, polyAt, color, alpha = 0.014, layers = 30, t0, t1 = t0 + 1.5, spread = 0.12, op = 'multiply', id }) {
    this.id = id ?? nextId++;
    this.t0 = t0; this.t1 = t1;
    this.color = color; this.alpha = alpha; this.layers = layers; this.spread = spread; this.op = op;
    // Deform only coarsely once; each glaze then deforms the coarse shape afresh,
    // so the glazes disagree at the edge (soft) and agree in the middle (deep).
    // `polyAt(f)`, if given, is the shape of the glaze a fraction f of the way
    // through: a wash that WIDENS as it is laid, so its middle gathers the most
    // pigment and its reach grows with time, with no seams between tiles.
    this.polyAt = polyAt;
    if (!polyAt) this.base = deform(poly, 1, spread, rng(this.id * 7919));
  }
  draw(ctx, from, to) {
    const a = Math.floor(from * this.layers), b = Math.floor(to * this.layers);
    if (b <= a) return;
    ctx.globalCompositeOperation = this.op;
    ctx.fillStyle = rgba(this.color, this.alpha);
    for (let L = a; L < b; L++) {
      const r = rng(this.id * 104729 + L);
      const base = this.polyAt ? deform(this.polyAt((L + 1) / this.layers), 1, this.spread, r) : this.base;
      const p = deform(base, 4, this.spread * 1.15, r);
      fillPoly(ctx, p);
      // the pigment that collects at a drying edge
      if (L % 9 === 4) {
        ctx.strokeStyle = rgba(this.color, this.alpha * 1.2);
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }
  }
}

/**
 * A bristle brush stroke along `pts` ([x, y, pressure]). Colour jitters per
 * hair; paint runs out along the stroke and the paper's tooth shows through.
 */
export class Bristle {
  constructor({ pts, width, color, alpha = 0.7, hairs = 10, t0, t1 = t0 + 0.4, dry = 0.5, jitter = 14, op = 'source-over', id, hairWidth }) {
    this.id = id ?? nextId++;
    this.t0 = t0; this.t1 = t1;
    this.pts = pts; this.width = width; this.alpha = alpha; this.dry = dry; this.op = op;
    const r = rng(this.id * 7717);
    this.hairs = Array.from({ length: hairs }, () => ({
      off: clamp(gauss(r) * 0.42, -1, 1),
      load: 0.55 + r() * 0.45,
      w: (hairWidth ?? (width / hairs) * 1.9) * (0.6 + r() * 0.8),
      col: [color[0] + gauss(r) * jitter, color[1] + gauss(r) * jitter, color[2] + gauss(r) * jitter],
      start: r() * 0.12, end: 1 - r() * 0.18,
    }));
    for (const H of this.hairs) H.css = rgba(H.col, 1);
    // normals along the path
    const n = pts.length;
    this.nrm = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      return [-dy / l, dx / l];
    });
  }
  draw(ctx, from, to) {
    const n = this.pts.length - 1;
    const a = Math.floor(from * n), b = Math.floor(to * n + 1e-9);
    if (b <= a) return;
    ctx.globalCompositeOperation = this.op;
    ctx.lineCap = 'round';
    // Segment-major, as a real brush lays every hair down together as it
    // travels: so a stroke drawn in slices is the same stroke, in the same order.
    for (let k = a; k < b; k++) {
      const f = k / n;
      const p = this.pts[k], q = this.pts[k + 1], np = this.nrm[k], nq = this.nrm[k + 1];
      for (let h = 0; h < this.hairs.length; h++) {
        const H = this.hairs[h];
        if (f < H.start || f > H.end) continue;
        const paint = H.load - this.dry * f * f;
        if (paint <= 0 || hash(this.id, h, k) > paint + 0.15) continue;   // dry brush: the tooth shows
        const op = H.off * this.width * 0.5 * (p[2] ?? 1), oq = H.off * this.width * 0.5 * (q[2] ?? 1);
        ctx.strokeStyle = H.css;
        ctx.lineWidth = H.w;
        ctx.globalAlpha = this.alpha * clamp(paint);
        ctx.beginPath();
        ctx.moveTo(p[0] + np[0] * op, p[1] + np[1] * op);
        ctx.lineTo(q[0] + nq[0] * oq, q[1] + nq[1] * oq);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}

/** A sumi ink line. Width follows pressure; a faint bleed runs alongside. */
export class Ink {
  constructor({ pts, width = 1.4, color = [28, 24, 26], alpha = 0.88, t0, t1 = t0 + 0.6, bleed = 0.1, id }) {
    this.id = id ?? nextId++;
    this.t0 = t0; this.t1 = t1;
    this.pts = pts; this.width = width; this.color = color; this.alpha = alpha; this.bleed = bleed;
  }
  draw(ctx, from, to) {
    const n = this.pts.length - 1;
    const a = Math.floor(from * n), b = Math.floor(to * n + 1e-9);
    if (b <= a) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    for (let k = a; k < b; k++) {
      const p = this.pts[k], q = this.pts[k + 1];
      const pr = (p[2] ?? 1) * (0.75 + 0.5 * hash(this.id, k >> 2));
      if (this.bleed > 0) {
        ctx.strokeStyle = rgba(this.color, this.bleed);
        ctx.lineWidth = this.width * pr * 2.6;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
      ctx.strokeStyle = rgba(this.color, this.alpha);
      ctx.lineWidth = this.width * pr;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
  }
}

/** A gouache blot: a few jittered opaque layers, laid at once. */
export class Dab {
  constructor({ x, y, rx, ry = rx, rot = 0, color, alpha = 0.8, layers = 3, t0, op = 'source-over', id }) {
    this.id = id ?? nextId++;
    this.t0 = t0; this.t1 = t0 + 0.05;
    this.x = x; this.y = y; this.rx = rx; this.ry = ry; this.rot = rot;
    this.color = color; this.alpha = alpha; this.layers = layers; this.op = op;
  }
  draw(ctx, from, to) {
    if (from > 0 || to <= 0) return;
    ctx.globalCompositeOperation = this.op;
    for (let L = 0; L < this.layers; L++) {
      const r = rng(this.id * 131 + L);
      const c = [this.color[0] + gauss(r) * 10, this.color[1] + gauss(r) * 10, this.color[2] + gauss(r) * 10];
      ctx.fillStyle = rgba(c, this.alpha / (L * 0.6 + 1));
      const p = deform(blob(this.x, this.y, this.rx * (1 - L * 0.15), this.ry * (1 - L * 0.15), 7, this.rot, r), 2, 0.18, r);
      fillPoly(ctx, p);
    }
  }
}

// ----------------------------------------------------------------- painter --

/**
 * Keeps a canvas up to date with a list of marks.
 *   advance(t)  draw everything new since the last call
 *   reset()     back to blank paper (for seeking backwards, or a resize)
 */
export class Painter {
  constructor(canvas, paper, dpr, clip) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.paper = paper; this.dpr = dpr; this.clip = clip;
    this.marks = []; this.reset();
  }
  setMarks(marks) { this.marks = marks.slice().sort((a, b) => a.t0 - b.t0); this.reset(); }
  reset() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.drawImage(this.paper, 0, 0);
    this.next = 0; this.active = []; this.done = new Map(); this.t = -Infinity;
  }
  advance(t) {
    if (t < this.t) this.reset();
    this.t = t;
    const c = this.ctx;
    c.save();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.clip) { c.beginPath(); this.clip(c); c.clip(); }
    while (this.next < this.marks.length && this.marks[this.next].t0 <= t) this.active.push(this.marks[this.next++]);
    const still = [];
    for (const m of this.active) {
      const f = m.t1 > m.t0 ? clamp((t - m.t0) / (m.t1 - m.t0)) : 1;
      const was = this.done.get(m) ?? 0;
      if (f > was || (was === 0 && f === 0 && m.t1 <= m.t0)) m.draw(c, was, f);
      if (f < 1) { this.done.set(m, f); still.push(m); } else this.done.delete(m);
    }
    this.active = still;
    c.restore();
  }
}
