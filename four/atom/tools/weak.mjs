/* The weak window (the roadmap's A1): for each clock of the first minutes (t at 1 MeV, which gravity sets; ours 0.74 s
   before e± annihilation, 1.32 after), the 4D weak constant G₄ above which the first minutes leave at least half the
   hydrogen (and 70%), with what that G₄ means: the neutron's lifetime, the weak factor in p + p against ours, and G₄m_e³
   against ours' G_F m_e². Ours first, as the check. Writes $TMPDIR/atom4-nuclei/weak-window.json.
     node four/atom/tools/weak.mjs [B_deuteron MeV, default 2.2246 (as ours)] */
import { writeFileSync, mkdirSync } from "node:fs";
import * as W from "../js/weak.js";
import { firstMinutes } from "../js/bbn.js";

const Bd = +(process.argv[2] ?? 2.2246), DIR = `${process.env.TMPDIR ?? "/tmp"}/atom4-nuclei`;
const nf3 = W.neutronFraction(3, W.GF, { t1: 0.74 }), tau3 = W.neutronLife(3, W.GF), Y3 = firstMinutes({ d: 3, B: 2.224566, Tf: nf3.Tf, tau: tau3 }).Y;
console.log(`ours: neutron ${tau3.toFixed(0)} s (measured 879), freeze-out ${nf3.Tf.toFixed(3)} MeV, Y ${Y3.toFixed(3)} (measured 0.245)`);
const Y = (lx, t1) => { const G = W.G4_REF * 10 ** lx, n = W.neutronFraction(4, G, { t1 }); return firstMinutes({ d: 4, B: Bd, t1, Tf: n.Tf, tau: W.neutronLife(4, G) }).Y; };
const edge = (t1, Ymax) => { let lo = -2, hi = 10; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (Y(m, t1) > Ymax) lo = m; else hi = m; } return (lo + hi) / 2; };
const rows = [];
for (const t1 of [0.01, 0.1, 0.74, 1, 10, 100]) { const e5 = edge(t1, 0.5), e3 = edge(t1, 0.3), G = W.G4_REF * 10 ** e5;
  const r = { t1, log10G_half: e5, log10G_70: e3, G4: G, neutronLife: W.neutronLife(4, G), ppWeak: W.weakRatio(4, G, Bd - W.Q_NP - W.ME), G4me3: G * W.ME ** 3 }; rows.push(r);
  console.log(`clock ${t1} s: half the hydrogen kept once G₄ > 10^${e5.toFixed(2)} × G_F/M_W (G₄m_e³ ${r.G4me3.toExponential(2)} against ours' G_F m_e² ${(W.GF * W.ME ** 2).toExponential(2)}; neutron ${r.neutronLife.toExponential(2)} s; p + p's weak factor ×${r.ppWeak.toExponential(1)} ours); 70% from 10^${e3.toFixed(2)}`); }
mkdirSync(DIR, { recursive: true }); writeFileSync(`${DIR}/weak-window.json`, JSON.stringify({ Bd, ours: { tau: tau3, Tf: nf3.Tf, Y: Y3 }, G4_REF: W.G4_REF, rows }, null, 1));
