/* The light 4D nuclei, by protons and neutrons, for the 4D burning network: each one is k helium-4s plus at most one
   small cluster c (a neutron, a proton, a deuteron, a triton, a helium-3), and its binding is
     B(k, c) = k B_α + |E_ladder(k)| + B_c + V_c(k)
   with every piece computed where the book has computed it (Minnesota's force at strength s; cache $TMPDIR/atom4-nuclei):
     B_α, B_t:      diffusion Monte Carlo (nuclei.mjs he4 4 s none 4 | 3), less a Coulomb estimate (ours' scaled by size)
     B_d:           the deuteron (nuclear.js deuteron)
     E_ladder(k):   k helium-4s by Monte Carlo on the pair potential (Coulomb between them included), k ≤ 8
     V_n, V_p (k):  a nucleon on k helium-4s: Brink's mass 5 for k = 1 (at the window's three strengths, linear in s
                    between), plusone for k = 2–5 (loose draw; the close draw is the spread)
     V_α (k):       E_ladder(k) − E_ladder(k + 1)
     V_d, V_t, V_h: NOT computed: interpolated in the cluster's mass between the nucleon's and helium-4's binding to the
                    same core, nuclear part linear in A_c, Coulomb as δC = V_n − V_p per proton
   Each nucleus carries where its binding came from. Masses: M = Z m_p + N m_n − B.
     node four/fusion/tools/nuc4.mjs <s> [compact]      the table and the questions it settles */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { deuteron, MN, NP_MASS, M_E } from "../../atom/js/nuclear.js";

