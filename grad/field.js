// grad/field.js — Landreman's explicit 3D MHD equilibria (arXiv:2609.26742),
// the counterexamples to Grad's conjecture, and the tools that check them.
//
// This is the ONE copy of the maths. index.html imports it with
// <script type="module">, and field.selftest.mjs imports it unchanged.
//
// Both families solve (∇×B)×B = ∇p, ∇·B = 0 exactly, with smooth non-symmetric
// fields and nested toroidal pressure surfaces. Equation numbers below are the
// paper's. Nothing here solves an equilibrium: B, ψ and the surfaces are closed
// forms. The only numerics are CHECKS — finite-difference force balance, field
// lines traced from B alone, and the rotational-transform ODE (54).

const TAU = 2 * Math.PI;

// ------------------------------------------------------------ complex ------
const cx = {
  mul: (p, q) => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]],
  div: (p, q) => { const d = q[0] * q[0] + q[1] * q[1]; return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d]; },
  // principal root: positive real part, as the paper requires
  sqrt: (p) => {
    const r = Math.hypot(p[0], p[1]);
    const re = Math.sqrt(Math.max(0, (r + p[0]) / 2));
    const im = Math.sqrt(Math.max(0, (r - p[0]) / 2));
    return [re, p[1] < 0 ? -im : im];
  },
  exp: (p) => { const e = Math.exp(p[0]); return [e * Math.cos(p[1]), e * Math.sin(p[1])]; },
  sin: (p) => [Math.sin(p[0]) * Math.cosh(p[1]), Math.cos(p[0]) * Math.sinh(p[1])],
  cos: (p) => [Math.cos(p[0]) * Math.cosh(p[1]), -Math.sin(p[0]) * Math.sinh(p[1])],
};

// ============================================================ family 1 =====
/**
 * The ι = 2 family (§2). 0 ≤ ε < 1 (ε = 0 is the axisymmetric Solov'ev
 * limit (7)); outermost surface ψ = δ with 0 < δ < (1−ε)²/4 (18).
 */
export function family1({ eps = 0.5, delta = 1 / 64 } = {}) {
  if (!(eps >= 0 && eps < 1)) throw new RangeError('family 1 needs 0 ≤ ε < 1');
  const dmax = (1 - eps) ** 2 / 4;
  if (!(delta > 0 && delta < dmax)) throw new RangeError(`family 1 needs 0 < δ < (1−ε)²/4 = ${dmax}`);
  const a = Math.sqrt(1 + eps), b = Math.sqrt(1 - eps);

  // (2)–(3)
  const B = ([x, y, z]) => {
    const s = x * x / (a * a) + y * y / (b * b);
    const F = Math.sqrt(Math.max(0, 1 - (1 - s) ** 2 - 4 * z * z));
    return [(2 * z * x - (a / b) * F * y) / s, (2 * z * y + (b / a) * F * x) / s, 1 - s];
  };
  // (4)–(5)
  const psi = (X) => {
    const [x, y, z] = X, v = B(X);
    return (x * x + y * y + 4 * z * z + v[0] * v[0] + v[1] * v[1] + v[2] * v[2] - 2 + eps * eps) / 4;
  };
  const inDomain = ([x, y, z]) => { const s = x * x / (a * a) + y * y / (b * b); return 1 - (1 - s) ** 2 - 4 * z * z > 0; };

  // (12)–(13): the field-line map. (u, v) labels a line; ζ runs along it.
  const lineMap = (u, v, t) => {
    const q2 = u * u + v * v, L = Math.sqrt((1 + Math.sqrt(1 - 4 * q2)) / 2);
    const c = Math.cos(t), s = Math.sin(t);
    return [a * (L * c + (u * c + v * s) / L), b * (L * s + (v * c - u * s) / L), v * Math.cos(2 * t) - u * Math.sin(2 * t)];
  };
  // (17): ψ = f·δ, poloidal label α
  const labels = (f, al) => { const r = Math.sqrt(f * delta); return [-eps / 2 + r * Math.cos(al), r * Math.sin(al)]; };
  const surface = (f, al, t) => { const [u, v] = labels(f, al); return lineMap(u, v, t); };
  // (20)
  const Ra = Math.sqrt(1 - eps * eps);
  const axis = (t) => [Ra * Math.cos(t), Ra * Math.sin(t), (eps / 2) * Math.sin(2 * t)];
  // the axis is (20) with ζ = φ exactly, so the axis at geometric angle φ is closed-form
  const axisAt = (phi) => ({ R: Ra, Z: (eps / 2) * Math.sin(2 * phi) });

  return {
    family: 1, params: { eps, delta }, a, b, deltaMax: dmax,
    B, psi, inDomain,
    p: (X) => 2 * (delta - psi(X)),          // (30): p vanishes on the edge
    dpdpsi: -2,
    psiEdge: delta,
    surface, axis, axisAt, lineMap, labels,
    // every line closes after one toroidal turn, so a field line is (12) at fixed (u, v)
    fieldLine: (f, al, turns = 1, n = 256) => {
      const [u, v] = labels(f, al), out = [];
      for (let i = 0; i <= n * turns; i++) out.push(lineMap(u, v, (TAU * i) / n));
      return out;
    },
    iota: () => 2,                           // (26)
    iotaAxis: 2,
    volume: (f = 1) => 2 * Math.PI ** 2 * a * b * f * delta,   // (21)
    toroidalFlux: (f = 1) => Math.PI * a * b * f * delta,     // (22)
    meanB2: 1 - eps * eps / 2 + delta,                         // (28)
    beta: (2 * delta) / (1 - eps * eps / 2 + delta),           // (30)
    jacobian: -a * b,                                           // (14)
  };
}

