/* Does a crowd of molecules hold together the way its pairs say? The test a polarizable force field has to pass:
   trimers cut from crystals, their Hartree–Fock energies whole and in every part, all in the trimer's full basis
   (counterpoise, as the census's pairs are), so the three-body energy
       E₃ = E(ABC) − E(AB) − E(AC) − E(BC) + E(A) + E(B) + E(C)
   comes out of the calculation, beside each pair's interaction E(AB) − E(A) − E(B). js/polmodel.js says what E₃ should
   be (its induced dipoles answer all their neighbours at once); a pairwise model says zero.
     node four/atom/tools/manybody.mjs cut <crystals.json> <key> <n> <label>   # add trimers to manybody-set.json
     node four/atom/tools/manybody.mjs run <i>                                  # one trimer's seven energies (runner)
     node four/atom/tools/manybody.mjs bake                                     # what's done, against the model
   Each run caches every energy as it finishes ($TMPDIR/atom4-manybody/<i>.json), so a cut run resumes. A 4D trimer is
   seven Hartree–Fock calculations on one set of integrals: about an hour and two or three GB. */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import * as G from "../js/gauss.js";
import { basisFor } from "./census.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), SET = path.join(HERE, "manybody-set.json"), CACHE = path.join(tmpdir(), "atom4-manybody"), KCAL = 627.509;
const SUBSETS = [[0, 1, 2], [0, 1], [0, 2], [1, 2], [0], [1], [2]];
export const readSet = () => (existsSync(SET) ? JSON.parse(readFileSync(SET, "utf8")) : { trimers: [] });

/* one trimer: the seven energies, each with the whole trimer's basis */
export function runTrimer(i, log = () => {}) {
  const t = readSet().trimers[i], d = t.d, mols = t.mols, all = mols.flat(); mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${i}.json`), st = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { i, label: t.label, key: t.key, E: {} };
  if (SUBSETS.every((s) => st.E[s.join("")] !== undefined)) return st;
  const shells = all.flatMap((a, k) => G.shellsFor(a, basisFor(a.Z, d)).map((s) => ({ ...s, atom: k }))), t0 = Date.now();
  const one = G.oneElectron(shells, all, d), ERI = G.twoElectron(shells, d, one.F); log(`trimer ${i}: ${one.n} functions, integrals in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  for (const s of SUBSETS) {
    const id = s.join(""); if (st.E[id] !== undefined) continue;
    const atoms = s.flatMap((m) => mols[m]), n = atoms.reduce((u, a) => u + a.Z, 0) / 2, t1 = Date.now();
    const r = G.hartreeFock(atoms, shells, d, { nAlpha: n, nBeta: n, ints: { one: G.oneElectron(shells, atoms, d), ERI } });
    st.E[id] = r.E; st.ok = (st.ok ?? true) && r.converged; writeFileSync(file, JSON.stringify(st));
    log(`trimer ${i} ${id}: ${r.E.toFixed(8)} (${r.converged ? "converged" : "NOT converged"}, ${((Date.now() - t1) / 1000).toFixed(0)} s)`);
  }
  return st;
}
/* the parts, kcal/mol: each pair's interaction, the three-body term, the total */
export function parts(E) {
  const e = (s) => E[s], pair = (a, b) => (e(`${a}${b}`) - e(`${a}`) - e(`${b}`)) * KCAL;
  const pairs = { "01": pair(0, 1), "02": pair(0, 2), "12": pair(1, 2) }, three = (e("012") - e("01") - e("02") - e("12") + e("0") + e("1") + e("2")) * KCAL;
  return { pairs, three, total: (e("012") - e("0") - e("1") - e("2")) * KCAL };
}
/* cut trimers from a crystals file ({ key, minima: [{ H, mols }] }): each crystal's molecule 0 and its two nearest
   neighbours by heavy-atom distance (any image), as atom lists */
export async function cut(file, key, n, label) {
  const { sitesOf } = await import("../js/crystal.js"), { crystalOf } = await import("./ice.mjs"), { monoOf } = await import("./forcefield.mjs");
  const r = JSON.parse(readFileSync(file, "utf8")), { C } = crystalOf(key), d = C.d, Zh = monoOf(key).Z, set = readSet();
  for (const [k, m] of r.minima.slice(0, n).entries()) {
    const st = { H: m.H, mols: m.mols }, S = sitesOf(C, st), cand = [];
    const g = new Array(d).fill(-1); for (;;) { const t = st.H[0].map((_, c) => g.reduce((s, v, i) => s + v * st.H[i][c], 0)); S.forEach((M, b) => { if (b === 0 && t.every((v) => Math.abs(v) < 1e-9)) return; const Mt = M.map((p) => p.map((v, c) => v + t[c])); cand.push({ r: Math.hypot(...Mt[0].map((v, c) => v - S[0][0][c])), M: Mt }); }); let i = 0; while (i < d && g[i] === 1) { g[i] = -1; i++; } if (i === d) break; g[i]++; }
    cand.sort((a, b) => a.r - b.r);
    const mols = [S[0], cand[0].M, cand[1].M].map((M) => M.map((at, i) => ({ Z: i ? 1 : Zh, at: at.map((v) => +v.toFixed(6)) })));
    set.trimers.push({ key, d, label: `${label} #${k}`, E: m.E, rXX: [cand[0].r, cand[1].r].map((v) => +v.toFixed(3)), mols });
  }
  writeFileSync(SET, JSON.stringify(set, null, 0) + "\n");
  return set.trimers.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === "cut") console.log(`${await cut(a[0], a[1], +a[2], a[3])} trimers in the set`);
  else if (cmd === "run") { const st = runTrimer(+a[0], console.log); if (st.E["0"] !== undefined && Object.keys(st.E).length === 7) console.log(JSON.stringify({ i: st.i, label: st.label, ...parts(st.E) })); }
  else if (cmd === "bake") {
    const set = readSet(); for (const [i, t] of set.trimers.entries()) { const f = path.join(CACHE, `${i}.json`); if (!existsSync(f)) { console.log(`${i} ${t.label}: not run`); continue; } const st = JSON.parse(readFileSync(f, "utf8")); if (Object.keys(st.E).length < 7) { console.log(`${i} ${t.label}: ${Object.keys(st.E).length}/7`); continue; } console.log(JSON.stringify({ i, label: t.label, ok: st.ok, ...parts(st.E) })); }
  } else console.log("usage: manybody.mjs cut <crystals.json> <key> <n> <label> | run <i> | bake");
}
