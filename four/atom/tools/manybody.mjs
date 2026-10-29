/* Does a crowd of molecules hold together the way its pairs say? The test a polarizable force field has to pass:
   trimers cut from crystals, their Hartree–Fock energies whole and in every part, all in the trimer's full basis
   (counterpoise, as the census's pairs are), so the three-body energy
       E₃ = E(ABC) − E(AB) − E(AC) − E(BC) + E(A) + E(B) + E(C)
   comes out of the calculation, beside each pair's interaction E(AB) − E(A) − E(B). js/polmodel.js says what E₃ should
   be (its induced dipoles answer all their neighbours at once); a pairwise model says zero.
     node four/atom/tools/manybody.mjs cut <crystals.json> <key> <n> <label>   # add trimers to manybody-set.json
     node four/atom/tools/manybody.mjs run <i>                                  # one trimer's seven energies (runner)
     node four/atom/tools/manybody.mjs bake                                     # what's done, against the model
     node four/atom/tools/manybody.mjs crystal <crystals.json> <key> <k> <label> # add crystal k to the set (for shells)
     node four/atom/tools/manybody.mjs shell <c> <R> [--shard i/m]              # crystal c's Hartree–Fock pair sum (runner)
   A crystal's shell: every distinct pair of a cell molecule with a neighbour whose heavy atom is within R bohr, each
   Hartree–Fock pair energy (the census's, counterpoise-corrected), summed into the crystal's pairwise lattice energy
   per molecule, ½ Σ over each molecule's neighbours. Pairs (a, b + t) and (b, a − t) are one pair, computed once.
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

/* a crystal's distinct neighbour pairs within R: [{ a, b, t (lattice vector), r, mult }] with mult 2 for a pair that
   stands for its mirror (b, a − t) too */
export async function shellPairs(c, R) {
  const { sitesOf } = await import("../js/crystal.js"), { crystalOf } = await import("./ice.mjs"), cr = readSet().crystals[c], { C } = crystalOf(cr.key), d = C.d;
  const st = { H: cr.H, mols: cr.mols }, S = sitesOf(C, st), Z = S.length, Hi = (await import("../js/crystal.js")).inv(cr.H), out = [];
  const bound = cr.H.map((_, i) => Math.ceil((R + 20) * Math.hypot(...Hi.map((r) => r[i])))), n = bound.map((b) => -b);
  for (;;) { const t = cr.H[0].map((_, k) => n.reduce((s, v, i) => s + v * cr.H[i][k], 0));
    for (let a = 0; a < Z; a++) for (let b = 0; b < Z; b++) {
      const r = Math.hypot(...S[a][0].map((v, k) => S[b][0][k] + t[k] - v)); if (r > R || r < 1e-9) continue;
      // canonical: keep (a, b, n) with a < b, or a == b and n lexicographically positive; its mirror is (b, a, −n)
      const first = n.find((v) => v !== 0); if (a > b || (a === b && !(first > 0))) continue;
      out.push({ a, b, n: n.slice(), r: +r.toFixed(4), A: S[a], B: S[b].map((p) => p.map((v, k) => v + t[k])) });
    }
    let i = 0; while (i < d && n[i] === bound[i]) { n[i] = -bound[i]; i++; } if (i === d) break; n[i]++; }
  return { cr, Z, pairs: out.sort((x, y) => x.r - y.r) };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === "cut") console.log(`${await cut(a[0], a[1], +a[2], a[3])} trimers in the set`);
  else if (cmd === "run") { const st = runTrimer(+a[0], console.log); if (st.E["0"] !== undefined && Object.keys(st.E).length === 7) console.log(JSON.stringify({ i: st.i, label: st.label, ...parts(st.E) })); }
  else if (cmd === "crystal") {
    const r = JSON.parse(readFileSync(a[0], "utf8")), m = r.minima[+a[2]], set = readSet(); set.crystals ||= [];
    set.crystals.push({ key: a[1], label: a[3], E: m.E, H: m.H.map((row) => row.map((v) => +v.toFixed(6))), mols: m.mols.map(({ R0, s }) => ({ R0: R0.map((row) => row.map((v) => +v.toFixed(8))), s: s.map((v) => +v.toFixed(8)) })) });
    writeFileSync(SET, JSON.stringify(set) + "\n"); console.log(`${set.crystals.length} crystals in the set`);
  } else if (cmd === "shell") {
    const c = +a[0], R = +a[1], sh = a.indexOf("--shard"), [si, sm] = sh >= 0 ? a[sh + 1].split("/").map(Number) : [0, 1];
    const { cr, pairs } = await shellPairs(c, R), { pairEnergy } = await import("./census.mjs"), { monoOf } = await import("./forcefield.mjs"), Zh = monoOf(cr.key).Z, d = cr.mols[0].R0.length;
    mkdirSync(CACHE, { recursive: true }); console.log(`crystal ${c} (${cr.label}): ${pairs.length} distinct pairs within ${R} bohr; this shard ${si}/${sm}`);
    for (const [k, p] of pairs.entries()) {
      if (k % sm !== si) continue; const f = path.join(CACHE, `shell_${c}_${R}_${k}.json`); if (existsSync(f)) continue;
      const t0 = Date.now(), atoms = (M) => M.map((at, i) => ({ Z: i ? 1 : Zh, at })), e = pairEnergy(atoms(p.A), atoms(p.B), d);
      writeFileSync(f, JSON.stringify({ k, a: p.a, b: p.b, n: p.n, r: p.r, E: e.E, ok: e.ok })); console.log(`pair ${k} (${p.a}→${p.b}, X–X ${p.r}): ${(e.E * KCAL).toFixed(3)} kcal/mol${e.ok ? "" : " NOT converged"} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
  } else if (cmd === "bake") {
    const set = readSet(); for (const [i, t] of set.trimers.entries()) { const f = path.join(CACHE, `${i}.json`); if (!existsSync(f)) { console.log(`${i} ${t.label}: not run`); continue; } const st = JSON.parse(readFileSync(f, "utf8")); if (Object.keys(st.E).length < 7) { console.log(`${i} ${t.label}: ${Object.keys(st.E).length}/7`); continue; } console.log(JSON.stringify({ i, label: t.label, ok: st.ok, ...parts(st.E) })); }
  } else console.log("usage: manybody.mjs cut <crystals.json> <key> <n> <label> | run <i> | bake");
}