// ============================================================ family 2 =====
/**
 * The sheared-ι family (§3). ε, S, λ > 0; outermost surface ψ = δ = k_b²/2
 * with k_b < 1 and arcsin k_b < S (45). ε = 0 is axisymmetric.
 */
export function family2({ eps = 2, S = 1, lam = 1, kb = 0.1 } = {}) {
  if (!(eps >= 0 && S > 0 && lam > 0)) throw new RangeError('family 2 needs ε ≥ 0, S > 0, λ > 0');
  if (!(kb > 0 && kb < 1 && Math.asin(kb) < S)) throw new RangeError('family 2 needs 0 < k_b < 1 and arcsin k_b < S');
  const delta = kb * kb / 2;

  // (31)–(33)
  const parts = ([x, y, z]) => {
    const wb = [x, -y];
    const wb2 = cx.mul(wb, wb);
    const K = cx.mul(wb, cx.sqrt(cx.div([wb2[0] + eps, wb2[1]], wb2)));
    const Xi = cx.mul([x, y], K); Xi[0] += Math.PI / 2 - S;
    const ez = cx.exp([0, -lam * z]);
    const W = cx.div(cx.mul([0, 1], cx.sin(Xi)), [2 * K[0], 2 * K[1]]);
    const hz = cx.mul(ez, W);
    const bz = cx.mul(ez, cx.cos(Xi))[0];
    return { B: [hz[0], hz[1], bz / lam], psi: 0.5 * (Math.sin(lam * z) ** 2 + bz * bz) };
  };
  const B = (X) => parts(X).B;
  const psi = (X) => parts(X).psi;

  // (39)
  const hh = (s) => Math.sqrt(4 * s * s + eps * eps);
  const ac = (s) => Math.sqrt((hh(s) - eps) / 2);
  const bc = (s) => Math.sqrt((hh(s) + eps) / 2);
  const nu = (t) => (eps / 2) * Math.sin(2 * t);                 // (40)
  // (42): σ from (X, Y, ζ)
  const sigma = (X, Y, t) => {
    const n = nu(t);
    return S + Math.atan((Math.tanh(n) * Y) / Math.sqrt(1 - Y * Y)) - Math.asin(X / Math.sqrt(Math.cosh(n) ** 2 - Y * Y));
  };
  // (43) with (49): X = −k cos χ, Y = k sin χ
  const mapXY = (X, Y, t) => { const sg = sigma(X, Y, t); return [ac(sg) * Math.cos(t), bc(sg) * Math.sin(t), -Math.asin(Y) / lam]; };
  const kOf = (f) => kb * Math.sqrt(f);                            // ψ = k²/2 = f·δ
  const surface = (f, chi, t) => { const k = kOf(f); return mapXY(-k * Math.cos(chi), k * Math.sin(chi), t); };
  // (50)
  const axis = (t) => [ac(S) * Math.cos(t), bc(S) * Math.sin(t), 0];
  const axisAt = (phi) => {
    const t = Math.atan2(ac(S) * Math.sin(phi), bc(S) * Math.cos(phi));
    return { R: Math.hypot(ac(S) * Math.cos(t), bc(S) * Math.sin(t)), Z: 0 };
  };
  const G = (s, t) => (hh(s) + eps * Math.cos(2 * t)) / 2;       // (46)

  // (54): dχ/dζ on the surface of radius k
  const dchi = (t, chi, k) => {
    const X = -k * Math.cos(chi), Y = k * Math.sin(chi), n = nu(t);
    const sg = sigma(X, Y, t);
    return (2 * G(sg, t) * Math.sqrt(1 - k * k * Math.sin(chi) ** 2)) / Math.sqrt(Math.cosh(n) ** 2 - k * k);
  };
  /** Integrate (54) with RK4; returns χ at the end, and the path if asked. */
  const integrateChi = (k, chi0, t0, turns, steps, keep) => {
    let chi = chi0, t = t0; const dt = TAU / steps, path = keep ? [[t, chi]] : null;
    for (let i = 0; i < turns * steps; i++) {
      const k1 = dchi(t, chi, k), k2 = dchi(t + dt / 2, chi + (dt / 2) * k1, k);
      const k3 = dchi(t + dt / 2, chi + (dt / 2) * k2, k), k4 = dchi(t + dt, chi + dt * k3, k);
      chi += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4); t += dt;
      if (keep) path.push([t, chi]);
    }
    return { chi, path };
  };
  // (55)–(56): closed-form on-axis transform, by the trapezoid rule (spectrally accurate here)
  const H = (() => { const N = 4096; let s = 0; for (let i = 0; i < N; i++) s += 1 / Math.cosh(nu((TAU * i) / N)); return s / N; })();

  // (62)–(64): volume and β by two numerical integrals over (ξ, ζ)
  const averages = (() => {
    const d = Math.asin(kb), nx = 240, nz = 240;
    let IU = 0, IM = 0, IC = 0, IA = 0;
    for (let i = 0; i < nx; i++) {
      // Gauss–Chebyshev-like node spacing is overkill; midpoint in a variable that
      // flattens the √ edge: ξ = d·sin(θ), dξ = d·cos θ dθ
      const th = -Math.PI / 2 + (Math.PI * (i + 0.5)) / nx, xi = d * Math.sin(th), w = d * Math.cos(th) * (Math.PI / nx);
      for (let j = 0; j < nz; j++) {
        const t = (TAU * (j + 0.5)) / nz, n = nu(t), dz = TAU / nz;
        const F = Math.cosh(n) ** 2 - Math.sin(xi) ** 2;
        const U = Math.asin(Math.sqrt(Math.max(0, (kb * kb - Math.sin(xi) ** 2) / F)));
        const DU = U - 0.5 * Math.sin(2 * U);
        const c0 = -(Math.sin(xi) * Math.cos(xi)) / Math.sqrt(F), c1 = (Math.cosh(n) * Math.sinh(n)) / Math.sqrt(F);
        const ww = w * dz;
        IU += ww * U;
        IM += ww * (2 * Math.sin(xi) ** 2 * U + F * DU);
        IC += ww * (c0 * c0 * (2 * U - DU) + c1 * c1 * DU);
        IA += ww * ((F * U) / hh(S + xi));
      }
    }
    const M = IM / (4 * IU), Cc = IC / (2 * IU), A = IA / (2 * IU);
    return { V: IU / lam, M, C: Cc, A };
  })();

  return {
    family: 2, params: { eps, S, lam, kb }, deltaMax: null,
    B, psi,
    p: (X) => (delta - psi(X)) / (lam * lam),                  // (61) setup: p vanishes on the edge
    dpdpsi: -1 / (lam * lam),
    psiEdge: delta,
    surface, axis, axisAt, sigma, mapXY, kOf, G, hh, ac, bc, nu, dchi, integrateChi,
    /** A field line on surface f, as points, integrated from (54). */
    fieldLine: (f, chi0, turns = 1, n = 256) => {
      const k = kOf(f);
      const { path } = integrateChi(k, chi0, 0, turns, n, true);
      return path.map(([t, c]) => mapXY(-k * Math.cos(c), k * Math.sin(c), t));
    },
    /** ι on surface f, as the rotation number of (54) over many transits. */
    iota: (f, turns = 200, steps = 256) => {
      const k = kOf(f);
      if (k === 0) return hh(S) * H;
      return integrateChi(k, 0, 0, turns, steps, false).chi / (TAU * turns);
    },
    iotaAxis: hh(S) * H,
    volume: () => averages.V,
    meanB2: averages.A + averages.C / (lam * lam),               // (59)
    beta: (2 * (delta - averages.M)) / (lam * lam * averages.A + averages.C),  // (61)
    averages,
    // (48)
    jacobianAt: (X, Y, t) => {
      const sg = sigma(X, Y, t), T = Math.sqrt(Math.cosh(nu(t)) ** 2 - X * X - Y * Y);
      return -G(sg, t) / (lam * hh(sg) * T * Math.sqrt(1 - Y * Y));
    },
  };
}

