/* Is the 4D liquid drop defensible? (PI, 2026-11-22: "liquid drop first, let's get somewhere defensible there"). The
   heavy end of paper 2 (equilibrium's end, the stable line, how heavy a stable nucleus gets) rests on nuclei.mjs bake's
   drops, built from computed nuclear matter with two pieces carried from ours. This builds ours the same way and
   holds it to the measured masses, then holds the 4D drop to the light nuclei the book computes directly.
     · the construction (nuclei.mjs bake, reused through its exports): a_v and ρ₀ from symmetric matter with the
       three-nucleon term (ours: the fit's c; 4D: c·πb²); r₀ from ρ₀ (the unit ball's volume); a_c = the uniform ball's
       exact Coulomb factor × e²/r₀; a_s = d·t·a_v/r₀ with t, the surface's thickness, carried from ours (our a_s 17.8 at
       ρ₀ 0.16, a_v 16); a_a = (23.7/32)(E_neutron matter(ρ₀) + a_v), ours' ratio of a_a to the symmetry energy carried.
       B = a_v A − a_s A^((d−1)/d) − a_c Z(Z−1)/A^(1/d) − a_a(A − 2Z)²/A, no pairing, no shells.
     · ours (d 3, s 1, each force) against AME2020 (mass_1.mas20, measured values only): binding per nucleon by mass, the
       most bound nucleus and the most bound N = Z one (⁶²Ni, ⁵⁶Ni measured), the stable line (the isobar of least atomic
       mass, m_n − m_H = 0.782 MeV), where alpha decay and symmetric fission first release energy along it.
     · 4D: the drop against the network's light nuclei (fusion/data4.js, the adopted ladder model, A 8–32), set beside
       ours' drop against our ladder at the same cluster counts (masscheck.json): the same two methods in both worlds.
     · how the heavy end moves with what is carried (the surface thickness ×0.7–1.3) and with the three-nucleon range b.
     · a second route: a drop fitted only to light N = Z nuclei, tested on ours (measured masses) and run on 4D's ladder.
     node four/fusion/tools/dropcheck.mjs <mass_1.mas20>   → papers/p2/data/dropcheck.json */
import { readFileSync, writeFileSync } from "node:fs";
const quiet = console.log; console.log = () => {}; const NU = await import("../../atom/tools/nuclei.mjs"); console.log = quiet; // its CLI prints a usage line on import
const { NUCLEI: N } = await import("../../atom/js/nucleidata.js"), { coulombFactor } = await import("../../atom/js/nuclear.js"), { NET4 } = await import("../data4.js");
const MC = JSON.parse(readFileSync(new URL("../../papers/p2/data/masscheck.json", import.meta.url), "utf8"));
const E2 = 1.43996, DM = 0.782, T = N.T_SURF, CF = { 3: coulombFactor(3, 300), 4: coulombFactor(4, 300) }, BALLV = { 3: (4 * Math.PI) / 3, 4: (Math.PI * Math.PI) / 2 };
const r4 = (x) => +(+x).toPrecision(4);

/* a drop by the bake's construction; tScale scales the carried surface thickness */
function build(d, f, s, b, tScale = 1) { const F = N.forces[f], c = d === 3 ? F.fit.c : F.fit.c * Math.PI * b * b;
  const sym = F.matter.find((m) => m.d === d && m.s === s && m.kind === "symmetric"), neu = F.matter.find((m) => m.d === d && m.s === s && m.kind === "neutron");
  const sat = NU.saturation(sym.rows, c), av = -sat.E, rho0 = sat.rho, r0 = Math.pow(1 / (BALLV[d] * rho0), 1 / d), ac = (CF[d] * E2) / r0, as = (d * T * tScale * av) / r0;
  const aa = (23.7 / 32) * (NU.saturation(neu.rows, c).at(rho0) + av), well = NU.wellOf(d, sym.rows, c);
  return { d, f, s, b, av, rho0, r0, ac, as, aa, S: aa * 32 / 23.7, trusted: well.trusted, edge: sat.edge }; }
