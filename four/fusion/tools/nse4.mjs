/* Where an exploding 4D core's equilibrium share ends up (papers/p2 section 4, the abundance page): nuclear statistical
   equilibrium on the trusted liquid drop, then β-decay to the stable line.
     node four/fusion/tools/nse4.mjs            → four/papers/p2/data/nse4.json
   · the drop: Minnesota at s 1.5152, b 1.4 (the network's force at our strength, the one trusted; nuclei.mjs bake),
     helium-4 at its computed binding, nucleons free; every (Z, A) to A 900 the drop binds, within A/6 of N = Z;
   · equilibrium (4D Saha, ground states): n_i = A^{d/2} 2^{−A} n_Q^{1−A} n_p^Z n_n^N e^{B/kT}, n_Q = (m_u kT/2πħ²)^{d/2},
     solved for the total density and Y_e = 0.5 (no electron captures: declared);
   · the conditions: the exploding core's density at ignition (explode's core: a core reaching its ash's ignition
     temperature, which a 4D core does only within 4 × 10⁻⁴ of the limit), over explode's expansion f = 30 and 100, and a
     declared freeze-out band 5–10 GK (the burnt shells pass equilibrium at 11–16 GK, heavy's peaks, and fall out of it as
     they cool); the share is the mean over the six, the spread over them reported;
   · the decay: each mass number to its most bound charge, M(A, Z) = −B(A, Z) − Z(m_n − m_H), m_n − m_H our 0.782 MeV
     (declared); positron decay and electron capture at fixed A; alpha decay, fission and proton emission checked
     against the drop at both ends and reported (the earlier scratch found none open near A 274).
   Ours as the check: the textbook drop's same construction puts A 56's stable end at Z 25 (iron is 26; no pairing term). */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const { NUCLEI: N } = await import(path.join(here, "../../atom/js/nucleidata.js"));
const BU = await import(path.join(here, "../../atom/js/burning.js"));
const { polytrope } = await import(path.join(here, "../../atom/js/stars.js"));

const d = 4, SI = { hbar: 1.054571817e-34, c: 2.99792458e8, me: 9.1093837015e-31, mu: 1.66053906660e-27, k: 1.380649e-23 }, KMEV = 8.617333262e-11, DM = 0.782;
const x = N.forces.MN.drops.find((q) => q.s === 1.5152 && q.b === 1.4); if (!x?.well?.trusted) throw new Error("the trusted MN s 1.5152 b 1.4 drop is missing");
const he = N.forces.MN.he.find((h) => h.d === 4 && h.A === 4 && h.s === 1.5152 && String(h.b) === "1.4"), Ba = -he.E;
const Bd = (A, Z) => x.av * A - x.as * A ** 0.75 - (x.ac * Z * (Z - 1)) / A ** 0.25 - (x.aa * (A - 2 * Z) ** 2) / A;

// the exploding core at ignition (nuclei.mjs explode's `core`), for each ash element heavy computed; f as explode
const PL = polytrope("pinned4", 2, { N: 300 });
function coreRho(m, Tign, mui) { const M = m * BU.chandraMass(d, { G: 1e-20, mue: 2 }), Mt = PL.M, Rc = Math.pow(M / (Mt * 2 * SI.mu * (SI.me * SI.c / SI.hbar) ** d), 1 / d);
  for (let i = 30; i >= -12; i -= 0.05) { const R = Rc * Math.pow(10, i / 6); if (BU.coreT(d, M, R, { G: 1e-20, mue: 2, mui }) >= Tign) return M / (Mt * R ** d); } return null; }
const ash = N.heavy.rows.filter((r) => r.Z >= 9 && r.Z <= 12), rhoIgn = ash.map((r) => coreRho(0.9999, r.T, r.A)), RHO = Math.exp(rhoIgn.reduce((t, v) => t + Math.log(v), 0) / rhoIgn.length);
const FS = [30, 100], TS = [5e9, 7e9, 10e9];