export const make = (fam, params) => (fam === 1 ? family1(params) : family2(params));

// ============================================================== checks =====
/**
 * Force balance and divergence at a point, by central differences on B alone.
 * Returns absolute residuals and the local |∇p| for scale.
 */
export function residual(F, x, h = 1e-5) {
  const d = (f, i) => { const a = [...x], b = [...x]; a[i] += h; b[i] -= h; return (f(a) - f(b)) / (2 * h); };
  const J = [0, 1, 2].map((i) => [0, 1, 2].map((j) => d((y) => F.B(y)[i], j)));
  const b = F.B(x);
  const curl = [J[2][1] - J[1][2], J[0][2] - J[2][0], J[1][0] - J[0][1]];
  const jxb = [curl[1] * b[2] - curl[2] * b[1], curl[2] * b[0] - curl[0] * b[2], curl[0] * b[1] - curl[1] * b[0]];
  const gp = [0, 1, 2].map((i) => d(F.p, i));
  const gpsi = [0, 1, 2].map((i) => d(F.psi, i));
  return {
    force: Math.hypot(jxb[0] - gp[0], jxb[1] - gp[1], jxb[2] - gp[2]),
    grad: Math.hypot(...gp),
    div: Math.abs(J[0][0] + J[1][1] + J[2][2]),
    bdotgradpsi: Math.abs(b[0] * gpsi[0] + b[1] * gpsi[1] + b[2] * gpsi[2]),
    curl, jxb, gp, B: b,
  };
}

