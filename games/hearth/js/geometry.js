/* Hearth — the town as triangles, for the renderer. Pure: typed arrays in,
   typed arrays out, so the selftest can check it in node.

   Every vertex is 11 floats: position (metres from the core), normal,
   (u, v) and (kind, seed, mode).
     buildings (mode 1): walls carry u = metres along the building's
       perimeter and v = metres above the ground, so the shader can draw
       floors and windows at their true size and filter them when they're
       too small to see; roofs carry v = −1.
     ground (mode 0): every lot is a fan of triangles over its Voronoi cell,
       and each triangle's centre vertex carries u = its distance to that
       triangle's edge (the corners carry 0), so the interpolated u is the
       exact distance to the street: the shader draws the street, the kerb
       and the lot without any extra geometry.

   A building rises straight out from the core: its walls are the
   footprint's corners pushed out radially, so every wall leans away from its
   neighbour's and a tower's crown is wider than its foot by (R + h)/R. */
import { R, O_, tiers } from "./orb.js";
import { hash } from "./sim.js";

export const STRIDE = 11;

/* The ground: static, built once per orb. */
export function groundMesh(orb, kindOf) {
  const { n, P, V, polys } = orb;
  let tris = 0; for (let i = 0; i < n; i++) tris += polys[i].length;
  const out = new Float32Array(tris * 3 * STRIDE); let o = 0;
  const put = (p, r, u, kind, seed) => { out[o++] = p[0] * r; out[o++] = p[1] * r; out[o++] = p[2] * r; out[o++] = p[0]; out[o++] = p[1]; out[o++] = p[2]; out[o++] = u; out[o++] = 0; out[o++] = kind; out[o++] = seed; out[o++] = 0; };
  for (let i = 0; i < n; i++) {
    const c = [P[3 * i], P[3 * i + 1], P[3 * i + 2]], ring = polys[i], k = kindOf(i), sd = hash(i);
    for (let m = 0; m < ring.length; m++) {
      const a = vec(V, ring[m]), b = vec(V, ring[(m + 1) % ring.length]);
      const e = segDist(c, a, b) * R;
      put(c, R, e, k, sd); put(a, R, 0, k, sd); put(b, R, 0, k, sd);
    }
  }
  return out;
}

/* The buildings: rebuilt when floors change. floors[i] = 0 is open ground.

   A lot is not one building. Its plate is cut into PARCELS, each its own
   building with its own height and facade:
     low (up to 3 floors)   a row of separate houses round the lot's edge;
     mid (up to 10)         a perimeter block: three or four buildings of
                            different heights round a courtyard, alleys between;
     tall (more)            a podium ring of shops and offices, and from the
                            courtyard a tower, with a narrower crown on the
                            tallest.
   (One prism per lot, the first try, read as a field of hexagonal crystals.)
   A parcel is a strip along the lot's edge: an outer chain, the same chain
   pulled toward the centre, and the alleys cut at its ends. Polygons are
   wound counter-clockwise seen from outside, so a wall's outward normal is
   always (edge × up), courtyard walls included. */
export function buildingMesh(orb, floors, kind) {
  const { n, P, V, polys, inr } = orb, B = new Builder();
  for (let i = 0; i < n; i++) {
    const f = floors[i]; if (f <= 0) continue;
    const c = [P[3 * i], P[3 * i + 1], P[3 * i + 2]], k = kind[i], sd = hash(i);
    const inset = Math.max(0.05, 1 - O_.STREET / Math.max(1, inr[i]));
    const ring = polys[i].map((v) => norm(lerp(c, vec(V, v), inset)));
    ccw(ring, c);
    // the edge of the plate as a chain: corners and the midpoints between them
    const chain = []; for (let m = 0; m < ring.length; m++) { const a = ring[m], b = ring[(m + 1) % ring.length]; chain.push(a, norm(lerp(a, b, 0.5))); }
    const r = inr[i] * inset;   // metres from the lot's centre to its plate's edge, about
    if (f <= 3) {
      // houses: one per edge, apart
      for (let m = 0; m < ring.length; m++) {
        const arc = [chain[2 * m + 1], chain[(2 * m + 2) % chain.length], chain[(2 * m + 3) % chain.length]];
        strip(B, c, trim(arc, 5 / R), 14 / Math.max(14, r), 0, Math.max(1, Math.round(f * (0.6 + 0.5 * hash(i * 31 + m)))), k, hash(i * 7 + m));
      }
    } else {
      // a perimeter block (or a tall lot's podium): three or four buildings round a courtyard
      const K = ring.length >= 6 ? 4 : 3, per = chain.length / K, tall = f > 10;
      const ringF = tall ? Math.min(f, 3 + Math.round(3 * hash(i * 13 + 1))) : f;
      for (let q = 0; q < K; q++) {
        const from = Math.round(q * per), to = Math.round((q + 1) * per), arc = [];
        for (let j = from; j <= to; j++) arc.push(chain[j % chain.length]);
        const h = tall ? ringF : Math.max(2, Math.round(ringF * (0.62 + 0.38 * hash(i * 17 + q))));
        strip(B, c, trim(arc, 4 / R), Math.min(0.45, 24 / Math.max(24, r)), 0, h, k, hash(i * 7 + q));
      }
      if (tall) {
        // the tower from the courtyard: a shaft, and on the tallest a narrower crown
        const t = f > 30 ? Math.round(f * 0.8) : f;
        prism(B, c, ring.map((p) => norm(lerp(c, p, 0.5))), 0, t, k, hash(i * 7 + 9));
        if (t < f) prism(B, c, ring.map((p) => norm(lerp(c, p, 0.36))), t, f, k, hash(i * 7 + 9));
        // the plant room on the roof
        prism(B, c, ring.map((p) => norm(lerp(c, p, 0.14))), f, f + 1, 2, hash(i * 7 + 11));
      }
    }
  }
  return B.done();
}

