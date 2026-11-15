/* A star's outer layers in d dimensions, no DOM: whether they stir. Paper 2's Carter test made 4D: a Sun-like star whose
   hydrogen recombines below its photosphere turns convective there (ionization lowers ∇_ad and raises the opacity), and
   whether it does is a fact about the atoms (their binding against the photosphere's temperature and density), not a
   choice. SI throughout.
   · The gas (`state`): H, H⁺, H⁻, He, He⁺, He²⁺ and electrons by Saha in d dimensions,
       n_(i+1) n_e / n_i = 2 (U_(i+1)/U_i) (m_e kT/2πħ²)^(d/2) e^(−χ/kT),
     hydrogen's partition function over its levels (atom/js/photo.js; 4D: ν = n_r + l + 3/2, each 2(l + 1)²-fold with
     spin) cut where an orbit (1.5 ν² a₀) outgrows half the spacing between atoms; light pressing u/d, u = aT^(d+1).
     Energies: hydrogen's from photo.js (6.05 eV in 4D), helium's first from the book's table (atom/js/tablec.js), its
     second hydrogen-like (×4), H⁻'s affinity from atom/tools/hminus.mjs (4D, ≥ 12.3 meV by s-wave CI; ours measured,
     0.754 eV). ∇_ad = (∂ln T/∂ln P)_s from the first law, numerically.
   · The opacity (`kappaR`): the Rosseland mean over each world's Planck weight, x^(d+1)eˣ/(eˣ − 1)², of
       electron scattering — ours Thomson; 4D through the lens vacuum, (3π³/4) r_e² c/ω (mainseq.js sigmaLens);
       free–free — ours Kramers (Gaunt factor 1); 4D the book's classical form, n_e Σn_iZ_i² π⁵α³ħ²c³(1+x)(1−e^(−x))/(m²ω⁵)
         (mainseq.js kappaFF4), × ff (1; the band 0.5–2);
       bound–free — every hydrogen level and hydrogen-like He⁺ from atom/js/surfacedata.js (the book's dipole rate by
         detailed balance), He I on hydrogen's 1s shape moved to its own threshold (an approximation, named), H⁻ from a
         cross-section the caller supplies (none by default: its share is reported, not assumed);
       stimulated emission on every absorption.
   · The envelope (`envelope`): the grey atmosphere T^(d+1) = c_d T_eff^(d+1)(τ + q_d) (ours ¾, ⅔; 4D 8/3π and 3π/8 − ⅔,
     so T = T_eff at τ = ⅔ as the star solver has it), dP/dτ = g/κ_R, then inward in ln P with dr = −P dlnP/(ρg),
     g = GM/r² (the envelope's own mass and pinned gravity's correction near the surface left out), and
     ∇ = ∇_rad = κFP/(c g (d+1) P_rad) (F = L/S_d r^(d−1)) where that is below ∇_ad, else ∇_ad (Schwarzschild; no
     superadiabatic excess). Reports every convective zone: its top and bottom temperature and pressure, how deep it
     reaches (r/R) and the mass it holds. */
import { SURFACE } from "./surfacedata.js";
import { aRad, sigmaSB, SD, SI } from "./mainseq.js";
import { TABLE } from "./tablec.js";

const EV = 1.602176634e-19, A0 = 0.529177210903e-10, ALPHA = 1 / 137.035999084, RE = 2.8179403262e-15, MH = 1.00782503 * SI.mu, MHE = 4.002602 * SI.mu, XBAR4 = (6 * 1.0173430619844491) / 1.0369277551433699; // ζ(6)/ζ(5)
const lin = (xs, ys, x) => { if (x <= xs[0]) return ys[0]; const n = xs.length; if (x >= xs[n - 1]) return ys[n - 1] * (xs[n - 1] / x) ** 3; let i = 0, j = n - 1; while (j - i > 1) { const m = (i + j) >> 1; if (xs[m] > x) j = m; else i = m; } const f = Math.log(x / xs[i]) / Math.log(xs[j] / xs[i]); return Math.exp(Math.log(ys[i] || 1e-300) * (1 - f) + Math.log(ys[j] || 1e-300) * f); };
const ionE = (d, Z) => TABLE[String(d)].find((e) => e.Z === Z).ion * 27.211386245988; // the book's first ionization, eV

