// Deterministic sin/cos.
//
// ECMAScript does NOT specify the results of Math.sin / Math.cos — they are
// implementation-approximated, so two browsers may disagree in the last few
// bits. Everywhere else that would be a rounding footnote; here it is fatal.
// The Fluoddity rule is a sum of ten sinusoids driven by a sensor reading the
// agents' own deposits, i.e. a chaotic feedback loop: a 1-ulp difference in one
// sine at step 3 is a visibly different painting by step 1400. Since /?s=<seed>
// is the whole contract of this surface — the same seed must be the same
// picture, on every machine, for ever — we cannot call the platform's sine.
//
// So: Cody–Waite range reduction (two-part pi/2) plus the fdlibm minimax kernel
// polynomials. Every operation is IEEE-754 +, -, * on doubles, all of which ARE
// exactly specified, so the result is bit-identical on every conforming engine.
// Accuracy is ~1e-16 relative, far tighter than we need; determinism is the
// point, and the accuracy is a free side effect.

const PIO2_HI = 1.57079632673412561417e+00;
const PIO2_LO = 6.07710050650619224932e-11;
const TWO_OVER_PI = 6.36619772367581382433e-01;

// fdlibm __kernel_sin / __kernel_cos coefficients (valid on |r| <= pi/4).
const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03,
      S3 = -1.98412698298579493134e-04, S4 = 2.75573137070700676789e-06,
      S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03,
      C3 = 2.48015872894767294178e-05, C4 = -2.75573143513906633035e-07,
      C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;

function kSin(r) {
  const z = r * r;
  return r + r * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))));
}
function kCos(r) {
  const z = r * r;
  return 1 - 0.5 * z + z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
}

// Reduce x to (k, r) with x ~= k*(pi/2) + r and |r| <= pi/4. Two-part pi/2 keeps
// the reduction accurate for the |k| we can reach. Phases in this engine are
// bounded by the sensor gain and field magnitude; CLAMP is a backstop so a
// runaway genome degrades to a fixed value instead of losing all precision.
const CLAMP = 1e6;

// Module-level scratch rather than a returned object. This is called ~80 times
// per agent per step — several million times per probe — and allocating a
// {k, r} pair each time was, measurably, the single largest cost in the roll.
let _k = 0, _r = 0;

function reduce(x) {
  if (!(x > -CLAMP && x < CLAMP)) x = x > 0 ? CLAMP : (x < 0 ? -CLAMP : 0);
  // Math.round is exactly specified (ties toward +Infinity), so this is portable.
  const k = Math.round(x * TWO_OVER_PI);
  _r = (x - k * PIO2_HI) - k * PIO2_LO;
  _k = k & 3;
}

export function dsin(x) {
  reduce(x);
  const r = _r;
  switch (_k) {
    case 0: return kSin(r);
    case 1: return kCos(r);
    case 2: return -kSin(r);
    default: return -kCos(r);
  }
}

export function dcos(x) {
  reduce(x);
  const r = _r;
  switch (_k) {
    case 0: return kCos(r);
    case 1: return -kSin(r);
    case 2: return -kCos(r);
    default: return kSin(r);
  }
}
