/* The main sequence in our world and in 4D (js/mainseq.js), and what a planet round each star sees.
     node four/atom/tools/mainseq.mjs ours                  ours as the check: zero-age stars 0.5–30 M☉ (minutes)
     node four/atom/tools/mainseq.mjs run <G> <rnp> [ff]    4D at G × ours, proton + proton's nuclear size rnp fm, free–free
                                                            × ff (1 classical, 0.5–2 the band; 0 scattering alone): from the
                                                            Chandrasekhar mass down to 0.13 and up to 5 of it (on the runner)
     node four/atom/tools/mainseq.mjs net <G> <s> [mass] [ff]  4D with the reaction network's own burning (fusion/eps4.json:
                                                            fusion/tools/eps4.mjs, mass model ladder|grid), each star's
                                                            core half-life t½ at its central T and ρ (on the runner)
     node four/atom/tools/mainseq.mjs bake                  → js/mainseqdata.js
   Energy, from the book's own rates, as absolute rates per pair: ⟨σv⟩ = S̃ c (ħc)^(d−1) I / (2 μ² (kT)²) in 4D (and
   the 3D form for ours), S̃ = σ k^(d−1) e^G the nuclear factor and I = ∫ e^(−E/kT − G) dE the barrier integral (stars.js).
   Ours: proton + proton (4.01 × 10⁻²² keV b, 13.1 MeV a reaction to the gas) and the carbon–nitrogen–oxygen cycle at
   nitrogen-14's pace (1.6 keV b, 25 MeV a cycle; Z = 0.02, CNO 0.014). 4D: proton + proton the same nuclear factor (the
   stated choice), half a helium-4's binding a reaction; helium-4 + helium-4 from the first capture's table (Minnesota,
   at the strength s), each pair worth the climb to the ash (mass 20 at 17 MeV a nucleon, less two helium-4s and the
   positrons). Primordial gas: X = 0.75, Y = 0.25 (the network barely notices Y). Cache $TMPDIR/atom4-mainseq. */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { star, toPinned, nextPinned, teff, convectiveCore, SI, kappaOurs, kappaLens4, kappaFF4, aRad, rhoOf } from "../js/mainseq.js";
import { gamow, logRate, KB_MEV } from "../js/stars.js";
import * as BU from "../js/burning.js";
import { radiusFor } from "../js/orbits.js";

const DIR = path.join(process.env.TMPDIR || os.tmpdir(), "atom4-mainseq"); mkdirSync(DIR, { recursive: true });
const here = path.dirname(new URL(import.meta.url).pathname), [cmd, ...args] = process.argv.slice(2);
const save = (f, o) => { writeFileSync(path.join(DIR, f), JSON.stringify(o)); console.log(`wrote ${f}`); }, load = (f) => (existsSync(path.join(DIR, f)) ? JSON.parse(readFileSync(path.join(DIR, f), "utf8")) : null);
const AMU = 931.494, HBC = 197.327, AL = 1 / 137.035999, G0 = 6.6743e-11, MSUN = 1.989e30, LSUN = 3.828e26, RSUN = 6.957e8;
const op = (d, Z1, A1, Z2, A2, r0) => ({ Z1, Z2, mu: ((A1 * A2) / (A1 + A2)) * AMU, rn: r0 * (Math.pow(A1, 1 / d) + Math.pow(A2, 1 / d)), d });
const St3 = (S, E, o) => { const eta = o.Z1 * o.Z2 * AL * Math.sqrt(o.mu / (2 * E)), k2 = (2 * o.mu * E) / HBC ** 2; return ((S / 1000) * 100 / E) * Math.exp(-2 * Math.PI * eta) * k2 * Math.exp(gamow(E, o)); };
// ⟨σv⟩ in m^d/s, tabulated over ln T (1–1000 MK)
function rate(d, o, St) { const v = Array.from({ length: 91 }, (_, i) => { const T = 1e6 * Math.pow(10, i / 30), kT = KB_MEV * T, pre = d === 3 ? St(T) * SI.c * HBC ** 2 * 1e-30 * Math.sqrt(2 / Math.PI) * o.mu ** -1.5 * kT ** -1.5 : (St(T) * SI.c * HBC ** 3 * 1e-45) / (2 * o.mu ** 2 * kT ** 2); return Math.log(pre) + logRate(T, o); });
  return (T) => { const x = Math.log10(T / 1e6) * 30, i = Math.max(0, Math.min(89, Math.floor(x))), f = x - i; return Math.exp(v[i] * (1 - f) + v[i + 1] * f); }; }
const SPP = St3(4.01e-22, 0.01, op(3, 1, 1, 1, 1, 1.2)), NUC = cmd === "run" ? (await import("../js/nucleidata.js")).NUCLEI : null;

