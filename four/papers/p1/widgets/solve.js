/* The screening widget's worker: one 4D atom solved twice, with the 4D kernel (no shell theorem) and with the shell
   theorem forced on (our kernel), in the baked ground configuration, and its first ionization by ΔSCF from the baked
   outermost subshell, as tools/bake.mjs does it. Also the outer electron's effective charge, Z_eff(r) = −r V(r), from
   the electrostatic part of its potential (nucleus and the other electrons' clouds, no exchange). */
import { scf, potentials, subshells, R, N, H } from "../../../atom/js/atom.js";

const SH = subshells(4);
const occOf = (config) => { const o = SH.map(() => 0); for (const t of config.split(" ")) { const m = t.match(/^(\d+[a-z])(\d+)$/); o[SH.findIndex((s) => s.name === m[1])] = +m[2]; } return o; };
const PTS = Array.from({ length: 90 }, (_, i) => 0.05 * Math.pow(10, (i / 89) * Math.log10(40 / 0.05)));
const at = (f, r) => { const x = Math.log(r / R[0]) / H, j = Math.min(N - 2, Math.max(0, Math.floor(x))), u = x - j; return f[j] * (1 - u) + f[j + 1] * u; };

function one(Z, occ, top, shellTheorem) {
  const g = scf(Z, occ, 4, { iters: 120, exchange: true, shellTheorem });
  let ion; if (Z === 1) ion = -g.E;
  else { const o = occ.slice(); o[top]--; ion = scf(Z, o, 4, { iters: 120, start: g.qs, exchange: true, shellTheorem }).E - g.E; }
  const V = potentials(Z, occ, g.qs, 4, { exchange: false, shellTheorem })[top], q = g.qs[top];
  // the outer subshell's radial probability per bohr, q_j / (h r_j), sampled on the same points
  return { E: g.E, ion, e: g.es[top], converged: g.converged, zeff: PTS.map((r) => [r, -r * at(V, r)]), cloud: PTS.map((r) => [r, at(q, r) / (H * r)]) };
}

self.onmessage = ({ data: { Z, config, top } }) => {
  const occ = occOf(config), i = SH.findIndex((s) => s.name === top), t0 = performance.now();
  const four = one(Z, occ, i, false), shell = one(Z, occ, i, true);
  self.postMessage({ Z, four, shell, ms: performance.now() - t0 });
};
