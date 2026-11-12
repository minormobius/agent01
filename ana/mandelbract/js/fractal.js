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

// ------------------------------------------------------------ Tan Lei --
// Zoom into the Mandelbrot set at a Misiurewicz point c (its critical orbit lands on a repelling cycle) and it looks
// more and more like the Julia set of c zoomed at the same point, up to a scale and a turn (Tan Lei, 1990). In the
// (c, z₀) set that is one 4D fact. Near a point P, zₙ ≈ zₙ(P) + A·δc + B·δz₀ with A = ∂zₙ/∂c, B = ∂zₙ/∂z₀, so the set
// near P is a pattern in u = A·δc + B·δz₀, the same along the whole complex line A·δc + B·δz₀ = 0. Every plane
// through P that varies c and z₀ together, δc = cos θ·t, δz₀ = sin θ·t, sees that pattern scaled and turned by
// K(θ) = A cos θ + B sin θ. θ = 45° is the plane z₀ = c, where the set is the Mandelbrot set again (starting at c is
// starting at 0, one step later); θ = 90° is the Julia plane. Undo K(θ) and the picture holds still as you twist.

/** Misiurewicz points: c's critical orbit is periodic after k steps, with period p (found by Newton's method on
 *  f^(k+p)(0) = f^k(0); the selftest checks each). */
export const MISIUREWICZ = [
  { name: 'c = i', c: [0, 1], k: 2, p: 2 },
  { name: 'M₄,₁', c: [-0.101096363846, 0.956286510809], k: 4, p: 1 },
  { name: 'M₃,₃', c: [-0.607031022616, 0.605251381279], k: 3, p: 3 },
  { name: 'M₃,₁', c: [-1.543689012692, 0], k: 3, p: 1 },
];

/** A = ∂zₙ/∂c and B = ∂zₙ/∂z₀ at (c, z₀), divided by |B|, with n large enough that their ratio has settled: stop once
 *  |B| passes 10¹² (or the orbit escapes). Only the ratio and the joint size matter. */
export function tangent(c, z0, maxN = 200) {
  let zr = z0[0], zi = z0[1], Ar = 0, Ai = 0, Br = 1, Bi = 0;
  for (let n = 0; n < maxN; n++) {
    const nAr = 2 * (zr * Ar - zi * Ai) + 1, nAi = 2 * (zr * Ai + zi * Ar);
    const nBr = 2 * (zr * Br - zi * Bi), nBi = 2 * (zr * Bi + zi * Br);
    Ar = nAr; Ai = nAi; Br = nBr; Bi = nBi;
    const t = zr * zr - zi * zi + c[0]; zi = 2 * zr * zi + c[1]; zr = t;
    if (zr * zr + zi * zi > 16 || Math.hypot(Br, Bi) > 1e12) break;
  }
  const m = Math.hypot(Br, Bi) || 1;
  return { A: [Ar / m, Ai / m], B: [Br / m, Bi / m] };
}

/** K(θ) = A cos θ + B sin θ: how the plane at angle θ scales and turns the local pattern. */
export const patternK = (A, B, th) => [A[0] * Math.cos(th) + B[0] * Math.sin(th), A[1] * Math.cos(th) + B[1] * Math.sin(th)];

/** The frame for the plane at angle θ, turned by φ within itself: your x is (δc, δz₀) = (cos θ, sin θ)·e^{iφ}, your y
 *  is i times that, and your z and w the perpendicular pair (−sin θ, cos θ)·e^{iφ} and i times it. Row-major, rows =
 *  your x, y, z, w in (Re c, Im c, Re z₀, Im z₀). */
export function twistFrame(th, phi) {
  const c = Math.cos(th), s = Math.sin(th), cp = Math.cos(phi), sp = Math.sin(phi);
  return new Float32Array([
    c * cp, c * sp, s * cp, s * sp,
    -c * sp, c * cp, -s * sp, s * cp,
    -s * cp, -s * sp, c * cp, c * sp,
    s * sp, -s * cp, -c * sp, c * cp,
  ]);
}

/** Holding the pattern still: the turn φ and the zoom factor that undo K(θ) relative to the plane at θref. */
export function hold(A, B, th, thRef = Math.PI / 4) {
  const K = patternK(A, B, th), K0 = patternK(A, B, thRef);
  return { phi: Math.atan2(K0[1], K0[0]) - Math.atan2(K[1], K[0]), zoom: Math.hypot(...K) / Math.hypot(...K0) };
}