const Bof = (x) => (A, Z) => (A <= 0 || Z < 0 || Z > A ? -Infinity : x.av * A - x.as * A ** ((x.d - 1) / x.d) - (x.ac * Z * (Z - 1)) / A ** (1 / x.d) - (x.aa * (A - 2 * Z) ** 2) / A);
const zStable = (B, A) => { let z = 1, best = Infinity; for (let Z = 1; Z < A; Z++) { const m = -B(A, Z) - Z * DM; if (m < best) { best = m; z = Z; } } return z; };
function heavy(x, Ba, Amax = 20000) { const B = Bof(x); let peak = { ba: 0 }, nz = { ba: 0 }, alpha = null, fission = null;
  for (let A = 40; A <= Amax; A += A < 600 ? 2 : 20) { const Z = zStable(B, A), ba = B(A, Z) / A; if (ba > peak.ba) peak = { A, Z, ba }; const bn = B(A, A / 2) / A; if (bn > nz.ba) nz = { A, Z: A / 2, ba: bn };
    if (!alpha && B(A - 4, Z - 2) + Ba - B(A, Z) > 0) alpha = { A, Z }; if (!fission && 2 * B(A / 2, Math.round(Z / 2)) - B(A, Z) > 0) fission = { A, Z }; }
  return { peak: { A: peak.A, Z: peak.Z, ba: r4(peak.ba) }, nz: { A: nz.A, Z: nz.Z, ba: r4(nz.ba), stableZ: zStable(B, nz.A) }, alpha, fission }; }

