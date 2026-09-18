// interfere.js — does anything touch? Every pair of components whose world
// boxes overlap is intersected with Manifold at the current pose; a shared
// volume above `eps` is an interference. The same function runs in the
// worker (the page's "check" button) and under node (agent/check.mjs).
//
// bodies: [{id, manifold, model, bbox}] — manifold is an un-posed Manifold,
// bbox its un-posed box [[min],[max]].
import { xform } from './assembly.js';

function worldBox(bbox, m) {
  const out = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (let i = 0; i < 8; i++) {
    const p = xform(m, [bbox[i & 1][0], bbox[(i >> 1) & 1][1], bbox[(i >> 2) & 1][2]]);
    for (let k = 0; k < 3; k++) { out[0][k] = Math.min(out[0][k], p[k]); out[1][k] = Math.max(out[1][k], p[k]); }
  }
  return out;
}
const overlaps = (a, b) => a[0][0] <= b[1][0] && b[0][0] <= a[1][0] && a[0][1] <= b[1][1] && b[0][1] <= a[1][1] && a[0][2] <= b[1][2] && b[0][2] <= a[1][2];

export function interference({ Manifold }, bodies, { eps = 0.01, skip = () => false } = {}) {
  const t0 = performance.now();
  const posed = bodies.map((b) => ({ ...b, world: worldBox(b.bbox, b.model), placed: null }));
  const pairs = [];
  let tested = 0;
  try {
    for (let i = 0; i < posed.length; i++) for (let j = i + 1; j < posed.length; j++) {
      const a = posed[i], b = posed[j];
      if (!overlaps(a.world, b.world) || skip(a.id, b.id)) continue;
      a.placed ??= a.manifold.transform(a.model);
      b.placed ??= b.manifold.transform(b.model);
      tested++;
      const x = Manifold.intersection(a.placed, b.placed);
      const v = x.volume();
      if (v > eps) { const bb = x.boundingBox(); pairs.push({ a: a.id, b: b.id, volume: v, bbox: [bb.min, bb.max] }); }
      x.delete();
    }
  } finally { for (const p of posed) if (p.placed) p.placed.delete(); }
  return { pairs: pairs.sort((p, q) => q.volume - p.volume), tested, ms: performance.now() - t0 };
}
