/* A star's outer envelope in d dimensions, as the star solver's outer boundary (no DOM). The interior solver
   (mainseq.js) carries a fully ionized gas, ∇_ad = 2/(d + 2) and a textbook opacity; a star's radius is set in its outer
   few per cent, where none of those hold. So the envelope is integrated from the photosphere inward on the surface model's
   own physics (atom/js/surface.js: Saha ionization of H, H⁻, He and, for ours, the metals' electrons; ∇_ad from the first
   law; the Rosseland mean of electron scattering, free–free, bound–free and H⁻), down to where the gas is fully ionized
   (T_fit, 3 × 10⁵ K), and the interior takes over there.
     · The atmosphere: grey, T^(d+1) = c_d T_eff^(d+1)(τ + q_d), dP/dτ = g/κ_R from τ = 10⁻⁴ to ⅔ (the photosphere, r = R).
     · Below: inward in ln P, dr = −P dlnP/(ρg), dm = S_d r^(d−1) ρ dr, d ln T = ∇ d ln P, g = G M f/r² (f the pinned law's
       surface factor in 4D, 1 in ours; the envelope's own mass is small and kept off g), L constant.
     · Convection by mixing length (Böhm-Vitense; Kippenhahn & Weigert eq. 7.18): ℓ = α H_P,
       U = (9/4)(K_rad/ρc_P ℓ²)√(8H_P/gδ), (ξ − U)³ + (8U/9)(ξ² − U² − W) = 0, W = ∇_rad − ∇_ad, ∇ = ξ² − U² + ∇_ad,
       with K_rad = (d + 1)acT^d/(dκρ) the radiative conductivity in d dimensions (3D: 4acT³/3κρ). MLT's geometric
       constants are a convention; α is fixed on our Sun's radius, as standard solar models fix theirs.
   The gas and opacity are tabulated lazily on a grid in (log T, log P) (0.02 and 0.05 dex), each cell computed once from
   surface.js and interpolated bilinearly: ρ, ∇_ad, κ_R, δ = −(∂lnρ/∂lnT)_P and c_P = Pδ/(ρT∇_ad). `kappa(ρ, T)` replaces
   surface.js's opacity (ours: OPAL's tables, atom/js/opal.js, as measured input), the gas staying the surface model's. */
import * as S from "./surface.js";
import { aRad, sigmaSB, SD, SI } from "./mainseq.js";