function ours() {
  const comp = { X: 0.7, Y: 0.28, Z: 0.02 }, pp = op(3, 1, 1, 1, 1, 1.2), n14 = op(3, 1, 1, 7, 14, 1.2), svpp = rate(3, pp, () => SPP), svN = rate(3, n14, () => St3(1.6, 0.03, n14));
  const eps = (rho, T) => { const np = (rho * comp.X) / SI.mu, nN = (rho * 0.014) / (14 * SI.mu); return (((np * np * svpp(T)) / 2) * 13.1 + nN * np * svN(T) * 25.0) * SI.MeV / rho; };
  return { d: 3, G: G0, comp, eps, kappa: kappaOurs(comp) };
}
function four(Grel, rnp, s = 1.5152, ff = 1) {
  const N = NUC;
  const cap = N.forces.MN.capture.rows.find((r) => r.s === s), Ba = -N.forces.MN.he.find((h) => h.d === 4 && h.A === 4 && h.s === s && String(h.b) === "1.4").E;
  const oaa = { Z1: 2, Z2: 2, mu: 2 * AMU, rn: 2 * Math.pow(4, 0.25), d: 4 }, pp4 = { ...op(4, 1, 1, 1, 1, 1.0), rn: rnp };
  const peak = (T, o) => { const kT = KB_MEV * T; let best = 0, bv = -Infinity; for (let E = kT / 4; E < 80 * kT; E *= 1.02) { const v = -E / kT - gamow(E, o); if (v > bv) { bv = v; best = E; } } return best; };
  const interp = (Es, sv, E) => { let i = 0; while (i < Es.length - 2 && Es[i + 1] < E) i++; const f = Math.log(E / Es[i]) / Math.log(Es[i + 1] / Es[i]); return Math.exp(Math.log(sv[i]) * (1 - f) + Math.log(sv[i + 1]) * f); };
  const Saa = (T) => { const E = peak(T, oaa), k = Math.sqrt((2 * oaa.mu * E) / HBC ** 2), v = (HBC * k) / oaa.mu; return (interp(cap.table.E, cap.table.aa, E) / v) * k ** 3 * Math.exp(gamow(E, oaa)); };
  const svpp = rate(4, pp4, () => SPP), svaa = rate(4, oaa, Saa), Qpp = Ba / 2 - 0.5, Qaa = 20 * 17 - 2 * Ba - 6 * 2.8, comp = { X: 0.75, Y: 0.25, Z: 0 };
  const eps = (rho, T) => { const np = (rho * comp.X) / SI.mu, na = (rho * comp.Y) / (4 * SI.mu); return (((np * np * svpp(T)) / 2) * Qpp + ((na * na * svaa(T)) / 2) * Qaa) * SI.MeV / rho; };
  return { d: 4, G: G0 * Grel, comp, eps, kappa: ff > 0 ? kappaFF4(comp, ff) : kappaLens4(comp), ff, Mch: BU.chandraMass(4, { G: G0 * Grel, mue: 2 }), Qpp, Qaa };
}
/* 4D with the network's burning (paper 2's window C): ε̄(T, ρ) and t½(T, ρ) from fusion/eps4.json, bilinear in ln T and
   ln ρ (ε̄ zero below the table's 1 MK, extrapolated in the logs past its edges), the primordial gas the network burns */