// AME2020: fixed columns (a1,i3,i5,i5,i5,1x,a3,a4,1x,f14.6,f12.6,f13.5,…); '#' marks an estimate, left out
const ame = []; for (const line of readFileSync(process.argv[2], "utf8").split("\n")) { if (line.length < 80 || !/^[ 0]/.test(line)) continue;
  const N_ = +line.slice(4, 9), Z = +line.slice(9, 14), A = +line.slice(14, 19), dm = line.slice(28, 42), ba = line.slice(54, 67); if (!(A > 0) || !Number.isFinite(Z) || /#/.test(dm + ba) || !/\d/.test(ba)) continue;
  ame.push({ Z, N: N_, A, ex: +dm / 1000, B: (+ba / 1000) * A }); }
const AM = new Map(ame.map((r) => [`${r.Z}-${r.A}`, r])), get = (Z, A) => AM.get(`${Z}-${A}`);
for (const [Z, A, ba] of [[26, 56, 8.790354], [28, 62, 8.794553], [82, 208, 7.867452]]) if (Math.abs(get(Z, A).B / A - ba) > 2e-5) throw new Error(`dropcheck: AME misread at ${Z}-${A}`);
// measured: the most bound, the most bound N = Z, the stable line, alpha and fission thresholds along it
const real = (() => { let peak = { ba: 0 }, nz = { ba: 0 }; for (const r of ame) { if (r.A < 12) continue; const ba = r.B / r.A; if (ba > peak.ba) peak = { A: r.A, Z: r.Z, ba }; if (r.Z === r.N && ba > nz.ba) nz = { A: r.A, Z: r.Z, ba }; }
  const line = {}; for (const r of ame) if (!line[r.A] || r.ex < line[r.A].ex) line[r.A] = r; const Ba = get(2, 4).B; let alpha = null, fission = null;
  for (let A = 40; A <= 250; A += 2) { const r = line[A]; if (!r) continue; const d = get(r.Z - 2, A - 4); if (!alpha && d && d.B + Ba - r.B > 0) alpha = { A, Z: r.Z };
    const h = get(r.Z / 2, A / 2), h1 = get((r.Z - 1) / 2, (A - 2) / 2) ?? null; if (!fission && r.Z % 2 === 0 && h && 2 * h.B - r.B > 0) fission = { A, Z: r.Z }; }
  return { peak: { ...peak, ba: r4(peak.ba) }, nz: { ...nz, ba: r4(nz.ba) }, alpha, fission, line }; })();
const textbook = { d: 3, av: 15.8, as: 18.3, ac: 0.714, aa: 23.2 };

// ours by the construction, each force
const oursDrops = ["MT", "MN"].map((f) => build(3, f, 1, null)), Ba3 = get(2, 4).B;
const oursCheck = [...oursDrops, { ...textbook, f: "textbook" }].map((x) => { const B = Bof(x), h = heavy(x, Ba3, 400);
  const errs = ame.filter((r) => r.A >= 40).map((r) => B(r.A, r.Z) / r.A - r.B / r.A), rms = Math.sqrt(errs.reduce((t, e) => t + e * e, 0) / errs.length);
  const light = [[2, 4], [6, 12], [8, 16], [10, 20], [12, 24], [14, 28], [16, 32]].map(([Z, A]) => ({ A, Z, real: r4(get(Z, A).B), drop: r4(B(A, Z)), relErr: r4(B(A, Z) / get(Z, A).B - 1) }));
  const lineOff = [40, 60, 80, 100, 120, 160, 200, 240].map((A) => ({ A, real: real.line[A]?.Z ?? null, drop: zStable(B, A) }));
  return { force: x.f, coeff: x.f === "textbook" ? textbook : { av: r4(x.av), rho0: r4(x.rho0), r0: r4(x.r0), as: r4(x.as), ac: r4(x.ac), aa: r4(x.aa), S: r4(x.S) }, rmsPerNucleonA40: r4(rms), light, stableLine: lineOff, ...h }; });

// 4D: every drop the bake makes, its heavy end; the trusted ones also with the surface thickness scaled
const fourDrops = []; for (const f of ["MT", "MN"]) for (const s of NU.FORCES[f].s4) for (const b of NU.B_RANGE) { const sym = N.forces[f].matter.find((m) => m.d === 4 && m.s === s && m.kind === "symmetric"); if (!sym) continue; fourDrops.push(build(4, f, s, b)); }
// the construction reproduces the baked drops (the same code, through its exports)
for (const x of fourDrops) { const y = N.forces[x.f].drops.find((q) => q.s === x.s && q.b === x.b); if (!y || Math.abs(y.as / x.as - 1) > 1e-9 || Math.abs(y.av / x.av - 1) > 1e-9 || Math.abs(y.aa / x.aa - 1) > 1e-9 || Math.abs(y.ac / x.ac - 1) > 1e-6) throw new Error(`dropcheck: ${x.f} s ${x.s} b ${x.b} doesn't reproduce the bake`); }
const he4 = (f, s, b) => -(N.forces[f].he.find((h) => h.d === 4 && h.A === 4 && h.s === s && String(h.b) === String(b))?.E ?? NaN);
const four = fourDrops.map((x) => { const Ba = he4(x.f, x.s, x.b); return { force: x.f, s: x.s, b: x.b, trusted: x.trusted, edge: x.edge, coeff: { av: r4(x.av), as: r4(x.as), ac: r4(x.ac), aa: r4(x.aa), S: r4(x.S) }, Ba: r4(Ba),
  heavy: heavy(x, Ba), surface: [0.7, 0.85, 1.15, 1.3].map((t) => { const y = build(4, x.f, x.s, x.b, t), h = heavy(y, Ba); return { t, nz: h.nz, peak: h.peak, fission: h.fission }; }) }; });

// the overlap: the drop against the network's light nuclei at s 1.5152 (Minnesota, the network's force), and ours' drop
// against our ladder at the same cluster counts. The ladder underbinds clusters in ours (masscheck), so the fair comparison
// is drop / ladder in both worlds.
const net = NET4["1.5152"].species, mn = fourDrops.find((x) => x.f === "MN" && x.s === 1.5152 && x.b === 1.4), B4 = Bof(mn);
const overlap4 = net.filter((n) => n.A >= 8 && n.Z === n.N && n.A % 4 === 0).map((n) => ({ A: n.A, Z: n.Z, ladder: r4(n.B), drop: r4(B4(n.A, n.Z)), ratio: r4(B4(n.A, n.Z) / n.B), how: n.how }));
const mnOurs = oursDrops.find((x) => x.f === "MN"), B3 = Bof(mnOurs), Ba3r = get(2, 4).B;
const overlap3 = MC.clusters.map((c) => { const A = 4 * c.k, Z = 2 * c.k, ladder = c.k * Ba3r - c.ladder, realB = c.k * Ba3r - c.real; return { A, Z, real: r4(realB), ladder: r4(ladder), drop: r4(B3(A, Z)), ratioLadder: r4(B3(A, Z) / ladder), ratioReal: r4(B3(A, Z) / realB) }; });

// a second route: a drop fitted only to light N = Z nuclei (a_v, a_s by least squares; a_c from the uniform ball; N = Z,
// so a_a drops out), then its N = Z peak. Ours fitted to measured masses is the test of the route; 4D on the network's
// ladder nuclei at s 1.5152 (the adopted mass model), several fit windows since those are far from saturation.
function lightFit(pts, d, ac) { let s11 = 0, s12 = 0, s22 = 0, b1 = 0, b2 = 0; for (const [A, Z, B] of pts) { const x1 = A, x2 = -(A ** ((d - 1) / d)), y = B + (ac * Z * (Z - 1)) / A ** (1 / d); s11 += x1 * x1; s12 += x1 * x2; s22 += x2 * x2; b1 += x1 * y; b2 += x2 * y; }
  const det = s11 * s22 - s12 * s12, av = (b1 * s22 - b2 * s12) / det, as = (s11 * b2 - s12 * b1) / det; let pk = { ba: -Infinity };
  for (let A = 8; A <= 4000; A += 2) { const Z = A / 2, ba = av - as * A ** (-1 / d) - (ac * Z * (Z - 1)) / A ** (1 / d) / A; if (ba > pk.ba) pk = { A, ba }; } return { av: r4(av), as: r4(as), ac: r4(ac), peakA: pk.A, peakBa: r4(pk.ba) }; }
const lightOurs = [[12, 32], [12, 40], [16, 40]].flatMap(([lo, hi]) => { const pts = []; for (let A = lo; A <= hi; A += 4) { const r = get(A / 2, A); if (r) pts.push([A, A / 2, r.B]); } return [0.714, mnOurs.ac, oursDrops[0].ac].map((ac) => ({ window: [lo, hi], ...lightFit(pts, 3, ac) })); });
const lad = net.filter((n) => n.Z === n.N && n.A % 4 === 0 && n.A >= 12), lightFour = [[12, 32], [16, 32], [20, 32]].map(([lo, hi]) => ({ window: [lo, hi], ...lightFit(lad.filter((n) => n.A >= lo && n.A <= hi).map((n) => [n.A, n.Z, n.B]), 4, mn.ac) }));
const out = { about: "fusion/tools/dropcheck.mjs: the liquid drop of nuclei.mjs bake, built the same way for ours and held to AME2020; the 4D drops' heavy end, with the carried surface thickness scaled ×0.7–1.3; the trusted 4D drop against the network's light nuclei beside ours' drop against our ladder. Energies in MeV.",
  real: { peak: real.peak, nz: real.nz, alpha: real.alpha, fission: real.fission }, ours: oursCheck, four, overlap: { four: overlap4, ours: overlap3 }, lightFit: { ours: lightOurs, four: lightFour, fourLadderPerNucleon: lad.map((n) => [n.A, r4(n.B / n.A)]) } };
writeFileSync(new URL("../../papers/p2/data/dropcheck.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(`AME2020: ${ame.length} measured; most bound ${real.peak.Z}-${real.peak.A} ${real.peak.ba}, N = Z ${real.nz.Z}-${real.nz.A} ${real.nz.ba}; alpha opens ${JSON.stringify(real.alpha)}, fission ${JSON.stringify(real.fission)}`);
for (const o of oursCheck) console.log(`ours ${o.force}: ${JSON.stringify(o.coeff)}; rms ${o.rmsPerNucleonA40} MeV/n (A ≥ 40); most bound ${o.peak.Z}-${o.peak.A} ${o.peak.ba}; N = Z ${o.nz.Z}-${o.nz.A} ${o.nz.ba}; alpha ${JSON.stringify(o.alpha)}, fission ${JSON.stringify(o.fission)}; line ${o.stableLine.map((l) => `${l.A}:${l.real}/${l.drop}`).join(" ")}; light ${o.light.map((l) => `${l.A}:${(100 * l.relErr).toFixed(0)}%`).join(" ")}`);
for (const x of four) console.log(`4D ${x.force} s ${x.s} b ${x.b}${x.trusted ? " (trusted)" : ""}${x.edge ? " (edge)" : ""}: S ${x.coeff.S}; N = Z peak ${x.heavy.nz.Z}-${x.heavy.nz.A} → stable Z ${x.heavy.nz.stableZ}; most bound ${x.heavy.peak.Z}-${x.heavy.peak.A}; fission ${JSON.stringify(x.heavy.fission)}; surface ×0.7/1.3: N = Z peak A ${x.surface[0].nz.A}/${x.surface[3].nz.A}`);
console.log("overlap 4D (A: drop/ladder):", overlap4.map((o) => `${o.A}:${o.ratio}`).join(" ")); console.log("light fit, ours (window, a_c: N = Z peak A):", lightOurs.map((l) => `${l.window.join("–")} ${l.ac}: ${l.peakA}`).join("; "), "| real ⁵⁶Ni"); console.log("light fit, 4D:", lightFour.map((l) => `${l.window.join("–")}: a_v ${l.av} a_s ${l.as} → ${l.peakA} (${l.peakBa} MeV/n)`).join("; "));
console.log("overlap ours (A: drop/ladder, drop/real):", overlap3.map((o) => `${o.A}:${o.ratioLadder}/${o.ratioReal}`).join(" "));
