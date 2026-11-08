/* Paper 1's reference for joining and separating atoms: the atomic energies the molecular codes stand on, and a check
   that a stretched bond comes apart into exactly those atoms.
     node four/atom/tools/separate.mjs atoms <D>            each light atom by every method: numerical Hartree–Fock
                                                            (js/hf.js, extrapolated), local exchange (the table), and the
                                                            Gaussian code (js/gauss.js UHF and UMP2, cores frozen) in the
                                                            molecular basis (census.mjs basisFor, "d"); the basis error
     node four/atom/tools/separate.mjs stretch <D> <Z> [R,R,…]   a homonuclear pair at each R, started from the bare nuclei
                                                            and from the two atoms with spins parallel and antiparallel,
                                                            the lowest kept; against two atoms in the pair's whole basis
                                                            (counterpoise): the interaction, each atom's Mulliken charge
                                                            and spin, and in 4D the far form −3Q²/64R⁵ (Q from the
                                                            numerical Hartree–Fock atom), which Hartree–Fock must follow
   One JSON line per atom or point. */
import * as G from "../js/gauss.js";
import { hfAtom } from "../js/hf.js";
import { subshells } from "../js/atom.js";
import { TABLE } from "../js/tablec.js";
import { basisFor } from "./census.mjs";

const HA = 27.211386245988, [mode, dS, zS, rS] = process.argv.slice(2), D = +dS, PLUS = "d";
const occOf = (Z) => { const sh = subshells(D), o = sh.map(() => 0); for (const t of TABLE[D][Z - 1].config.split(" ")) { const m = t.match(/^(\d+[a-z])(\d+)$/); o[sh.findIndex((s) => s.name === m[1])] = +m[2]; } return { sh, o }; };
/* Hund's spins for the table's configuration: each open subshell's unpaired electrons */
const spins = (Z) => { const { sh, o } = occOf(Z); const u = sh.reduce((t, s, i) => t + Math.min(o[i], s.cap - o[i]), 0); return [(Z + u) / 2, (Z - u) / 2]; };
/* the numerical Hartree–Fock atom: energy extrapolated from h = 0.02 and 0.01, and Q = Σ⟨r²⟩ */
function numericalHF(Z) {
  const { sh, o } = occOf(Z), occ = sh.map((s, i) => ({ n: +s.name.match(/^\d+/)[0], l: s.l, q: o[i] })).filter((x) => x.q > 0);
  const a = hfAtom(D, Z, occ, { grid: { h: 0.02 } }), b = hfAtom(D, Z, occ, { grid: { h: 0.01 } });
  const Q = b.subshells.reduce((t, x) => { let s = 0; for (let j = 0; j < b.S.N; j++) s += x.z[j] ** 2 * b.S.h * b.S.r[j] ** 2; return t + x.q * s; }, 0);
  return { E: (4 * b.E - a.E) / 3, Q, converged: a.converged && b.converged };
}
const frozenOf = (Z) => (Z > 2 ? 1 : 0); // the 1s pair, for the light atoms here
const shellsOf = (atoms, Z) => atoms.flatMap((a, k) => G.shellsFor(a, basisFor(Z, D, PLUS)).map((s) => ({ ...s, atom: k })));

if (mode === "atoms") {
  for (const Z of (zS ? zS.split("/").map(Number) : D === 3 ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])) {
    const t0 = Date.now(), A = { Z, at: Array(D).fill(0) }, sh = shellsOf([A], Z), one = G.oneElectron(sh, [A], D), ERI = G.twoElectron(sh, D, one.F), [na, nb] = spins(Z);
    const u = G.hartreeFock([A], sh, D, { nAlpha: na, nBeta: nb, ints: { one, ERI } }), c = Z > 1 ? G.ump2(u, ERI, { frozen: frozenOf(Z) }) : { E2: 0 }, h = numericalHF(Z);
    console.log(JSON.stringify({ D, Z, config: TABLE[D][Z - 1].config, twoS: na - nb, E_lda: +TABLE[D][Z - 1].E.toFixed(6), E_hf: +h.E.toFixed(6), Q_hf: +h.Q.toFixed(4), E_uhf: +u.E.toFixed(6), E_ump2: +(u.E + c.E2).toFixed(6),
      basisError_mHa: +((u.E - h.E) * 1000).toFixed(3), functions: one.n, converged: u.converged && h.converged, s: (Date.now() - t0) / 1000 }));
  }
}