// the species and the equilibrium
const sp = [{ Z: 0, A: 1, B: 0 }, { Z: 1, A: 1, B: 0 }, { Z: 2, A: 4, B: Ba }];
for (let A = 5; A <= 900; A++) for (let Z = Math.max(1, Math.floor(A / 2 - A / 6)); Z <= Math.ceil(A / 2 + A / 6); Z++) { const B = Bd(A, Z); if (B > 0) sp.push({ Z, A, B }); }
function nse(T, rho) { const kT = KMEV * T, nQ = ((SI.mu * SI.k * T) / (2 * Math.PI * SI.hbar ** 2)) ** (d / 2), n = rho / SI.mu, lnQ = Math.log(nQ);
  const lnn = (s, a, b) => (d / 2) * Math.log(s.A) - s.A * Math.LN2 + (1 - s.A) * lnQ + s.Z * a + (s.A - s.Z) * b + s.B / kT;
  const sums = (a, b) => { let m = -Infinity; const L = sp.map((s) => { const v = lnn(s, a, b); if (v > m) m = v; return v; }); let tot = 0, prot = 0; L.forEach((v, i) => { const w = Math.exp(v - m); tot += w * sp[i].A; prot += w * sp[i].Z; }); return { lt: Math.log(tot) + m, lp: Math.log(prot) + m, L }; };
  let a = Math.log(n) - 20, b = a, st = Infinity;
  for (let it = 0; it < 300 && st > 1e-10; it++) { const s0 = sums(a, b), f1 = s0.lt - Math.log(n), f2 = s0.lp - Math.log(0.5 * n), h = 1e-4;
    const sa = sums(a + h, b), sb = sums(a, b + h), J = [[(sa.lt - s0.lt) / h, (sb.lt - s0.lt) / h], [(sa.lp - s0.lp) / h, (sb.lp - s0.lp) / h]], det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    let da = (-f1 * J[1][1] + f2 * J[0][1]) / det, db = (-f2 * J[0][0] + f1 * J[1][0]) / det; st = Math.max(Math.abs(da), Math.abs(db)); if (st > 2) { da *= 2 / st; db *= 2 / st; } a += da; b += db; }
  if (!(st <= 1e-8)) throw new Error(`NSE did not converge at ${T} K, ${rho} kg/m⁴`);
  return sums(a, b).L.map((v, i) => (Math.exp(v) * sp[i].A) / n); }

// the stable charge of each mass number, and what decays on the way
const Mx = (A, Z) => -Bd(A, Z) - Z * DM, stableZ = new Map();
const zStable = (A) => { if (stableZ.has(A)) return stableZ.get(A); let zs = 1, best = Infinity; for (let Z = 1; Z < A; Z++) { const m = Mx(A, Z); if (m < best) { best = m; zs = Z; } } stableZ.set(A, zs); return zs; };
{ const B3 = (A, Z) => 15.8 * A - 18.3 * A ** (2 / 3) - (0.714 * Z * (Z - 1)) / A ** (1 / 3) - (23.2 * (A - 2 * Z) ** 2) / A; let zs = 0, best = Infinity; for (let Z = 1; Z < 56; Z++) { const m = -B3(56, Z) - Z * DM; if (m < best) { best = m; zs = Z; } }
  // the drop has no pairing term, so the minimum falls between 25 and 26 (pairing is what picks even–even iron): held to
  // one charge
  if (Math.abs(zs - 26) > 1) throw new Error(`ours' check: A 56 stable at Z ${zs}, more than one charge from 26`); var oursA56 = zs; }

