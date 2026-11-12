/* A star's whole burning life as one run: every stage at its conditions (or the ones you set), each from the last one's
   ash, with chosen reactions' rates multiplied. Shared by the widget and the chart page. No DOM.
   cfg = { T: { stage: K }, rho: { stage: g/cm³ }, mult: { knob: factor }, z: metals × the Sun's, he: helium's mass share } */
import { STAGES, SUN_X, run, toX, NUC, IDX, RX } from "./net.js";

/* the reactions worth turning, each with its reverse (multiplied together, so detailed balance holds) */
export const KNOBS = [
  { key: "pp", label: "p + p → d (the weak step)", r: ["p", "p"], p: ["d"] },
  { key: "33", label: "³He + ³He → ⁴He + 2p", r: ["he3", "he3"], p: ["p", "p", "he4"] },
  { key: "34", label: "³He + ⁴He → ⁷Be", r: ["he4", "he3"], p: ["be7"] },
  { key: "n14", label: "¹⁴N + p → ¹⁵O (CNO's slowest)", r: ["p", "n14"], p: ["o15"] },
  { key: "3a", label: "3 ⁴He → ¹²C (triple-alpha)", r: ["he4", "he4", "he4"], p: ["c12"] },
  { key: "c12a", label: "¹²C + ⁴He → ¹⁶O", r: ["he4", "c12"], p: ["o16"] },
  { key: "o16a", label: "¹⁶O + ⁴He → ²⁰Ne", r: ["he4", "o16"], p: ["ne20"] },
  { key: "cc", label: "¹²C + ¹²C (both ways out)", r: ["c12", "c12"], p: null },
  { key: "ne20a", label: "²⁰Ne + ⁴He → ²⁴Mg", r: ["he4", "ne20"], p: ["mg24"] },
  { key: "oo", label: "¹⁶O + ¹⁶O (both ways out)", r: ["o16", "o16"], p: null },
  { key: "si28a", label: "²⁸Si + ⁴He → ³²S", r: ["he4", "si28"], p: ["s32"] },
];
const same = (a, b) => a.length === b.length && a.slice().sort().join() === b.slice().sort().join();
export const knobReactions = (kn) => RX.filter((r) => (same(r.r, kn.r) && (!kn.p || same(r.p, kn.p))) || (kn.p && same(r.r, kn.p) && same(r.p, kn.r)) || (!kn.p && same(r.p, kn.r))).map((r) => r.id);

export const defaults = () => ({ T: {}, rho: {}, mult: {}, z: 1, he: SUN_X.he4 });
export const isDefault = (c) => !Object.keys(c.T).length && !Object.keys(c.rho).length && !Object.values(c.mult).some((v) => v !== 1) && c.z === 1 && c.he === SUN_X.he4;
export function startMix(c) {
  const m = {}; let metals = 0; for (const [k, x] of Object.entries(SUN_X)) if (k !== "p" && k !== "he4") { m[k] = x * c.z; metals += m[k]; }
  return { ...m, he4: c.he, p: Math.max(0, 1 - c.he - metals) };
}
/* every stage, chained; `from` lets a caller keep earlier stages it already has */
export function runLife(c, keep = null) {
  const mult = {}; for (const kn of KNOBS) { const f = c.mult[kn.key]; if (f && f !== 1) for (const id of knobReactions(kn)) mult[id] = f; }
  const out = [];
  for (let i = 0; i < STAGES.length; i++) { const st = STAGES[i];
    if (keep && keep[i] && keep[i].sig === sig(c, i)) { out.push(keep[i]); continue; }
    const X0 = i === 0 ? startMix(c) : Object.fromEntries(toX(out[i - 1].Y).map((x, j) => [NUC[j].k, x]).filter(([, x]) => x > 1e-12));
    const T = c.T[st.key] ?? st.T, rho = c.rho[st.key] ?? st.rho, R = run({ ...st, T, rho, X0, mult }), fi = IDX[st.fuel];
    R.t90 = R.snaps.find((x) => x.Y[fi] < 0.1 * R.snaps[0].Y[fi])?.t ?? R.t; R.stuck = R.snaps.at(-1).Y[fi] > 0.5 * R.snaps[0].Y[fi];
    out.push({ ...R, st, T, rho, X0, sig: sig(c, i), i });
  }
  return out;
}
/* what a stage depends on: its own settings and every earlier one's, and the multipliers */
function sig(c, i) { const ks = STAGES.slice(0, i + 1).map((s) => [c.T[s.key], c.rho[s.key]]); return JSON.stringify([ks, c.mult, c.z, c.he]); }

/* a stage's state when a share u (0..1) of what will burn has burned */
export function at(R, u) {
  const fi = IDX[R.st.fuel], s = R.snaps, y0 = s[0].Y[fi], y1 = s.at(-1).Y[fi], want = y0 - u * (y0 - y1);
  let i = 1; while (i < s.length - 1 && s[i].Y[fi] > want) i++;
  const a = s[i - 1], b = s[i], f = a.Y[fi] === b.Y[fi] ? 1 : Math.min(1, Math.max(0, (a.Y[fi] - want) / (a.Y[fi] - b.Y[fi])));
  return { t: a.t + f * (b.t - a.t), Y: a.Y.map((v, j) => v + f * (b.Y[j] - v)) };
}
/* the whole life on one axis v = stage index + share burned (0 .. 7) */
export const atLife = (L, v) => { const i = Math.min(L.length - 1, Math.floor(v)), u = Math.min(1, v - i); return { i, u, ...at(L[i], u) }; };

/* settings in the address, so the widget and the chart open the same star */
export const encode = (c) => (isDefault(c) ? "" : "#" + encodeURIComponent(JSON.stringify({ T: c.T, rho: c.rho, mult: Object.fromEntries(Object.entries(c.mult).filter(([, v]) => v !== 1)), z: c.z, he: c.he })));
export function decode(h) { try { const o = JSON.parse(decodeURIComponent(h.replace(/^#/, ""))); return { ...defaults(), ...o, T: o.T ?? {}, rho: o.rho ?? {}, mult: o.mult ?? {} }; } catch { return defaults(); } }