export function world(d, { X = d === 3 ? 0.7 : 0.75, Y = d === 3 ? 0.3 : 0.25, ff = 1, hm = 1, chiHm = SURFACE.worlds[d].Hminus.affinity_eV } = {}) {
  // H⁻'s photodetachment from the baked table (a₀^(d−1) → m^(d−1)), × hm (1 as computed; ours' computed peak is ~2× the
  // measured one, so 0.5 is the band's other edge); 0 leaves H⁻ out
  const HM = SURFACE.worlds[d].Hminus, hminusSigma = hm ? (wEv) => hm * lin(HM.w_eV, HM.sigma, wEv) * A0 ** (d - 1) : null;
  const W = SURFACE.worlds[d], H = W.H, He2 = W.HeII, chiH = -H[0].E_eV, chiHe1 = ionE(d, 2), chiHe2 = -He2[0].E_eV, a = aRad(d), sig = sigmaSB(d);
  // levels weighted by a smooth occupation probability, w = exp(−(r_orbit/half-spacing)³), r_orbit = 1.5ν²a₀ (a hard cut
  // made the partition function jump with density, and ∇_ad's numerical derivative with it)
  const cutLevels = (lv, nTot) => { const half = 0.5 * nTot ** (-1 / d); return lv.map((v, i) => ({ ...v, w: i === 0 ? 1 : Math.exp(-(((1.5 * (v.N + (d - 3) / 2) ** 2 * A0) / half) ** 3)) })).filter((v) => v.w > 1e-12); };
  const U = (lv, kT) => lv.reduce((t, v) => t + v.w * v.g * Math.exp(-(v.E_eV - lv[0].E_eV) / kT), 0);
  /* the gas at T, ρ: populations (m⁻ᵈ), P, the internal energy per volume */
  function state(T, rho) {
    const kT = (SI.k * T) / EV, nH = (rho * X) / MH, nHe = (rho * Y) / MHE, nTot = nH + nHe, LH = cutLevels(H, nTot), LHe = cutLevels(He2, nTot);
    const UH = U(LH, kT), UHe2 = U(LHe, kT), lam = ((SI.me * SI.k * T) / (2 * Math.PI * SI.hbar * SI.hbar)) ** (d / 2);
    const sH = (2 * lam * Math.exp(-chiH / kT)) / UH, sHm = (1 * Math.exp(chiHm / kT)) / (2 * UH * lam), s1 = (2 * UHe2 * lam * Math.exp(-chiHe1 / kT)) / 1, s2 = (2 * lam * Math.exp(-chiHe2 / kT)) / UHe2;
    const pops = (ne) => { const A = sH / ne, B = sHm * ne, h0 = nH / (1 + A + B), a1 = s1 / ne, a2 = s2 / ne, he0 = nHe / (1 + a1 + a1 * a2);
      return { h0, hp: h0 * A, hm: h0 * B, he0, he1: he0 * a1, he2: he0 * a1 * a2 }; };
    let lo = Math.log(1e-30 * nTot + 1e-300), hi = Math.log(1.5 * (nH + 2 * nHe));
    for (let it = 0; it < 80; it++) { const m = (lo + hi) / 2, ne = Math.exp(m), p = pops(ne); if (ne - (p.hp + p.he1 + 2 * p.he2 - p.hm) > 0) hi = m; else lo = m; }
    const ne = Math.exp((lo + hi) / 2), p = pops(ne), Pg = (nH + nHe + ne) * SI.k * T, Pr = (a * T ** (d + 1)) / d;
    const exc = LH.reduce((t, v) => t + v.w * v.g * Math.exp(-(v.E_eV - LH[0].E_eV) / kT) * (v.E_eV - LH[0].E_eV), 0) / UH;
    const u = (d / 2) * (nH + nHe + ne) * SI.k * T + EV * (chiH * p.hp - chiHm * p.hm + chiHe1 * p.he1 + (chiHe1 + chiHe2) * p.he2 + exc * p.h0) + a * T ** (d + 1);
    return { T, rho, ne, ...p, Pg, Pr, P: Pg + Pr, u, UH, LH, LHe, UHe2, kT, xH: p.hp / nH };
  }
  /* the density at total pressure P and temperature T */
  function rhoAt(P, T) { let lo = Math.log(1e-40), hi = Math.log(1e40); for (let it = 0; it < 120; it++) { const m = (lo + hi) / 2; if (state(T, Math.exp(m)).P > P) hi = m; else lo = m; } return Math.exp((lo + hi) / 2); }
  /* ∇_ad: along du_m = (P/ρ²) dρ */
  function gradAd(T, rho) {
    const s0 = state(T, rho), dl = 1e-4, rho1 = rho * Math.exp(dl), um0 = s0.u / rho, target = um0 + (s0.P / rho) * dl; // ∫(P/ρ²)dρ ≈ (P/ρ) dlnρ
    let t1 = 0, t2 = 1e-4; const g = (t) => state(T * Math.exp(t), rho1).u / rho1 - target, g1 = g(t1), g2 = g(t2), t = t1 - (g1 * (t2 - t1)) / (g2 - g1);
    const r = t / Math.log(state(T * Math.exp(t), rho1).P / s0.P);
    if (!(r > 0.02 && r < 0.75)) throw new Error(`∇_ad ${r} at T ${T}, ρ ${rho}: the equation of state is not smooth there`); return r;
  }
  /* the monochromatic opacity per length at x = ħω/kT, and the Rosseland mean per mass */
  const XS = Array.from({ length: 900 }, (_, i) => 0.01 * 1.0095 ** i).filter((x) => x < 60), WT = XS.map((x) => x ** (d + 1) * Math.exp(x) / Math.expm1(x) ** 2);
  const dX = XS.map((x, i) => (i ? x - XS[i - 1] : x)), W0 = WT.reduce((t, w, i) => t + w * dX[i], 0);
  function kappaParts(st) {
    const { T, ne, kT } = st, x0 = (SI.hbar * SI.c) / (SI.k * T), out = { es: [], ff: [], bfH: [], bfHe: [], hm: [] }, ions = st.hp + st.he1 + 4 * st.he2, aU = A0 ** (d - 1);
    const popH = st.LH.map((v) => (st.h0 * v.w * v.g * Math.exp(-(v.E_eV - st.LH[0].E_eV) / kT)) / st.UH), popHe = st.LHe.map((v) => (st.he1 * v.w * v.g * Math.exp(-(v.E_eV - st.LHe[0].E_eV) / kT)) / st.UHe2);
    for (const x of XS) { const wEv = x * kT, stim = -Math.expm1(-x), om = (x * SI.k * T) / SI.hbar;
      out.es.push(ne * (d === 3 ? (8 * Math.PI * RE * RE) / 3 : ((3 * Math.PI ** 3) / 4) * RE * RE * (SI.c / om)));
      if (d === 4) out.ff.push(ff * ne * ions * Math.PI ** 5 * ALPHA ** 3 * SI.hbar ** 2 * SI.c ** 3 * (1 + x) * stim / (SI.me ** 2 * om ** 5));
      else { const nu = om / (2 * Math.PI); out.ff.push(ff * 100 * 3.69e8 * (ne * 1e-6) * (ions * 1e-6) * T ** -0.5 * nu ** -3 * stim); } // Kramers, cgs → per m
      let bh = 0; st.LH.forEach((v, i) => { if (wEv > -v.E_eV) bh += popH[i] * lin(v.w_eV, v.sigma, wEv) * aU; });
      let bhe = 0; st.LHe.forEach((v, i) => { if (wEv > -v.E_eV) bhe += popHe[i] * lin(v.w_eV, v.sigma, wEv) * aU; });
      if (wEv > chiHe1) bhe += st.he0 * lin(H[0].w_eV, H[0].sigma, (wEv * chiH) / chiHe1) * aU; // He I on hydrogen's 1s shape (approximate)
      out.bfH.push(bh * stim); out.bfHe.push(bhe * stim); out.hm.push(hminusSigma && wEv > chiHm ? st.hm * hminusSigma(wEv) * stim : 0); }
    return out;
  }
  function kappaR(T, rho, { parts = false } = {}) {
    const st = state(T, rho), k = kappaParts(st); let s = 0; const share = { es: 0, ff: 0, bfH: 0, bfHe: 0, hm: 0 };
    XS.forEach((x, i) => { const tot = k.es[i] + k.ff[i] + k.bfH[i] + k.bfHe[i] + k.hm[i]; s += (WT[i] * dX[i]) / tot; for (const key in share) share[key] += (WT[i] * dX[i] * k[key][i]) / tot / tot; });
    const kr = W0 / s / rho; if (!parts) return kr; const n = Object.values(share).reduce((a, b) => a + b, 0); for (const key in share) share[key] /= n; return { kappa: kr, share, st };
  }
  /* the envelope of a star of mass M, radius R, luminosity L under gravity G */
  function envelope({ M, R, L, G, tauBase = 10, dlnP = 0.02, Tstop = 3e6, rStop = 0.2 }) {
    const Teff = (L / (SD[d] * R ** (d - 1) * sig)) ** (1 / (d + 1)), cq = d === 3 ? [0.75, 2 / 3] : [8 / (3 * Math.PI), (3 * Math.PI) / 8 - 2 / 3];
    const Tof = (tau) => (cq[0] * Teff ** (d + 1) * (tau + cq[1])) ** (1 / (d + 1)), g0 = (G * M) / R ** 2, rows = [];
    // atmosphere: dP/dτ = g/κ on a log grid in τ
    let tau = 1e-4, P = 0; { let Pg = 1e-3; for (let it = 0; it < 60; it++) { const T = Tof(tau), rho = rhoAt(Pg + (aRad(d) * T ** (d + 1)) / d, T); Pg = (g0 * tau) / kappaR(T, rho); } P = Pg + (aRad(d) * Tof(tau) ** (d + 1)) / d; }
    const push = (r, T, P, rho, grad, gad, kap, m, zone) => rows.push({ r, T, P, rho, grad, gad, kappa: kap, m, conv: zone });
    for (let i = 0; tau < tauBase; i++) { const t2 = tau * 1.08, T = Tof(tau), rho = rhoAt(P, T), k = kappaR(T, rho), dP = (g0 / k) * (t2 - tau), Tn = Tof(t2), gAt = Math.log(Tn / T) / Math.log((P + dP) / P), gad = gradAd(T, rho);
      push(R, T, P, rho, gAt, gad, k, 0, gAt > gad); P += dP; tau = t2; }
    // interior, inward in ln P
    let r = R, T = Tof(tau), m = 0;
    while (T < Tstop && r > rStop * R) { const rho = rhoAt(P, T), k = kappaR(T, rho), g = (G * M) / r ** 2, F = L / (SD[d] * r ** (d - 1)), st = state(T, rho);
      const grad = (k * F * P) / (SI.c * g * (d + 1) * st.Pr), gad = gradAd(T, rho), nab = Math.min(grad, gad), dr = (P * dlnP) / (rho * g);
      push(r, T, P, rho, grad, gad, k, m, grad > gad); m += SD[d] * r ** (d - 1) * rho * dr; r -= dr; P *= Math.exp(dlnP); T *= Math.exp(nab * dlnP); }
    // zones
    const zones = []; let cur = null; rows.forEach((w) => { if (w.conv && !cur) cur = { top: w }; if (cur) cur.bot = w; if (!w.conv && cur) { zones.push(cur); cur = null; } }); if (cur) zones.push({ ...cur, open: true });
    return { Teff, g: g0, rows, zones: zones.map((z) => ({ Ttop: z.top.T, Tbot: z.bot.T, Ptop: z.top.P, Pbot: z.bot.P, rBot: z.bot.r / R, mass: (z.bot.m - z.top.m) / M, open: !!z.open, maxExcess: Math.max(...rows.filter((w) => w.T >= z.top.T && w.T <= z.bot.T).map((w) => w.grad - w.gad)) })) };
  }
  return { d, X, Y, chiH, chiHe1, chiHe2, chiHm, state, rhoAt, gradAd, kappaR, envelope };
}