if (mode === "stretch") {
  const Z = +zS, Rs = (rS || "6,8,10,12,16").split(",").map(Number), [na, nb] = spins(Z), h = D === 4 ? numericalHF(Z) : null;
  for (const R of Rs) {
    const t0 = Date.now(), z = Array(D).fill(0), A = { Z, at: z }, B = { Z, at: [R, ...z.slice(1)] }, sh = shellsOf([A, B], Z), one = G.oneElectron(sh, [A, B], D), ERI = G.twoElectron(sh, D, one.F);
    const atom = (X) => G.hartreeFock([X], sh, D, { nAlpha: na, nBeta: nb, ints: { one: G.oneElectron(sh, [X], D), ERI } }), a = atom(A), b = atom(B);
    const ca = Z > 1 ? G.ump2(a, ERI, { frozen: frozenOf(Z) }).E2 : 0, guess = (anti) => ({ Pa: Float64Array.from(a.Pa, (v, k) => v + (anti ? b.Pb[k] : b.Pa[k])), Pb: Float64Array.from(a.Pb, (v, k) => v + (anti ? b.Pa[k] : b.Pb[k])) });
    const states = na === nb ? [[na * 2, nb * 2, null, "bare"], [na * 2, nb * 2, guess(false), "atoms"]] : [[na * 2, nb * 2, guess(false), "parallel"], [na + nb, na + nb, guess(true), "antiparallel"], [na + nb, na + nb, null, "bare"]];
    const tries = states.map(([x, y, g, how]) => ({ how, twoS: x - y, r: G.hartreeFock([A, B], sh, D, { nAlpha: x, nBeta: y, ints: { one, ERI }, guess: g }) }));
    const best = tries.filter((t) => t.r.converged).sort((p, q) => p.r.E - q.r.E)[0] ?? tries[0], m = best.r, cm = Z > 1 ? G.ump2(m, ERI, { frozen: 2 * frozenOf(Z) }).E2 : 0;
    // Mulliken: each atom's charge Z − Σ_(μ on it) (PS)_μμ, and its spin Σ_(μ on it) ((Pa − Pb)S)_μμ
    const fn = G.functionsOf(sh, D), n = one.n, pop = (P) => [0, 1].map((k) => { let s = 0; fn.forEach((f, mu) => { if (sh[f.shell].atom !== k) return; for (let nu = 0; nu < n; nu++) s += P[mu * n + nu] * one.S[mu * n + nu]; }); return s; });
    const pa = pop(m.Pa), pb = pop(m.Pb), far = h ? (-3 * h.Q * h.Q) / (64 * R ** 5) : 0;
    console.log(JSON.stringify({ D, Z, R, twoS: best.twoS, start: best.how, starts: tries.map((t) => ({ how: t.how, twoS: t.twoS, dE_mHa: +((t.r.E - m.E) * 1000).toFixed(4), converged: t.r.converged })),
      int_hf_mHa: +((m.E - a.E - b.E) * 1000).toFixed(5), int_mp2_mHa: +((m.E + cm - a.E - b.E - 2 * ca) * 1000).toFixed(5), far_mHa: +(far * 1000).toFixed(5),
      charge: [Z - pa[0] - pb[0], Z - pa[1] - pb[1]].map((x) => +x.toFixed(5)), spin: [pa[0] - pb[0], pa[1] - pb[1]].map((x) => +x.toFixed(4)), converged: m.converged && a.converged, s: (Date.now() - t0) / 1000 }));
  }
}
