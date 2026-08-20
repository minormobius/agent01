// metrics.mjs — what makes two different webs members of the same family.
//
// The claim this surface makes is falsifiable, and this file is where it is
// tested: for one set of boundary conditions, webs from different seeds should
// disagree wildly about *which thread goes where* and agree closely about a
// short list of numbers. If the numbers scattered as much as the geometry, the
// agent would be producing noise, not a family.
//
// Every measurement here is one a field biologist actually takes off a
// photographed orb — radius count, hub displacement, mesh height above and
// below, capture area — because the point of matching those and not, say, the
// coordinates of thread 412 is precisely that the coordinates are free and
// these are not.

import { dist, polygonArea, rayPolygon } from './fabric.mjs';

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
};

export function measure(w) {
  const n = w.radii.length;
  const hub = w.hubPos;

  // Hub displacement, as vertical eccentricity: the field measure. Distance
  // from the hub straight down to the rim, versus straight up. Positive means
  // the hub sits above centre, which is what gravity buys — a head-down spider
  // reaches prey in the lower field faster because falling is free.
  const poly = w.framePoly;
  const up = rayPolygon(hub.x, hub.y - 1, 0, -1, poly);
  const dn = rayPolygon(hub.x, hub.y + 1, 0, 1, poly);
  const rUp = up ? up.t + 1 : 1;
  const rDn = dn ? dn.t + 1 : 1;
  const rimMean = w.rimMean;

  // angular regularity of the radii
  const gaps = [];
  for (let i = 0; i < n; i++) {
    const a = w.radii[i].angle;
    const b = w.radii[(i + 1) % n].angle;
    let d = b - a;
    if (d <= 0) d += Math.PI * 2;
    gaps.push(d);
  }

  // mesh height: successive capture turns along the same radius
  const byRadius = new Map();
  for (const c of w.captureNodes) {
    if (!byRadius.has(c.k)) byRadius.set(c.k, []);
    byRadius.get(c.k).push(c.d);
  }
  const upper = [];
  const lower = [];
  for (const [k, ds] of byRadius) {
    ds.sort((a, b) => a - b);
    const up = -Math.sin(w.radii[k].angle) > 0;
    for (let i = 1; i < ds.length; i++) {
      const gap = ds[i] - ds[i - 1];
      if (gap < 1 || gap > rimMean * 0.5) continue;   // a bridged obstacle, not a turn
      (up ? upper : lower).push(gap);
    }
  }

  // capture area: the annulus the sticky spiral actually covers
  const outer = [];
  const inner = [];
  for (const [k, ds] of byRadius) {
    const a = w.radii[k].angle;
    outer.push({ a, r: ds[ds.length - 1] });
    inner.push({ a, r: ds[0] });
  }
  outer.sort((p, q) => p.a - q.a);
  inner.sort((p, q) => p.a - q.a);
  const toPoly = (ring) => ring.map((p) => ({ x: hub.x + Math.cos(p.a) * p.r, y: hub.y + Math.sin(p.a) * p.r }));
  const captureArea = outer.length > 2 ? polygonArea(toPoly(outer)) - polygonArea(toPoly(inner)) : 0;

  // upper/lower split of that area, about the horizontal through the hub
  let areaUp = 0;
  let areaLo = 0;
  for (const p of outer) {
    const i = inner.find((q) => q.a === p.a);
    const band = (p.r * p.r - (i ? i.r * i.r : 0)) / 2;
    if (-Math.sin(p.a) > 0) areaUp += band; else areaLo += band;
  }

  let captureLength = 0;
  let frameLength = 0;
  let radialLength = 0;
  for (const t of w.f.threads) {
    if (t.dead) continue;
    const L = dist(t.a, t.b);
    if (t.kind === 'capture') captureLength += L;
    else if (t.kind === 'radius' || t.kind === 'hub') radialLength += L;
    else if (t.kind === 'frame' || t.kind === 'bridge' || t.kind === 'anchor') frameLength += L;
  }

  return {
    seed: w.seed,
    radii: n,
    abandoned: w.abandoned,
    unreached: w.skipped.length,
    hubRise: (rDn + rUp) > 0 ? (rDn - rUp) / (rDn + rUp) : 0,
    rimMean,
    turns: n ? w.captureNodes.length / n : 0,
    meshUpper: mean(upper),
    meshLower: mean(lower),
    meshRatio: mean(lower) > 0 ? mean(upper) / mean(lower) : 0,
    spacingCV: mean(gaps) > 0 ? sd(gaps) / mean(gaps) : 0,
    captureArea,
    areaRatio: areaUp > 0 ? areaLo / areaUp : 0,
    captureLength,
    radialLength,
    frameLength,
    silkUsed: w.f.silkUsed,
    reclaimed: w.f.silkReclaimed,
    complete: !w.ranOut,
  };
}

// Aggregate a family: mean ± sd, and the coefficient of variation that is the
// actual evidence. A tight CV on radius count beside a loose one on, say, where
// any individual thread lies is the whole argument.
export function family(ms) {
  const keys = ['radii', 'hubRise', 'turns', 'meshUpper', 'meshLower', 'meshRatio',
    'spacingCV', 'captureArea', 'areaRatio', 'captureLength', 'silkUsed'];
  const out = {};
  for (const k of keys) {
    const xs = ms.map((m) => m[k]).filter((x) => Number.isFinite(x));
    const m = mean(xs);
    const s = sd(xs);
    out[k] = { mean: m, sd: s, cv: m !== 0 ? Math.abs(s / m) : 0, min: Math.min(...xs), max: Math.max(...xs) };
  }
  out.n = ms.length;
  out.complete = ms.filter((m) => m.complete).length;
  return out;
}

// ─── how far apart are two webs, physically? ────────────────────────────────
//
// Metric agreement is not geometric agreement, and the difference is the point.
// This samples both capture spirals and reports the mean nearest-neighbour
// distance between the two point sets, in leg spans — a number that stays large
// even when every metric above matches.
export function divergence(a, b, cell = 24) {
  const pts = (w) => {
    const out = [];
    for (const t of w.f.threads) {
      if (t.dead || t.kind !== 'capture') continue;
      out.push({ x: (t.a.x + t.b.x) / 2, y: (t.a.y + t.b.y) / 2 });
    }
    return out;
  };
  const A = pts(a);
  const B = pts(b);
  if (!A.length || !B.length) return { mean: 0, max: 0, n: 0 };

  const grid = new Map();
  const key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  for (const p of B) {
    const k = key(p.x, p.y);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  const near = (p) => {
    const gx = Math.floor(p.x / cell);
    const gy = Math.floor(p.y / cell);
    let best = Infinity;
    for (let ring = 0; ring <= 8; ring++) {
      for (let i = -ring; i <= ring; i++) {
        for (let j = -ring; j <= ring; j++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
          const bucket = grid.get(`${gx + i},${gy + j}`);
          if (!bucket) continue;
          for (const q of bucket) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
        }
      }
      // anything nearer than the ring we just cleared would already be found
      if (best <= cell * ring) break;
    }
    return Number.isFinite(best) ? best : cell * 8;
  };

  const ds = A.map(near);
  return {
    mean: mean(ds),
    max: Math.max(...ds),
    n: A.length,
  };
}
