// COIN: the one-sided coin. No DOM.
//
// After Alpha's note (gist.github.com/jefferyharrell/6c2117e500d36fc3f66174b8f60a9c70): a coin is a squashed sphere
// (heads the north, tails the south, the rim the equator). Glue every point to the one straight through the centre,
// p ~ −p, and you have the real projective plane RP²: closed, no edge, one side. Heads is tails, half-turned.
//
// It can't sit in our space without passing through itself, but it fits in 4D:
//   f(x, y, z) = (x² − y², xy, xz, yz)
// is even (f(−p) = f(p): the gluing done for you) and takes no other two points to one (`unglue` recovers ±p), so the
// image of the sphere is RP², embedded. The page slides the coin into it: (1 − t)·coin(p) + t·f(p), so at t = 1 each
// point lands on the point opposite it.

export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const add4 = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2], a[3] + k * b[3]];
export const norm = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0));

/** The embedding, scaled so the coin and its glued image are about the same size. */
export const SCALE = 1.6;
export const f = ([x, y, z]) => [SCALE * (x * x - y * y), SCALE * x * y * 2, SCALE * x * z * 2, SCALE * y * z * 2];
/** Its derivative at p applied to a tangent vector v (how a direction on the sphere is carried into 4D). */
export const df = ([x, y, z], [a, b, c]) => [SCALE * 2 * (x * a - y * b), SCALE * 2 * (x * b + y * a), SCALE * 2 * (x * c + z * a), SCALE * 2 * (y * c + z * b)];
/** Back from the image to the sphere: the pair ±p (one of them), for p on the unit sphere. Exists for every image
 *  point, so no two non-opposite points share one: the embedding is one-to-one on RP². */
export function unglue(q) {
  const A = q[0] / SCALE, B = q[1] / (2 * SCALE), C = q[2] / (2 * SCALE), D = q[3] / (2 * SCALE);   // x²−y², xy, xz, yz
  const r2 = Math.hypot(A, 2 * B), sq = [(r2 + A) / 2, (r2 - A) / 2, Math.max(0, 1 - r2)];    // x², y², z²
  // divide by the largest of x, y, z (one of them is at least 1/√3), so nothing is lost to cancellation near the rim
  const k = sq.indexOf(Math.max(...sq)), m = Math.sqrt(sq[k]);
  return k === 0 ? [m, B / m, C / m] : k === 1 ? [B / m, m, D / m] : [C / m, D / m, m];
}
/** The coin: the sphere squashed flat (heads up), in 4D with w = 0. */
export const THICK = 0.12;
export const coin = ([x, y, z]) => [x, y, z * THICK, 0];
/** Partly glued: t = 0 the coin, t = 1 the projective plane. */
export const glued = (p, t) => add4(coin(p), add4(f(p), coin(p), -1), t);

/** The coin's face. Heads shows a picture u(x, y) seen from above; tails, the same disc seen from below at (x, y),
 *  must show u(−x, −y): the same picture, half-turned. This is the colour at a point of the sphere. */
export const faceAt = (p, u) => (p[2] >= 0 ? u(p[0], p[1]) : u(-p[0], -p[1]));

/** The sphere as two hemispheres (separate meshes, so heads' and tails' pictures don't smear into each other across
 *  the rim). Each: points, triangles (index triples), and which side it is. */
export function hemispheres(rings = 40, segs = 120) {
  return [1, -1].map((side) => {
    const P = [], T = [];
    for (let i = 0; i <= rings; i++) {
      const th = (Math.PI / 2) * (i / rings);
      for (let j = 0; j < segs; j++) { const ph = (2 * Math.PI * j) / segs; P.push([Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), side * Math.cos(th)]); }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      const a = i * segs + j, b = i * segs + ((j + 1) % segs), c = a + segs, d = b + segs;
      T.push([a, c, b], [b, c, d]);
    }
    return { side, P, T };
  });
}

/** The walk: north pole to south pole along a meridian, carrying a little frame (forward along the path, and "left").
 *  On the sphere that's half a great circle; on the coin glued, the poles are one point, so it's a closed loop. The
 *  frame is parallel along the meridian: forward the meridian's tangent, left the fixed y direction. */
export function walk(t, phi = 0) {
  const th = Math.PI * t, c = Math.cos(phi), s = Math.sin(phi);
  const p = [Math.sin(th) * c, Math.sin(th) * s, Math.cos(th)];
  const fwd = [Math.cos(th) * c, Math.cos(th) * s, -Math.sin(th)], left = [-s, c, 0];
  return { p, fwd, left };
}

/** The coin's flips: every outcome is heads, because there's only one side. Probability 1, entropy 0 bits. */
export const flip = () => 'heads';
export const entropy = (counts) => { const n = Object.values(counts).reduce((a, b) => a + b, 0); return n ? -Object.values(counts).reduce((s, k) => (k ? s + (k / n) * Math.log2(k / n) : s), 0) : 0; };
