// MANDELBRACT's maths: four ways to take the Mandelbrot set into four dimensions, each as an escape test and a distance
// estimate on R⁴. No DOM. The page's fragment shader (js/main.js) is the twin of these, formula for formula; the
// selftest holds these to the page's claims.
//
// There is no 4D number system that does for four dimensions what the complex numbers do for two (Frobenius: the real
// associative division algebras are R, C and the quaternions, and the quaternions aren't commutative). So "the 4D
// Mandelbrot set" splits four ways, each giving something up:
//
//   cz          the complex Mandelbrot set's own home. z → z² + c with BOTH c and the start z₀ free: (Re c, Im c,
//               Re z₀, Im z₀). The plane z₀ = 0 is the Mandelbrot set; the plane c = const is that c's filled Julia
//               set. Nothing is invented; it is the one object every Mandelbrot and Julia picture is a slice of.
//   bicomplex   z = z₁ + z₂j with i² = j² = −1, ij = ji: commutative, but with zero divisors. Its idempotent basis
//               splits every product into two independent complex ones, so the set is M × M, a Cartesian product.
//   quaternion  a division algebra, but z² = (a² − |b|², 2ab) sees only the LENGTH of the imaginary part b, so the set
//               is the Mandelbrot set spun round its real axis: smooth, no new detail.
//   bulb        no algebra at all: raise the length to the n and multiply every hyperspherical angle by n, the
//               Mandelbulb's trick lifted a dimension. Detail everywhere, and no theorem behind it.

export const SETS = ['cz', 'bicomplex', 'quaternion', 'bulb'];
export const BAIL = 256;            // escape radius: large, so the distance estimate settles

// ------------------------------------------------------------------ cz --
/** z → z² + c from z₀, p = (Re c, Im c, Re z₀, Im z₀). Returns { escaped, n, r, de, trap }:
 *  de = ½|z| ln|z| / |∇z| with ∇z = (∂z/∂c, ∂z/∂z₀), z being holomorphic in both (0 if it never escapes);
 *  trap = the orbit's closest approach to 0, after the start. */
export function iterCZ(p, maxIter) {
  const cr = p[0], ci = p[1];
  let zr = p[2], zi = p[3];
  let dcr = 0, dci = 0;              // ∂z/∂c
  let d0r = 1, d0i = 0;              // ∂z/∂z₀
  let trap = Infinity;               // over the iterates, not the start (which is 0 for the plain Mandelbrot set)
  for (let n = 0; n < maxIter; n++) {
    // derivatives from the old z: ∂c' = 2z∂c + 1, ∂z₀' = 2z∂z₀
    const ndcr = 2 * (zr * dcr - zi * dci) + 1, ndci = 2 * (zr * dci + zi * dcr);
    const nd0r = 2 * (zr * d0r - zi * d0i), nd0i = 2 * (zr * d0i + zi * d0r);
    dcr = ndcr; dci = ndci; d0r = nd0r; d0i = nd0i;
    const nzr = zr * zr - zi * zi + cr;
    zi = 2 * zr * zi + ci; zr = nzr;
    const r2 = zr * zr + zi * zi;
    trap = Math.min(trap, Math.sqrt(r2));
    if (r2 > BAIL * BAIL) {
      const r = Math.sqrt(r2), g = Math.sqrt(dcr * dcr + dci * dci + d0r * d0r + d0i * d0i);
      return { escaped: true, n, r, de: (0.5 * r * Math.log(r)) / g, trap };
    }
  }
  return { escaped: false, n: maxIter, r: Math.hypot(zr, zi), de: 0, trap };
}

// The plain 2D Mandelbrot set, z₀ = 0 (for the bicomplex set's two factors).
export function iterM(cr, ci, maxIter) { return iterCZ([cr, ci, 0, 0], maxIter); }

// ----------------------------------------------------------- bicomplex --
/** p = (x, y, u, v) is the bicomplex number (x + iy) + (u + iv)j. In the idempotent basis e₁ = (1 + ij)/2,
 *  e₂ = (1 − ij)/2 it is w₁e₁ + w₂e₂ with w₁ = (x + v) + i(y − u), w₂ = (x − v) + i(y + u), and multiplication acts
 *  on w₁ and w₂ separately. */
export function idempotent(p) {
  return [[p[0] + p[3], p[1] - p[2]], [p[0] - p[3], p[1] + p[2]]];
}
/** The set is {w₁ ∈ M and w₂ ∈ M}. The map p → (w₁, w₂) is √2 times a rotation, so the distance to the product is
 *  √(d₁² + d₂²)/√2, each dᵢ the factor's distance estimate (0 inside it). */
export function iterBicomplex(p, maxIter) {
  const [w1, w2] = idempotent(p);
  const a = iterM(w1[0], w1[1], maxIter), b = iterM(w2[0], w2[1], maxIter);
  return {
    escaped: a.escaped || b.escaped, n: Math.min(a.n, b.n),
    de: Math.hypot(a.de, b.de) / Math.SQRT2, trap: Math.min(a.trap, b.trap),
  };
}
/** Bicomplex multiplication itself, for the selftest: (z₁ + z₂j)(w₁ + w₂j) = (z₁w₁ − z₂w₂) + (z₁w₂ + z₂w₁)j. */
export function bcMul(a, b) {
  const cm = (ar, ai, br, bi) => [ar * br - ai * bi, ar * bi + ai * br];
  const z1w1 = cm(a[0], a[1], b[0], b[1]), z2w2 = cm(a[2], a[3], b[2], b[3]);
  const z1w2 = cm(a[0], a[1], b[2], b[3]), z2w1 = cm(a[2], a[3], b[0], b[1]);
  return [z1w1[0] - z2w2[0], z1w1[1] - z2w2[1], z1w2[0] + z2w1[0], z1w2[1] + z2w1[1]];
}

