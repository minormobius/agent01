/* Our Sun aged by the book's own machinery (atom/tools/evolve.mjs), against standard solar models (papers/p2): the check
   on our world before 4D stars are aged the same way. Reads the evolve runs from $TMPDIR/atom4-mainseq and the references
   in papers/p2/data (ssm-ref.json: Bahcall, Pinsonneault & Basu 2001, Vinyoles et al. 2017, Pols; modelS.json: Model S).
     node four/fusion/tools/suncheck.mjs [X0 of the full run, 0.687]   → papers/p2/data/evolvecheck.json
   What it checks, in four layers, so a mismatch can be placed:
     1. the burning law alone: fusion/js/shell.js's ε at Model S's own ρ, T and composition, shell by shell, against
        Model S's ε (no structure, no history);
     2. the structure alone: our star solved on Model S's composition profile (our opacity, EOS and burning), against
        Model S's centre and luminosity (no history);
     3. the calibration: the initial hydrogen X₀ that brings L to L☉ at 4.57 Gyr, as standard solar models set their
        helium, against theirs;
     4. the history at that X₀: L(t)/L(4.57 Gyr) against BP2001's table 2, the centre's hydrogen against its §III.4
        and Pols's exhaustion age, and the present centre against BP2001 table 5, B16 table 4 and Model S.
   Plus the machinery's own checks: the energy each step's shells burnt against what the star radiated, and the step
   size (dX = 0.02, 0.01, 0.005) at 4.57 Gyr; and the clock the earlier section 3 calibrated with, the zero-age centre
   burnt at fixed ρ, T against the aged centre. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import * as SH from "../js/shell.js";
import { star, rhoOf, kappaOurs } from "../../atom/js/mainseq.js";
import { ours, MSUN, LSUN, RSUN } from "../../atom/tools/mainseq.mjs";

const DIR = path.join(process.env.TMPDIR || "/tmp", "atom4-mainseq"), P2 = new URL("../../papers/p2/data/", import.meta.url), GYR = 3.15576e16, YR = 3.15576e7;
const load = (f) => { const p = path.join(DIR, f); if (!existsSync(p)) throw new Error(`missing ${p}: run atom/tools/evolve.mjs first`); return JSON.parse(readFileSync(p, "utf8")); };
const REF = JSON.parse(readFileSync(new URL("ssm-ref.json", P2), "utf8")), MS = JSON.parse(readFileSync(new URL("modelS.json", P2), "utf8")), BP = REF.bahcall2001;
const X0 = process.argv[2] ?? "0.687", BRACKET = (process.env.BRACKET ?? "0.68,0.685,0.69").split(",");
const lerp = (rows, x, kx = 0, ky = 1) => { for (let i = 1; i < rows.length; i++) { const a = rows[i - 1], b = rows[i]; const ax = a[kx], bx = b[kx]; if ((ax - x) * (bx - x) <= 0 && ax !== bx) { const t = (x - ax) / (bx - ax); return a[ky] + (b[ky] - a[ky]) * t; } } return null; };
const atT = (tr, tg, k) => lerp(tr.map((r) => [r.tGyr, r[k]]), tg), atX = (tr, x, k) => lerp(tr.map((r) => [r.Xc, r[k]]), x);
const r3 = (x, n = 4) => (x == null ? null : +x.toPrecision(n));

// 1. the burning law on Model S's conditions
const burning = MS.prof.filter((p) => p.q <= 0.5 && p.eps > 0).map((p) => { const he4 = 1 - p.X - p.Z - p.he3, zc = p.c12 + p.c13 + p.n14 + p.o16;
  const Y = SH.fromX({ p: p.X, he3: p.he3, he4, c12: p.c12, c13: p.c13, n14: p.n14, o16: p.o16 }), e = SH.eps(p.rho * 1000, p.T, Y, { Zrest: p.Z - zc }), e0 = SH.eps(p.rho * 1000, p.T, Y, { screen: 0 });
  return { q: p.q, T: p.T, rho: p.rho, X: p.X, epsS: p.eps, eps: r3(e.eps * 1e4, 5), ratio: r3((e.eps * 1e4) / p.eps), unscreened: r3((e0.eps * 1e4) / p.eps), cnoShare: r3(e.cno / e.eps, 3) }; });
console.log(`1. burning on Model S's conditions (q ≤ 0.5): ε ours / Model S ${Math.min(...burning.map((b) => b.ratio)).toFixed(3)}–${Math.max(...burning.map((b) => b.ratio)).toFixed(3)} (unscreened ${Math.min(...burning.map((b) => b.unscreened)).toFixed(3)}–${Math.max(...burning.map((b) => b.unscreened)).toFixed(3)})`);

// 2. the structure on Model S's composition
const structure = (() => { const o = ours(), pr = MS.prof, qs = pr.map((p) => p.q), at = (m) => { const x = m / MSUN; let i = 1; while (i < qs.length - 1 && qs[i] < x) i++; return [i - 1, i, Math.max(0, Math.min(1, (x - qs[i - 1]) / (qs[i] - qs[i - 1] || 1)))]; };
  const Ys = pr.map((p) => SH.fromX({ p: p.X, he3: p.he3, he4: 1 - p.X - p.Z - p.he3, c12: p.c12, c13: p.c13, n14: p.n14, o16: p.o16 })), Zr = pr.map((p) => p.Z - p.c12 - p.c13 - p.n14 - p.o16);
  const comp = (m) => { const [a, b, t] = at(m), X = pr[a].X * (1 - t) + pr[b].X * t, Z = pr[a].Z * (1 - t) + pr[b].Z * t; return { X, Y: 1 - X - Z, Z }; };
  const eps = (rho, T, m) => { const [a, b, t] = at(m); return SH.eps(rho, T, Ys[a], { Zrest: Zr[a] }).eps * (1 - t) + SH.eps(rho, T, Ys[b], { Zrest: Zr[b] }).eps * t; };
  const s = star({ d: 3, M: MSUN, G: o.G, comp: comp(0), compAt: comp, eps, kappa: (rho, T, m) => kappaOurs(comp(m))(rho, T) }, [Math.log(2.3e16), Math.log(1.55e7), Math.log(RSUN), Math.log(LSUN)]);
  const p = s.prof, lq = (f) => { for (let i = 1; i < p.length; i++) if (p[i].L >= f * s.L) return p[i].m / MSUN; };
  const out = { ok: s.ok, L: r3(s.L / LSUN), R: r3(s.R / RSUN), Tc: r3(s.Tc / 1e6), rhoc: r3(rhoOf(3, s.Pc, s.Tc, comp(0)) / 1000), Pc: r3(s.Pc * 10), q50: r3(lq(0.5), 3), q90: r3(lq(0.9), 3),
    modelS: { L: 1, Tc: r3(MS.centre.T / 1e6), rhoc: r3(MS.centre.rho), Pc: r3(MS.centre.P), q50: MS.q50, q90: MS.q90 } };
  console.log(`2. structure on Model S's composition: L ${out.L} L☉, Tc ${out.Tc} MK (Model S ${out.modelS.Tc}), ρc ${out.rhoc} (${out.modelS.rhoc}), half the light inside q ${out.q50} (${out.modelS.q50})`); return out; })();

// 3. the calibration
const cal = BRACKET.map((x) => { const j = load(`evolve-ours-1-X${x}-to4.57.json`), r = j.track.at(-1); return { X0: +x, L457: r.L / LSUN, Xc: r.Xc, Tc: r.Tc / 1e6, rhoc: r.rhoc / 1000 }; }).sort((a, b) => a.X0 - b.X0);
const X0cal = lerp(cal.map((c) => [Math.log(c.L457), c.X0]), 0), BPX0 = 1 - BP.present.Yinit - BP.present.Zinit;
console.log(`3. calibration: L(4.57 Gyr) = L☉ at X₀ ${X0cal.toFixed(4)} (bracket ${cal.map((c) => `${c.X0}: ${c.L457.toFixed(4)}`).join(", ")}); BP2001's X_init ${BPX0.toFixed(4)}`);

// 4. the history at X₀
const full = load(`evolve-ours-1-X${X0}.json`), tr = full.track, Lnow = atT(tr, 4.57, "L"), Rnow = atT(tr, 4.57, "R");
const Lhist = BP.L.rows.filter(([t]) => t >= 0.2).map(([t, l]) => { const v = atT(tr, t, "L") / Lnow; return { t, bp: l, ours: r3(v), diff: r3(v - l, 3) }; });
const Rhist = BP.R.rows.filter(([t]) => t >= 0.2).map(([t, rr]) => ({ t, bp: rr, ours: r3(atT(tr, t, "R") / Rnow) }));
const Xhist = BP.Xc.rows.map(([t, x]) => ({ t, bp: x, ours: r3(atT(tr, t, "Xc")) }));
const tX = (x) => r3(atX(tr, x, "tGyr")), present = { L: r3(Lnow / LSUN), R: r3(Rnow / RSUN), Teff: r3(atT(tr, 4.57, "Teff")), Tc: r3(atT(tr, 4.57, "Tc") / 1e6), rhoc: r3(atT(tr, 4.57, "rhoc") / 1000), Xc: r3(atT(tr, 4.57, "Xc")), q50: r3(atT(tr, 4.57, "q50"), 3), q90: r3(atT(tr, 4.57, "q90"), 3) };
const refs = { bahcall2001: { Tc: BP.present.Tc, rhoc: BP.present.rhoc, Xc: BP.Xc.rows[1][1] }, modelS: { Tc: r3(MS.centre.T / 1e6), rhoc: r3(MS.centre.rho), Xc: r3(MS.centre.X), q50: MS.q50, q90: MS.q90 }, vinyoles2017: { Xc: r3(1 - REF.vinyoles2017.GS98.Yc - REF.vinyoles2017.GS98.Zc) } };
const bal = tr.map((r) => r.eBal).filter(Boolean), maxDev = Math.max(...Lhist.map((h) => Math.abs(h.diff))), relDev = (lo, hi) => Math.max(...Lhist.filter((h) => h.t >= lo && h.t <= hi).map((h) => Math.abs(h.ours / h.bp - 1)));
console.log(`4. at 4.57 Gyr: L ${present.L}, Tc ${present.Tc} MK (BP ${refs.bahcall2001.Tc}, Model S ${refs.modelS.Tc}), ρc ${present.rhoc} (${refs.bahcall2001.rhoc}, ${refs.modelS.rhoc}), Xc ${present.Xc} (${refs.bahcall2001.Xc}, ${refs.modelS.Xc}, B16 ${refs.vinyoles2017.Xc}); L(t)/L(now) within ${(relDev(0.2, 4.6) * 100).toFixed(1)}% of BP2001 over 0.2–4.6 Gyr, ${(relDev(4.6, 8) * 100).toFixed(1)}% by 8; Xc 0.008 at ${tX(0.008)} Gyr (BP 8), 10⁻³ at ${tX(1e-3)} Gyr (Pols ~9)`);

// the machinery: energy balance, step size
const conv = ["-dX0.02", "", "-dX0.005"].map((s) => { const f = s === "" ? null : `evolve-ours-1${s}-X${X0}-to4.57.json`, t2 = f ? load(f).track : tr; return { dX: s === "" ? 0.01 : +s.slice(3), L: r3(atT(t2, 4.57, "L") / LSUN, 5), Xc: r3(atT(t2, 4.57, "Xc"), 5), Tc: r3(atT(t2, 4.57, "Tc") / 1e6, 5), models: t2.filter((r) => r.tGyr <= 4.57).length }; });
console.log(`   steps: ${conv.map((c) => `dX ${c.dX}: L ${c.L}, Xc ${c.Xc} (${c.models} models)`).join("; ")}; burnt/radiated per step ${Math.min(...bal).toFixed(4)}–${Math.max(...bal).toFixed(4)}`);

// the clock: the zero-age centre burnt at fixed ρ, T to half its hydrogen, against the aged centre's time to half
const o = { Zrest: 0.02 - 0.0089 }, Yz = SH.fromX({ p: full.X0, he4: 1 - full.X0 - 0.02, c12: 0.0024, n14: 0.0007, o16: 0.0058 }), half = Yz[SH.I.p] / 2;
const fixedHalf = (rho, T) => { let Y = Yz, t = 0; for (let k = 0; k < 2000; k++) { const dt = 0.05 * GYR, r = SH.burn(rho, T, Y, dt, o); if (r.Y[SH.I.p] < half) { let lo = 0, hi = dt; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (SH.burn(rho, T, Y, m, o).Y[SH.I.p] > half) lo = m; else hi = m; } return (t + (lo + hi) / 2) / GYR; } Y = r.Y; t += dt; } return null; };
const z = tr[0], zs = tr.find((r) => r.tGyr >= 0.1), aged = tX(full.X0 / 2), fz = fixedHalf(z.rhoc, z.Tc), fs = fixedHalf(zs.rhoc, zs.Tc);
const clock = { agedHalfGyr: aged, fresh: { tGyr: 0, Tc: r3(z.Tc / 1e6), rhoc: r3(z.rhoc / 1000), fixedHalfGyr: r3(fz), ratio: r3(fz / aged, 3) }, settled: { tGyr: r3(zs.tGyr, 3), Tc: r3(zs.Tc / 1e6), rhoc: r3(zs.rhoc / 1000), fixedHalfGyr: r3(fs), ratio: r3(fs / aged, 3) },
  sectionThree: { fixedHalfGyr: 11.1, agedHalfGyr: 4.6, ratio: r3(11.1 / 4.6, 3), note: "section 3's convention: the book's zero-age Sun under the simple burning law (13.5 MK, 74 g/cm³), burnt by REACLIB without screening at fixed ρ, T, against the real centre's 4.6 Gyr" },
  note: "each centre's ρ, T with fresh gas (X₀, our CNO) burnt by fusion/js/shell.js at fixed ρ, T to half its hydrogen; 'fresh' is the run's first star (no ³He yet, ¹²C unburnt), 'settled' the star at 0.1 Gyr, after the ³He and ¹²C transients" };
console.log(`   clock: aged, the centre halves its hydrogen in ${aged} Gyr; at fixed ρ, T the first star's centre (${clock.fresh.Tc} MK) would take ${clock.fresh.fixedHalfGyr} (×${clock.fresh.ratio}), the settled one's at 0.1 Gyr (${clock.settled.Tc} MK) ${clock.settled.fixedHalfGyr} (×${clock.settled.ratio}); section 3 took ×${clock.sectionThree.ratio}`);

writeFileSync(new URL("evolvecheck.json", P2), JSON.stringify({ about: "fusion/tools/suncheck.mjs: our Sun aged by atom/tools/evolve.mjs (REACLIB shell burning, our textbook opacity, no diffusion or overshoot), against standard solar models (ssm-ref.json, modelS.json)",
  burning, structure, calibration: { bracket: cal.map((c) => ({ X0: c.X0, L457: r3(c.L457, 5), Xc: r3(c.Xc), Tc: r3(c.Tc), rhoc: r3(c.rhoc) })), X0: r3(X0cal, 4), bahcall2001X0: r3(BPX0, 4), runX0: +X0 },
  present, refs, history: { L: Lhist, R: Rhist, Xc: Xhist, maxLdiff: r3(maxDev, 3), relEarly: r3(relDev(0.2, 4.6), 3), relLate: r3(relDev(4.6, 8), 3), tXc008: tX(0.008), tXc001: tX(1e-3), polsXc001Gyr: REF.pols2026.Xc1e3AtGyr, stopped: full.stopped },
  machinery: { balance: [r3(Math.min(...bal), 5), r3(Math.max(...bal), 5)], steps: conv }, clock,
  track: tr.filter((_, i) => i % 3 === 0 || i === tr.length - 1).map((r) => ({ t: r3(r.tGyr, 5), L: r3(r.L / LSUN, 5), R: r3(r.R / RSUN, 5), Teff: Math.round(r.Teff), Tc: r3(r.Tc / 1e6), rhoc: r3(r.rhoc / 1000), Xc: r3(r.Xc), qcc: r3(r.qcc, 3), pp: r3(r.ppShare, 4), q50: r3(r.q50, 3) })) }, null, 1));
console.log("wrote papers/p2/data/evolvecheck.json");