const EPS4 = existsSync(path.join(here, "../../fusion/eps4.json")) ? JSON.parse(readFileSync(path.join(here, "../../fusion/eps4.json"), "utf8")) : null;
function lookup(tab, key, T, rho) {
  const lT = tab.T.map(Math.log), lR = tab.rho.map(Math.log), x = Math.log(T), y = Math.log(rho), at = (i, j) => { const v = tab.grid[i][j][key]; return v == null || !(v > 0) ? null : Math.log(v); };
  const idx = (g, v) => { let i = 0; while (i < g.length - 2 && g[i + 1] < v) i++; return [i, (v - g[i]) / (g[i + 1] - g[i])]; };
  const [i, u] = idx(lT, x), [j, w] = idx(lR, y), c = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)];
  if (c.some((v) => v == null)) { if (key === "th") return Infinity; for (let q = 0; q < 4; q++) if (c[q] == null) c[q] = Math.log(1e-300); } // a core that never halved; a cell that never burnt
  return Math.exp(c[0] * (1 - u) * (1 - w) + c[1] * u * (1 - w) + c[2] * (1 - u) * w + c[3] * u * w);
}
function fourNet(Grel, s, mass = "ladder", ff = 1) {
  if (!EPS4) throw new Error("no fusion/eps4.json: run node four/fusion/tools/eps4.mjs");
  const tab = EPS4.models[mass]?.[s]; if (!tab) throw new Error(`eps4.json has no ${mass} model at s = ${s}`);
  const T0 = EPS4.T, R0 = EPS4.rho, t = { T: T0, rho: R0, grid: tab.grid }, comp = { X: 0.75, Y: 0.25, Z: 0 };
  const eps = (rho, T) => (T < T0[0] || !(rho > 0) ? 0 : lookup(t, "eps", T, rho)), th = (rho, T) => lookup(t, "th", T, rho);
  return { d: 4, G: G0 * Grel, comp, eps, th, kappa: ff > 0 ? kappaFF4(comp, ff) : kappaLens4(comp), ff, Mch: BU.chandraMass(4, { G: G0 * Grel, mue: 2 }), mass, s };
}
// the first star: for each size and concentration factor, the core temperature at which burning meets what light can
// carry (a diffusion estimate), then Newton from there
function firstStar(o, M) {
  const mu = 1 / (2 * o.comp.X + 0.75 * o.comp.Y), tries = [];
  for (const cR of [0.5, 0.25, 1, 0.12]) for (const cc of [10, 30, 3]) {
    const at = (Tc) => { const R = (cR * o.G * M * mu * SI.mu) / (SI.k * Tc), rhoc = (cc * M) / ((Math.PI ** 2 / 2) * R ** 4); return { R, rhoc, Ld: 2 * Math.PI ** 2 * R ** 2 * (SI.c / (4 * o.kappa(rhoc, Tc) * rhoc)) * aRad(4) * Tc ** 5 * 0.1, Le: o.eps(rhoc, Tc) * M * 0.3 }; };
    let lo = 2e6, hi = 5e9; if (!(at(hi).Le > at(hi).Ld)) continue; for (let i = 0; i < 60; i++) { const m = Math.sqrt(lo * hi); if (at(m).Le < at(m).Ld) lo = m; else hi = m; }
    const Tc = Math.sqrt(lo * hi), q = at(Tc); tries.push([Math.log((q.rhoc * SI.k * Tc) / (mu * SI.mu)), Math.log(Tc), Math.log(q.R), Math.log(q.Ld)]); }
  for (const g of tries) for (const dT of [0, -0.2, 0.2]) { const s = star({ ...o, M }, [g[0], g[1] + dT, g[2], g[3]]); if (s.ok) return s; }
  return null;
}
const row = (o, m, M, s) => { const r = { m, M, L: s.L, R: s.R, Tc: s.Tc, Pc: s.Pc, Teff: teff(o.d, s), qcc: convectiveCore(o.d, s), dL: s.dL ?? null };
  if (o.th) { r.rhoc = rhoOf(o.d, s.Pc, s.Tc, o.comp); const t = o.th(r.rhoc, s.Tc); r.th = Number.isFinite(t) ? t : null; } return r; };