/** Random points inside the plasma, drawn through the surface parametrisation. */
export function samplePoints(F, n, rand = Math.random) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(F.surface(rand(), TAU * rand(), TAU * rand()));
  return out;
}

const phiOf = (x) => Math.atan2(x[1], x[0]);

/**
 * Trace a field line from x0 using B alone, with the geometric toroidal angle
 * φ as the independent variable: dx/dφ = B / (B·∇φ), B·∇φ = (x B_y − y B_x)/R².
 * RK4, `steps` per toroidal turn. Records the crossings of each plane in
 * `planes` (angles that must be multiples of 2π/steps from φ₀), and the
 * poloidal angle θ about the magnetic axis (24), unwrapped along the way.
 */
export function trace(F, x0, { turns = 20, steps = 256, planes = [0] } = {}) {
  const dphi = TAU / steps;
  const f = (x) => {
    const b = F.B(x), R2 = x[0] * x[0] + x[1] * x[1], bp = (x[0] * b[1] - x[1] * b[0]) / R2;
    return [b[0] / bp, b[1] / bp, b[2] / bp];
  };
  const theta = (x, phi) => {
    const ax = F.axisAt(phi), R = Math.hypot(x[0], x[1]);
    return Math.atan2(-(x[2] - ax.Z), R - ax.R);
  };
  let x = [...x0], phi = phiOf(x0);
  const phi0 = phi;
  let th = theta(x, phi), thTotal = 0;
  const hits = planes.map(() => []);
  const planeStep = planes.map((p) => Math.round((((p - phi0) % TAU) + TAU) % TAU / dphi));
  let psiMax = 0;
  const psi0 = F.psi(x0);
  for (let i = 1; i <= turns * steps; i++) {
    const k1 = f(x);
    const k2 = f(x.map((v, j) => v + (dphi / 2) * k1[j]));
    const k3 = f(x.map((v, j) => v + (dphi / 2) * k2[j]));
    const k4 = f(x.map((v, j) => v + dphi * k3[j]));
    x = x.map((v, j) => v + (dphi / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    phi = phi0 + i * dphi;
    const t2 = theta(x, phi);
    let dt = t2 - th;
    dt -= TAU * Math.round(dt / TAU);
    thTotal += dt; th = t2;
    planeStep.forEach((s, j) => { if (i % steps === s) hits[j].push([Math.hypot(x[0], x[1]), x[2]]); });
    if (i % 16 === 0) psiMax = Math.max(psiMax, Math.abs(F.psi(x) - psi0));
  }
  return { iota: thTotal / (TAU * turns), hits, psiDrift: psiMax, end: x };
}

/** Start point on surface f at geometric toroidal angle φ (found by bisection on the surface's ζ). */
export function pointAt(F, f, pol, phi) {
  const ph = (t) => phiOf(F.surface(f, pol, t));
  // sample one period, unwrap, and bracket the crossing of φ (mod 2π)
  const N = 64;
  let prev = ph(0), acc = prev;
  const ts = [0], ps = [acc];
  for (let i = 1; i <= N; i++) {
    const t = (TAU * i) / N, cur = ph(t);
    let d = cur - prev; d -= TAU * Math.round(d / TAU);
    acc += d; prev = cur; ts.push(t); ps.push(acc);
  }
  // a sample already on the plane (to rounding) is the answer: the bracket test
  // below can miss it when the unwrapped end lands an ulp short of 2π
  for (let i = 0; i <= N; i++) {
    let d = ph(ts[i]) - phi; d -= TAU * Math.round(d / TAU);
    if (Math.abs(d) < 1e-14) return F.surface(f, pol, ts[i]);
  }
  for (let i = 0; i < N; i++) {
    for (let m = -2; m <= 2; m++) {
      const target = phi + TAU * m;
      if ((ps[i] - target) * (ps[i + 1] - target) <= 0) {
        // unwrapped angle, measured from the bracket's own start
        const base = ph(ts[i]);
        const g = (t) => { let d = ph(t) - base; d -= TAU * Math.round(d / TAU); return ps[i] + d - target; };
        let lo = ts[i], hi = ts[i + 1], glo = g(lo);
        if (glo === 0) return F.surface(f, pol, lo);          // an exact root at the bracket's end
        if (g(hi) === 0) return F.surface(f, pol, hi);
        for (let it = 0; it < 64; it++) {
          const mid = (lo + hi) / 2, gm = g(mid);
          if (gm === 0) return F.surface(f, pol, mid);
          if (gm > 0 === glo > 0) { lo = mid; glo = gm; } else hi = mid;
        }
        return F.surface(f, pol, (lo + hi) / 2);
      }
    }
  }
  throw new Error('surface does not reach that toroidal angle');
}

/** The cross-section of surface f at toroidal angle φ, as [R, z] pairs. */
export function section(F, f, phi, n = 96) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = pointAt(F, f, (TAU * i) / n, phi);
    out.push([Math.hypot(x[0], x[1]), x[2]]);
  }
  return out;
}