const runs = [], pre = {}, post = {}; let heavyMean = 0, decayE = 0;
const byA = {};
for (const f of FS) for (const T of TS) { const X = nse(T, RHO / f), byZ = {}, dec = {}; let light = 0, a4 = 0, heavy = 0, eDec = 0;
  X.forEach((v, i) => { const s = sp[i]; if (s.A === 1) { light += v; return; } if (s.A === 4 && s.Z === 2) { a4 += v; return; } heavy += v; byZ[s.Z] = (byZ[s.Z] ?? 0) + v; const zs = zStable(s.A); dec[zs] = (dec[zs] ?? 0) + v; eDec += (v * (Mx(s.A, s.Z) - Mx(s.A, zs))) / s.A; byA[s.A] = (byA[s.A] ?? 0) + v; });
  const norm = (o) => Object.fromEntries(Object.entries(o).map(([z, v]) => [z, v / heavy])), P = norm(byZ), Q = norm(dec);
  const band = (o) => { const zs = Object.entries(o).map(([z, v]) => [+z, v]).sort((p, q) => p[0] - q[0]); let c = 0, lo = null, hi = null; for (const [z, v] of zs) { c += v; if (lo == null && c >= 0.1) lo = z; if (hi == null && c >= 0.9) hi = z; } return [lo, hi]; };
  const mean = (o) => Object.entries(o).reduce((t, [z, v]) => t + z * v, 0);
  runs.push({ f, T, rho: +(RHO / f).toPrecision(4), light: +light.toFixed(5), helium4: +a4.toFixed(5), heavy: +heavy.toFixed(5), meanZ: +mean(P).toFixed(1), band80: band(P), afterDecay: { meanZ: +mean(Q).toFixed(1), band80: band(Q) }, decayMeVperNucleon: +(eDec / heavy).toFixed(3) });
  for (const [z, v] of Object.entries(P)) pre[z] = (pre[z] ?? 0) + v / (FS.length * TS.length); for (const [z, v] of Object.entries(Q)) post[z] = (post[z] ?? 0) + v / (FS.length * TS.length);
  console.log(`f ${f}, ${T / 1e9} GK, ρ ${(RHO / f).toExponential(2)}: nucleons ${(100 * light).toFixed(2)}%, helium-4 ${(100 * a4).toFixed(2)}%; mean Z ${mean(P).toFixed(1)}, 80% in ${band(P).join("–")}; decayed: mean Z ${mean(Q).toFixed(1)}, 80% in ${band(Q).join("–")}, ${(eDec / heavy).toFixed(2)} MeV a nucleon`); }
// what else could open, at the decayed end and at N = Z, over the masses that carry the share
// the masses that carry the share (above 10⁻⁴ of it, over the six conditions): their N = Z end and their decayed end
const tot = Object.values(byA).reduce((t, v) => t + v, 0), As = Object.entries(byA).filter(([, v]) => v / tot > 1e-4).map(([A]) => +A).sort((p, q) => p - q), open = { alpha: [], fission: [], proton: [] };
for (const A of As) for (const Z of [Math.round(A / 2), zStable(A)]) { const Zf = Math.floor(Z / 2), Af = Math.floor(A / 2);
  if (Bd(A - 4, Z - 2) + Ba - Bd(A, Z) > 0) open.alpha.push([A, Z]); if (Bd(Af, Zf) + Bd(A - Af, Z - Zf) - Bd(A, Z) > 0) open.fission.push([A, Z]); if (Bd(A, Z) - Bd(A - 1, Z - 1) < 0) open.proton.push([A, Z]); }
const massRange = [As[0], As.at(-1)];
const r6 = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v > 1e-6).map(([z, v]) => [z, +v.toFixed(6)]));
const out = { about: "fusion/tools/nse4.mjs: an exploding 4D core's equilibrium share, by element: 4D nuclear statistical equilibrium on the trusted MN s 1.5152 b 1.4 drop (Y_e 0.5, ground states, helium-4 at its computed binding) at the exploding core's ignition density over f 30 and 100 and a declared freeze-out 5–10 GK, then β-decay at fixed A to the most bound charge (m_n − m_H 0.782 MeV, ours, declared). preDecay / postDecay: mass fraction of the heavy nuclei by element, the mean over the six conditions.",
  drop: { force: "MN", s: 1.5152, b: 1.4 }, helium4: +Ba.toFixed(2), rhoIgnition: +RHO.toPrecision(4), oursA56stableZ: oursA56, f: FS, T: TS, runs, preDecay: r6(pre), postDecay: r6(post), massRange, open };
writeFileSync(path.join(here, "../../papers/p2/data/nse4.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`wrote nse4.json: ignition density ${RHO.toExponential(2)} kg/m⁴; the share in A ${massRange.join("–")}; open there (N = Z end or decayed end): alpha ${JSON.stringify(open.alpha)}, fission ${JSON.stringify(open.fission)}, proton emission ${JSON.stringify(open.proton)}`);