if (cmd === "ours") {
  const o = ours(), rows = [], walk = (m0, m1) => { let hist = [], m = m0, p = [Math.log(2.3e16), Math.log(1.4e7), Math.log(0.9 * RSUN), Math.log(0.7 * LSUN)];
    while ((m1 - m) * Math.sign(m1 - m0) >= -1e-9) { let g = p; if (hist.length >= 2) { const [a, b] = hist.slice(-2), t = Math.log(m / b.m) / Math.log(b.m / a.m); g = b.p.map((v, i) => v + t * (v - a.p[i])); }
      const s = star({ ...o, M: m * MSUN }, g); if (!s.ok) break; rows.push(row(o, m, m * MSUN, s)); hist.push({ m, p: s.p }); p = s.p;
      console.log(`${m.toFixed(2)} M☉: L ${(s.L / LSUN).toPrecision(3)} L☉, R ${(s.R / RSUN).toPrecision(3)} R☉, Tc ${(s.Tc / 1e6).toFixed(1)} MK`); m = m0 < m1 ? m * 1.12 : m / 1.12; } };
  walk(1, 30); walk(1 / 1.12, 0.45); save("ours.json", rows.sort((a, b) => a.m - b.m));
} else if (cmd === "run" || cmd === "net") {
  const net = cmd === "net", Grel = +args[0], rnp = net ? null : +args[1], ff = args[net ? 3 : 2] !== undefined ? +args[net ? 3 : 2] : 1, s = net ? +args[1] : args[3] ? +args[3] : 1.5152;
  const o = net ? fourNet(Grel, s, args[2] ?? "ladder", ff) : four(Grel, rnp, s, ff), rows = [];
  const file = net ? `net-${args[0]}-${args[1]}-${o.mass}-ff${ff}.json` : `run-${args[0]}-${args[1]}-ff${args[2] ?? 1}${args[3] ? "-" + args[3] : ""}.json`;
  const a = firstStar(o, o.Mch), s0 = a && toPinned({ ...o, M: o.Mch }, a);
  if (!s0 || !s0.ok) { save(file, { Grel, rnp, s, ff, ...(net ? { mass: o.mass, net: true } : {}), rows, fail: s0?.why ?? "no first star" }); process.exit(0); }
  rows.push(row(o, 1, o.Mch, s0)); console.log(`1 M_Ch: L ${s0.L.toExponential(3)} W, Tc ${(s0.Tc / 1e6).toFixed(2)} MK, Teff ${teff(4, s0).toFixed(0)} K${net ? `, core t½ ${(rows[0].th / 3.156e16).toPrecision(3)} Gyr` : ""}`);
  // walk down and up from M_Ch; where a step fails, try smaller ones (up to three halvings of the step in ln M), keeping
  // only the target masses in the table
  for (const ms of [[0.8, 0.63, 0.5, 0.4, 0.32, 0.25, 0.2, 0.16, 0.13], [1.25, 1.6, 2, 2.5, 3.2, 4, 5]]) {
    let hist = [{ m: 1, p: s0.p }], fq = (q) => s0.f(q * o.Mch), stop = false;
    const step = (m) => { const M = m * o.Mch, [x, y] = hist.length >= 2 ? hist.slice(-2) : [null, hist[0]], t = x ? Math.log(m / y.m) / Math.log(y.m / x.m) : 0;
      const st = nextPinned({ ...o, M }, x ? y.p.map((v, i) => v + t * (v - x.p[i])) : y.p, fq); if (!st.ok) return st;
      hist.push({ m, p: st.p }); const fp = st.f; fq = (q) => fp(q * M); return st; };
    const reach = (m, depth) => { const st = step(m); if (st.ok || depth >= 3) return st; const prev = hist.at(-1).m, mid = Math.sqrt(prev * m), a = reach(mid, depth + 1); return a.ok ? reach(m, depth + 1) : a; };
    for (const m of ms) { if (stop) break; const st = reach(m, 0); if (!st.ok) { console.log(`${m} M_Ch: stopped (${st.why})`); stop = true; break; }
      rows.push(row(o, m, m * o.Mch, st)); console.log(`${m} M_Ch: L ${st.L.toExponential(3)} W, R ${st.R.toExponential(3)} m, Tc ${(st.Tc / 1e6).toFixed(2)} MK, Teff ${teff(4, st).toFixed(0)} K${net ? `, core t½ ${(rows.at(-1).th / 3.156e16).toPrecision(3)} Gyr` : ""}`); } }
  save(file, { Grel, rnp, s, ff, ...(net ? { mass: o.mass, net: true } : {}), Mch: o.Mch, Qpp: o.Qpp, Qaa: o.Qaa, rows: rows.sort((p, q) => p.m - q.m) });
} else if (cmd === "bake") {
  // each star's life (a tenth of its mass burnt at 17 MeV a nucleon in 4D, the ash's binding; ours 6.7, to helium),
  // where a black, airless planet sits at 288 K (orbits.js radiusFor), and its year there (v² = G M/a, both worlds)
  const E4 = (0.1 * 17 * SI.MeV) / SI.mu, E3 = (0.1 * 0.7 * 6.7 * SI.MeV) / SI.mu, YR = 3.156e7;
  const add = (d, G, r) => { const a = r.R * radiusFor(d, r.Teff, 288), P = 2 * Math.PI * Math.sqrt(a ** 3 / (G * r.M)); return { ...r, life: ((d === 4 ? E4 : E3) * r.M) / r.L / YR, a288: a, year: P / YR }; };
  const o = load("ours.json") ?? [], runs = readdirSync(DIR).filter((f) => /^run-/.test(f)).map(load).filter((x) => x && x.rows?.length);
  const out = { ours: o.map((r) => add(3, G0, r)), runs: runs.map((x) => ({ Grel: x.Grel, rnp: x.rnp, s: x.s, ff: x.ff ?? 0, Mch: x.Mch, fail: x.fail ?? null, rows: x.rows.map((r) => add(4, G0 * x.Grel, r)) })).sort((a, b) => b.Grel - a.Grel || a.rnp - b.rnp || a.ff - b.ff) };
  writeFileSync(path.join(here, "../js/mainseqdata.js"), `// generated by four/atom/tools/mainseq.mjs bake — the main sequence, ours and 4D (js/mainseq.js)\nexport const MAINSEQ = ${JSON.stringify(out)};\n`);
  console.log(`baked: ours ${out.ours.length} stars; 4D ${out.runs.map((r) => `G ${r.Grel} p–p ${r.rnp} fm ff ${r.ff}: ${r.rows.length}`).join(", ")}`);
} else console.log("commands: ours | run <G> <rnp> [s] | net <G> <s> [mass] [ff] | bake");