const DIR = `${process.env.TMPDIR ?? "/tmp"}/atom4-nuclei`, tag = (x) => String(x).replace(".", "p");
const load = (f) => (existsSync(`${DIR}/${f}`) ? JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")) : null);
const WINDOW = [1.4002, 1.5152, 1.8909];
export const CLUSTERS = { "": [0, 0], n: [0, 1], p: [1, 0], np: [1, 1], t: [1, 2], h: [2, 1], nn: [0, 2], pp: [2, 0] }; // [Z, N]
const CNAME = { np: "neutron + proton", t: "triton-like", h: "helium-3-like", nn: "two neutrons", pp: "two protons" };

export function table(s, { compact = false } = {}) {
  const he = (A) => load(`MN-he-4-${tag(s)}-none-${A}.json`), h3d = load("MN-he-3-1-none-4.json") ?? load("he-3-1-none-4.json");
  const a4 = he(4), a3 = he(3); if (!a4 || !a3) throw new Error(`no helium-4 / helium-3 at s = ${s} in ${DIR}`);
  const size = h3d ? Math.sqrt(h3d.r2 / a4.r2) : 1; // Coulomb ∝ 1/size: ours' scaled by the 4D nucleus's size against ours
  const CA = 0.764 * size, Ba = -a4.E - CA, Bt = -a3.E, Bh = Bt - CA, Bd = deuteron(4, MN, s)?.B ?? 0; // ⁴He's Coulomb ≈ ³He's against ³H
  const lad = (k) => (k === 0 ? null : k === 1 ? 0 : load(`MN-ladder-4-${tag(s)}-${k}.json`)?.E ?? null);
  // a nucleon on k helium-4s: k = 1 Brink's mass 5 (unbound states positive), k = 2–5 plusone
  const mass5 = (Z) => { const at = (w) => { const m = load(`mass5-4-${tag(w)}-1.json`); return m ? -m.states[Z ? "0p" : "0n"] : null; };
    const ex = WINDOW.find((w) => Math.abs(w - s) < 1e-4); if (ex) return { V: at(ex), how: "computed" };
    const i = WINDOW.findIndex((w) => w > s); if (i <= 0) return null; const [w0, w1] = [WINDOW[i - 1], WINDOW[i]], v0 = at(w0), v1 = at(w1);
    return v0 == null || v1 == null ? null : { V: v0 + ((s - w0) / (w1 - w0)) * (v1 - v0), how: "interpolated in s" }; };
  const plus = (k, Z) => { const xs = [24, 40].map((nd) => load(`plusone-4-${tag(s)}-${k}-${Z}-${nd}${compact ? "-c" : ""}.json`)).filter(Boolean); return xs.length ? { V: xs.at(-1).S, how: "computed" } : null; };
  const Vn = (k, Z) => (k === 1 ? mass5(Z) : k <= 7 ? plus(k, Z) : null);
  // two or three nucleons on k helium-4s (nuclei.mjs plusmore), the largest basis run kept
  const more = (k, c) => { const xs = readdirSync(DIR).filter((f) => new RegExp(`^plusmore-4-${tag(s).replace(".", "\\.")}-${k}-${c}-\\d+(-x\\d+)?${compact ? "-c" : ""}\\.json$`).test(f)).map(load).sort((a, b) => a.n - b.n); return xs.at(-1) ?? null; };
  const out = [];
  const add = (Z, N, B, how, k, c) => out.push({ Z, N, A: Z + N, B, how, k, c, key: `${Z}-${Z + N}` });
  add(1, 0, 0, "free", 0, "p"); add(0, 1, 0, "free", 0, "n"); add(1, 1, Bd, "computed", 0, "d"); add(1, 2, Bt, "computed", 0, "t"); add(2, 1, Bh, "computed (Coulomb estimated)", 0, "h");
  for (let k = 1; k <= 8; k++) {
    const E = lad(k); if (E == null) continue; const Bc = k * Ba - E; add(2 * k, 2 * k, Bc, k === 1 ? "computed" : "computed (ladder)", k, "");
    const vn = Vn(k, 0), vp = Vn(k, 1), Ek1 = lad(k + 1); if (!vn || !vp) continue;
    add(2 * k, 2 * k + 1, Bc + vn.V, `core + neutron ${vn.how}`, k, "n"); add(2 * k + 1, 2 * k, Bc + vp.V, `core + proton ${vp.how}`, k, "p");
    if (Ek1 == null) continue;
    const Va = E - Ek1, dC = vn.V - vp.V, nuc = (Ac) => vn.V + (Va + 2 * dC - vn.V) * (Ac - 1) / 3;
    // computed where plusmore has run (the cluster's nucleons all taken away: S = B(core + cluster) − B(core)), else interpolated
    const cl = (c, Z, N, interp) => { const m = more(k, c); if (m) add(Z, N, Bc + m.S, `core + ${CNAME[c]} computed`, k, c); else if (interp != null) add(Z, N, interp, "interpolated cluster", k, c); };
    cl("np", 2 * k + 1, 2 * k + 1, Bc + Bd + nuc(2) - dC); cl("t", 2 * k + 1, 2 * k + 2, Bc + Bt + nuc(3) - dC); cl("h", 2 * k + 2, 2 * k + 1, Bc + Bh + nuc(3) - 2 * dC);
    cl("nn", 2 * k, 2 * k + 2, null); cl("pp", 2 * k + 2, 2 * k, null);
  }
  const by = Object.fromEntries(out.map((x) => [`${x.Z}-${x.N}`, x])), B = (Z, N) => (Z === 2 && N === 2 ? Ba : by[`${Z}-${N}`]?.B), MP = 938.272, MNn = 939.565;
  for (const x of out) { const { Z, N } = x;
    const Sn = B(Z, N - 1) != null ? x.B - B(Z, N - 1) : null, Sp = B(Z - 1, N) != null ? x.B - B(Z - 1, N) : null, Sa = B(Z - 2, N - 2) != null ? x.B - B(Z - 2, N - 2) - Ba : null;
    const Bpar = B(Z - 1, N + 1), Bdau = B(Z + 1, N - 1);
    x.Sn = Sn; x.Sp = Sp; x.Sa = Sa; x.mass = Z * MP + N * MNn - x.B;
    x.betaPlus = Bpar != null ? Bpar - x.B - NP_MASS - M_E : null; // kinetic endpoint of β⁺ to (Z−1, N+1); EC open above −2m_e
    x.betaMinus = Bdau != null ? Bdau - x.B + NP_MASS - M_E : null;
    x.bound = [Sn, Sp, Sa].every((v) => v == null || v > 0) && !(x.Z === 0 && x.N === 1);
  }
  return { s, compact, Ba, Bd, Bt, Bh, CA, nuclides: out, B };
}

/* what the table decides: is each nucleus held together; which way captures go */
if (import.meta.url === `file://${process.argv[1]}`) {
  const s = +process.argv[2], T = table(s, { compact: process.argv.includes("compact") });
  console.log(`s = ${s}: B(α) ${T.Ba.toFixed(2)}, B(d) ${T.Bd.toFixed(3)}, B(t) ${T.Bt.toFixed(2)}, B(³He-like) ${T.Bh.toFixed(2)} MeV (Coulomb ${T.CA.toFixed(2)})`);
  const f = (v) => (v == null ? "    —" : v.toFixed(1).padStart(7));
  console.log("  Z  N   A   B(MeV)    S_n    S_p    S_α    β⁺ end   bound  how");
  for (const x of T.nuclides.sort((a, b) => a.A - b.A || a.Z - b.Z)) console.log(`${String(x.Z).padStart(3)}${String(x.N).padStart(3)}${String(x.A).padStart(4)} ${x.B.toFixed(1).padStart(8)} ${f(x.Sn)}${f(x.Sp)}${f(x.Sa)} ${f(x.betaPlus)}   ${x.bound ? "yes" : " no"}   ${x.how}`);
}