export function makeEnvelope(d, { X, Y, Z = 0, alpha = 1.8, hm = 1, ff = 1, gff = 1, Tfit = 3e5, dlT = 0.02, dlP = 0.05, kappa = null } = {}) {
  const w = S.world(d, { X, Y, Z, hm, ff, gff }), a = aRad(d), sig = sigmaSB(d), cache = new Map(), LN10 = Math.LN10;
  let lastRho = null;
  const rhoAt = (P, T) => { // bisection in ln ρ, bracketed near the last answer when it helps
    let lo = Math.log(1e-40), hi = Math.log(1e40);
    if (lastRho) { const g = Math.log(lastRho); for (let k = 1; k < 40; k++) { const l = g - k, h = g + k; if (w.state(T, Math.exp(l)).P < P && w.state(T, Math.exp(h)).P > P) { lo = l; hi = h; break; } } }
    for (let it = 0; it < 70; it++) { const m = (lo + hi) / 2; if (w.state(T, Math.exp(m)).P > P) hi = m; else lo = m; }
    return (lastRho = Math.exp((lo + hi) / 2)); };
  function cell(i, j) { const key = i * 100003 + j; let c = cache.get(key); if (c) return c;
    const T = 10 ** (i * dlT), P = 10 ** (j * dlP), rho = rhoAt(P, T), rho2 = rhoAt(P, T * 1.005), delta = -Math.log(rho2 / rho) / Math.log(1.005);
    let gad; try { gad = w.gradAd(T, rho); } catch { gad = 2 / (d + 2); }
    const kap = kappa ? kappa(rho, T) : w.kappaR(T, rho), cp = (P * delta) / (rho * T * gad);
    c = { lr: Math.log(rho), gad, lk: Math.log(kap), delta, lcp: Math.log(cp) }; cache.set(key, c); return c; }
  /* the gas at (T, P), bilinear in the table's logs */
  function gas(T, P) { const x = Math.log10(T) / dlT, y = Math.log10(P) / dlP, i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j;
    const c00 = cell(i, j), c10 = cell(i + 1, j), c01 = cell(i, j + 1), c11 = cell(i + 1, j + 1), mix = (k) => c00[k] * (1 - u) * (1 - v) + c10[k] * u * (1 - v) + c01[k] * (1 - u) * v + c11[k] * u * v;
    return { rho: Math.exp(mix("lr")), gad: mix("gad"), kappa: Math.exp(mix("lk")), delta: mix("delta"), cp: Math.exp(mix("lcp")) }; }
  /* ∇ by mixing length, given ∇_rad and the local gas */
  function nabla(T, P, rho, g, kappa, gad, delta, cp, grad) {
    if (!(grad > gad)) return { nab: grad, conv: false };
    const HP = P / (rho * g), l = alpha * HP, K = ((d + 1) * a * SI.c * T ** d) / (d * kappa * rho), U = (9 / 4) * (K / (rho * cp * l * l)) * Math.sqrt((8 * HP) / (g * delta)), W = grad - gad;
    let xi = Math.sqrt(W + U * U) + U; // Newton on (ξ − U)³ + (8U/9)(ξ² − U² − W) = 0 from above
    for (let k = 0; k < 60; k++) { const f = (xi - U) ** 3 + ((8 * U) / 9) * (xi * xi - U * U - W), fp = 3 * (xi - U) ** 2 + ((16 * U) / 9) * xi, dx = f / fp; xi -= dx; if (xi < U) xi = U + 1e-14; if (Math.abs(dx) < 1e-13 * xi) break; }
    return { nab: Math.min(grad, xi * xi - U * U + gad), conv: true }; }
  /* the envelope of mass M, radius R, luminosity L: the state at T_fit (mass m below it), the rows and the stirred zones */
  function envelope({ M, R, L, G, f = 1, keepRows = false }) {
    const Teff = (L / (SD[d] * R ** (d - 1) * sig)) ** (1 / (d + 1)), cq = d === 3 ? [0.75, 2 / 3] : [8 / (3 * Math.PI), (3 * Math.PI) / 8 - 2 / 3];
    const Tof = (tau) => (cq[0] * Teff ** (d + 1) * (tau + cq[1])) ** (1 / (d + 1)), g0 = (G * M * f) / (R * R), rows = [];
    // atmosphere: P from τ = 10⁻⁴ (P ≈ gτ/κ) to ⅔, RK2 in ln τ
    let tau = 1e-4, P = 0; { let Pg = 1; for (let it = 0; it < 40; it++) Pg = (g0 * tau) / gas(Tof(tau), Math.max(Pg, 1e-30) + (a * Tof(tau) ** (d + 1)) / d).kappa; P = Pg + (a * Tof(tau) ** (d + 1)) / d; }
    const nT = 60, h = Math.log(2 / 3 / tau) / nT; for (let k = 0; k < nT; k++) { const t0 = tau, f0 = (g0 * t0) / gas(Tof(t0), P).kappa, tm = t0 * Math.exp(h / 2), Pm = P + (h / 2) * f0, fm = (g0 * tm) / gas(Tof(tm), Pm).kappa; P += h * fm; tau = t0 * Math.exp(h); }
    // inward from the photosphere in ln P (RK2), until T_fit
    let r = R, T = Teff, m = 0, zones = [], cur = null; const dlnP = 0.03;
    const deriv = (r, T, P) => { const gs = gas(T, P), g = (G * M * f) / (r * r), Pr = (a * T ** (d + 1)) / d, F = L / (SD[d] * r ** (d - 1)), grad = (gs.kappa * F * P) / (SI.c * g * (d + 1) * Pr), nb = nabla(T, P, gs.rho, g, gs.kappa, gs.gad, gs.delta, gs.cp, grad);
      return { dr: -(P / (gs.rho * g)), dlnT: nb.nab, rho: gs.rho, conv: nb.conv, grad, gad: gs.gad, kappa: gs.kappa }; };
    // RK2 in ln P; the last step is cut to end exactly at T_fit (a whole step past it would make the fit point jump as
    // the step count changes, and the star's Newton solve could never converge through it)
    const step = (h) => { const k1 = deriv(r, T, P), r2 = r + 0.5 * h * k1.dr, T2 = T * Math.exp(0.5 * h * k1.dlnT), P2 = P * Math.exp(0.5 * h), k2 = deriv(r2, T2, P2), dr = h * k2.dr;
      return { k1, r: r + dr, T: T * Math.exp(h * k2.dlnT), P: P * Math.exp(h), dm: SD[d] * r2 ** (d - 1) * k2.rho * -dr }; };
    for (let n = 0; n < 4000 && T < Tfit; n++) {
      let h = dlnP, o = step(h);
      if (o.T > Tfit) for (let it = 0; it < 4; it++) { h *= Math.log(Tfit / T) / Math.log(o.T / T); o = step(h); }
      const k1 = o.k1;
      if (keepRows) rows.push({ r, T, P, rho: k1.rho, m, conv: k1.conv, grad: k1.grad, gad: k1.gad, kappa: k1.kappa });
      if (k1.conv && !cur) cur = { top: { r, T, P, m } }; if (!k1.conv && cur) { cur.bot = { r, T, P, m }; zones.push(cur); cur = null; }
      m += o.dm; r = o.r; P = o.P; T = h < dlnP ? Tfit : o.T;
      if (!(r > 0.05 * R) || !(m < 0.5 * M)) throw new Error(`envelope: reached r ${(r / R).toFixed(3)} R, mass ${(m / M).toExponential(2)} M above T_fit ${Tfit} K`); }
    if (cur) { cur.bot = { r, T, P, m }; cur.open = true; zones.push(cur); }
    return { Teff, m: M - m, menv: m, r, P, T, rows, zones: zones.map((z) => ({ rTop: z.top.r / R, rBot: z.bot.r / R, Ttop: z.top.T, Tbot: z.bot.T, mass: (z.bot.m - z.top.m) / M, open: !!z.open })) };
  }
  return { envelope, gas, cells: () => cache.size, world: w };
}