/* A strip along an outer chain: depth is the fraction of the way to the centre. */
function strip(B, c, outer, depth, z0, z1, k, sd) {
  const inner = outer.map((p) => norm(lerp(p, c, depth)));
  const poly = outer.concat(inner.slice().reverse());
  walls(B, poly, z0, z1, k, sd);
  const r1 = R + z1 * O_.FLOOR;
  for (let j = 0; j + 1 < outer.length; j++) {   // the roof, quad by quad
    for (const p of [outer[j], outer[j + 1], inner[j + 1]]) B.put(p, r1, p, 0, -1, k, sd);
    for (const p of [outer[j], inner[j + 1], inner[j]]) B.put(p, r1, p, 0, -1, k, sd);
  }
}
/* A convex prism (a tower's shaft or crown). */
function prism(B, c, poly, z0, z1, k, sd) {
  walls(B, poly, z0, z1, k, sd);
  const r1 = R + z1 * O_.FLOOR;
  for (let m = 1; m + 1 < poly.length; m++) for (const p of [poly[0], poly[m], poly[m + 1]]) B.put(p, r1, p, 0, -1, k, sd);
}
/* Walls round a polygon wound counter-clockwise from outside: each edge's outward normal is (edge × up). */
function walls(B, poly, z0, z1, k, sd) {
  const r0 = R + z0 * O_.FLOOR, r1 = R + z1 * O_.FLOOR, v0 = z0 * O_.FLOOR, v1 = z1 * O_.FLOOR, L = poly.length;
  let u = 0;
  for (let m = 0; m < L; m++) {
    const a = poly[m], b = poly[(m + 1) % L], w = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * R; if (w < 0.05) continue;
    const N = norm(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], norm(lerp(a, b, 0.5))));
    B.put(a, r0, N, u, v0, k, sd); B.put(b, r0, N, u + w, v0, k, sd); B.put(b, r1, N, u + w, v1, k, sd);
    B.put(a, r0, N, u, v0, k, sd); B.put(b, r1, N, u + w, v1, k, sd); B.put(a, r1, N, u, v1, k, sd);
    u += w;
  }
}
/* Pull a chain's two ends in by `g` (radians on the unit sphere): the alleys between parcels. */
function trim(arc, g) {
  const out = arc.slice(), cut = (p, q) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); return d > 2.5 * g ? norm(lerp(p, q, g / d)) : p; };
  out[0] = cut(arc[0], arc[1]); out[out.length - 1] = cut(arc[arc.length - 1], arc[arc.length - 2]);
  return out;
}
/* Wind a ring counter-clockwise seen from outside (from above its centre c). */
function ccw(ring, c) {
  let s = 0; for (let m = 0; m < ring.length; m++) { const x = cross(ring[m], ring[(m + 1) % ring.length]); s += x[0] * c[0] + x[1] * c[1] + x[2] * c[2]; }
  if (s < 0) ring.reverse();
}
class Builder {
  constructor() { this.a = new Float32Array(1 << 20); this.o = 0; }
  put(p, r, N, u, v, k, sd) {
    if (this.o + STRIDE > this.a.length) { const b = new Float32Array(this.a.length * 2); b.set(this.a); this.a = b; }
    const a = this.a; let o = this.o;
    a[o++] = p[0] * r; a[o++] = p[1] * r; a[o++] = p[2] * r; a[o++] = N[0]; a[o++] = N[1]; a[o++] = N[2]; a[o++] = u; a[o++] = v; a[o++] = k; a[o++] = sd; a[o++] = 1;
    this.o = o;
  }
  done() { return this.a.slice(0, this.o); }
}

function vec(V, k) { return [V[3 * k], V[3 * k + 1], V[3 * k + 2]]; }
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function segDist(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1)));
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
}