// ---------------------------------------------------------- quaternion --
/** z → z² + c over the quaternions from z = 0, p = c = (a, b₁, b₂, b₃). The derivative's size is carried as a
 *  scalar, |z′| → 2|z||z′| + 1 (exact for the product, |zw| = |z||w|). */
export function iterQuaternion(p, maxIter) {
  let a = 0, b1 = 0, b2 = 0, b3 = 0, dr = 0, trap = Infinity;
  for (let n = 0; n < maxIter; n++) {
    const r = Math.sqrt(a * a + b1 * b1 + b2 * b2 + b3 * b3);
    dr = 2 * r * dr + 1;
    const na = a * a - b1 * b1 - b2 * b2 - b3 * b3 + p[0];
    b1 = 2 * a * b1 + p[1]; b2 = 2 * a * b2 + p[2]; b3 = 2 * a * b3 + p[3]; a = na;
    const r2 = a * a + b1 * b1 + b2 * b2 + b3 * b3;
    trap = Math.min(trap, Math.sqrt(r2));
    if (r2 > BAIL * BAIL) {
      const rr = Math.sqrt(r2);
      return { escaped: true, n, de: (0.5 * rr * Math.log(rr)) / dr, trap };
    }
  }
  return { escaped: false, n: maxIter, de: 0, trap };
}

// ----------------------------------------------------------- hyperbulb --
// Hyperspherical coordinates: x = r cos α, y = r sin α cos β, z = r sin α sin β cos γ, w = r sin α sin β sin γ.
export function toHyper(p) {
  const r = Math.hypot(p[0], p[1], p[2], p[3]);
  if (r === 0) return [0, 0, 0, 0];
  return [r, Math.acos(Math.max(-1, Math.min(1, p[0] / r))), Math.atan2(Math.hypot(p[2], p[3]), p[1]), Math.atan2(p[3], p[2])];
}
export function fromHyper(r, a, b, g) {
  const sa = Math.sin(a), sb = Math.sin(b);
  return [r * Math.cos(a), r * sa * Math.cos(b), r * sa * sb * Math.cos(g), r * sa * sb * Math.sin(g)];
}
/** z → z^n + c from z = c, the power taken as r^n with every angle times n. The running derivative
 *  dr → n r^(n−1) dr + 1 gives the usual Mandelbulb estimate ½ r ln r / dr. A smaller bailout: r^n grows fast. */
export function iterBulb(p, maxIter, power = 8) {
  let z = p.slice(), dr = 1, trap = Infinity;
  for (let n = 0; n < maxIter; n++) {
    const [r, a, b, g] = toHyper(z);
    trap = Math.min(trap, r);
    if (r > 2) return { escaped: true, n, de: (0.5 * Math.log(r) * r) / dr, trap };
    dr = power * r ** (power - 1) * dr + 1;
    const q = fromHyper(r ** power, a * power, b * power, g * power);
    z = q.map((v, j) => v + p[j]);
  }
  return { escaped: false, n: maxIter, de: 0, trap };
}

/** The set the page shows, by name. */
export function iterate(set, p, maxIter, power = 8) {
  if (set === 'cz') return iterCZ(p, maxIter);
  if (set === 'bicomplex') return iterBicomplex(p, maxIter);
  if (set === 'quaternion') return iterQuaternion(p, maxIter);
  return iterBulb(p, maxIter, power);
}

/** Where each set sits and how big it is: the page centres the view on `ctr`, one unit of your view is `size` of the
 *  set's, and `zoom` frames the whole solid. And what your
 *  four view axes are, squared up (rows: view x, y, z, w in the set's coordinates). */
export const FRAMES = {
  cz:         { ctr: [-0.5, 0, 0, 0], size: 1.5, zoom: 0.72, axes: ['Re c', 'Im c', 'Re z₀', 'Im z₀'] },
  bicomplex:  { ctr: [-0.5, 0, 0, 0], size: 1.6, zoom: 0.9, axes: ['x', 'y', 'u', 'v'] },
  quaternion: { ctr: [-0.5, 0, 0, 0], size: 1.5, zoom: 0.9, axes: ['1', 'i', 'j', 'k'] },
  bulb:       { ctr: [0, 0, 0, 0], size: 1.25, zoom: 1, axes: ['x', 'y', 'z', 'w'] },
};

// ---------------------------------------------------------------- march --
/** Sphere-trace a ray through the set in its own coordinates (rd a unit 4-vector): step by k times the distance
 *  estimate, stop within eps or on a point whose orbit never escapes. The page's shader marches the same way in your
 *  view's units; the page uses this to find the point you double-tap. Returns { t, p, steps } or null. */
export function march(set, ro, rd, { maxIter = 32, power = 8, tMax = 10, eps = 1e-3, k = 0.6, maxSteps = 300 } = {}) {
  let t = 0;
  for (let s = 0; s < maxSteps && t < tMax; s++) {
    const p = ro.map((v, j) => v + t * rd[j]);
    const it = iterate(set, p, maxIter, power);
    if (!it.escaped || it.de < eps) return { t, p, steps: s };
    t += k * it.de;
  }
  return null;
}
