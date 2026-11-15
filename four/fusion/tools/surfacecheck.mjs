/* The surface test's check on our own world (paper 2): the same machinery that judges 4D's photospheres, run on ours.
   1. Free–free on neutral hydrogen (ours' H⁻ free–free) from atom/js/eh.js (static-exchange σ_mt, soft-photon limit),
      against Bell & Berrington (1987)'s table as Korg.jl transcribes it (K, 1e-26 cm⁴/dyn per ground-state H atom and
      unit electron pressure, stimulated emission included; rows below copied from Korg's absorption_H.jl).
   2. H⁻ photodetachment (atom/tools/hminus.mjs, moved to the measured 0.754 eV threshold) against McLaughlin et al.
      (2017)'s peak, 39.5 Mb at 1.464 eV (Korg's data/McLaughlin2017Hminusbf.dat): the ratio is the calibration band.
   3. Our zero-age main sequence (mainseq.mjs ours → OURS=ours.json), metal-free, through atom/js/surface.js: which
      stars have convective envelopes (against Pols's notes, §9.2.2: convective envelopes below ~1.2–1.5 M☉).
   Writes papers/p2/data/surfacecheck.json.
     OURS=<ours.json> node four/fusion/tools/surfacecheck.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import * as EH from "../../atom/js/eh.js";
import * as S from "../../atom/js/surface.js";
import { SURFACE } from "../../atom/js/surfacedata.js";

const BB = { // θ = 5040/T → λ (Å) → K
  0.5: { 10126: 0.358, 30378: 3.04, 91134: 27.0 },
  1.0: { 5063: 0.195, 10126: 0.702, 15189: 1.52, 22784: 3.37, 30378: 5.86, 45567: 13.1, 91134: 51.9 },
  1.6: { 10126: 1.06, 30378: 8.67, 91134: 76.8 } };
const a0cm = 0.529177210903e-8, Ha = 4.3597447222071e-11, kB = 1.380649e-16, hc = 6.62607015e-27 * 2.99792458e10, MT = SURFACE.worlds[3].Hff.sigmaMT;
const ff = []; for (const [th, row] of Object.entries(BB)) { const T = 5040 / +th; for (const [lam, k] of Object.entries(row)) { const w = hc / (+lam * 1e-8) / Ha, kT = (kB * T) / Ha, c = EH.ffCoef(3, w, kT, MT), K = (c * a0cm ** 5) / (kB * T) / 1e-26; ff.push({ T, lam: +lam, K, bb: k, ratio: K / k }); } }
const HM = SURFACE.worlds[3].Hminus, peak = HM.sigma.reduce((a, s, i) => (s > a.s ? { s, w: HM.w_eV[i] } : a), { s: 0 }), peakCm2 = peak.s * a0cm ** 2;
const hmCal = { computedPeak_cm2: peakCm2, computedPeak_eV: peak.w, measuredPeak_cm2: 39.506e-18, measuredPeak_eV: 1.46442, factor: 39.506e-18 / peakCm2 };
const stars = []; if (process.env.OURS) { const O = JSON.parse(readFileSync(process.env.OURS, "utf8")).sort((a, b) => a.m - b.m);
  for (const hm of [1, hmCal.factor]) { const w = S.world(3, { hm }); for (const r of O.filter((x) => x.m >= 0.5 && x.m <= 3)) { let e; try { e = w.envelope({ M: r.m * 1.98847e30, R: r.R, L: r.L, G: 6.6743e-11, Tstop: 3e6, rStop: 0.3 }); } catch (err) { stars.push({ hm, m: r.m, Teff: r.Teff, outside: String(err.message).slice(0, 120) }); console.log(`hm ${hm.toFixed(2)} ${r.m.toFixed(2)} M☉: outside the model (${String(err.message).slice(0, 60)}…)`); continue; } const ph = e.rows.find((x) => x.T >= e.Teff), z = e.zones.reduce((a, b) => (b.mass > (a?.mass ?? -1) ? b : a), null), k = w.kappaR(ph.T, ph.rho, { parts: true });
    stars.push({ hm, m: r.m, Teff: e.Teff, Pph: ph.P, rhoPh: ph.rho, kappaPh: ph.kappa, share: k.share, zoneMass: z?.mass ?? 0, rBot: z?.rBot ?? 1, open: z?.open ?? false }); console.log(`hm ${hm.toFixed(2)} ${r.m.toFixed(2)} M☉ Teff ${e.Teff.toFixed(0)} K: zone mass ${(z?.mass ?? 0).toExponential(1)}`); } } }
writeFileSync(new URL("../../papers/p2/data/surfacecheck.json", import.meta.url), JSON.stringify({ about: "fusion/tools/surfacecheck.mjs: the surface machinery on our own world — H⁻ free–free against Bell & Berrington 1987 (via Korg.jl), H⁻ photodetachment's peak against McLaughlin et al. 2017 (via Korg.jl), and our metal-free zero-age stars' convective envelopes", ff, hmCal, stars }, null, 1));
console.log(`free–free: computed / Bell & Berrington ${Math.min(...ff.map((f) => f.ratio)).toFixed(2)}–${Math.max(...ff.map((f) => f.ratio)).toFixed(2)}; H⁻ photodetachment peak ${peakCm2.toExponential(2)} cm² at ${peak.w.toFixed(2)} eV against 3.95e-17 at 1.46 (factor ${hmCal.factor.toFixed(2)})`);
