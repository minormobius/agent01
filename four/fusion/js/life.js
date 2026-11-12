/* A star's whole burning life as one run: every stage at its conditions (or the ones you set), each from the last one's
   ash, with chosen reactions' rates multiplied. Shared by the widget and the chart page. No DOM.
   cfg = { T: { stage: K }, rho: { stage: g/cm³ }, mult: { knob: factor }, z: metals × the Sun's, he: helium's mass share } */
import { STAGES, run, toX, NUC, IDX, RX, KNOBS, START_HE, startMix as mix, WORLD, STRENGTH, setWorld } from "./world.js";
export { KNOBS };

const same = (a, b) => a.length === b.length && a.slice().sort().join() === b.slice().sort().join();
export const knobReactions = (kn) => RX.filter((r) => (same(r.r, kn.r) && (!kn.p || same(r.p, kn.p))) || (kn.p && same(r.r, kn.p) && same(r.p, kn.r)) || (!kn.p && same(r.p, kn.r))).map((r) => r.id);

/* the standard star of the world now (ours, or 4D at its strength: world.js) */
export const defaults = () => ({ w: WORLD, s: STRENGTH, T: {}, rho: {}, mult: {}, z: 1, he: START_HE });
export const isDefault = (c) => !Object.keys(c.T).length && !Object.keys(c.rho).length && !Object.values(c.mult).some((v) => v !== 1) && c.z === 1 && c.he === START_HE;
export const startMix = (c) => mix(c);
/* make a star's world the live one (its settings carry it) */
export const enter = (c) => setWorld(c.w ?? "ours", c.s);
/* every stage, chained; `from` lets a caller keep earlier stages it already has */
export function runLife(c, keep = null) {
  const mult = {}; for (const kn of KNOBS) { const f = c.mult[kn.key]; if (f && f !== 1) for (const id of knobReactions(kn)) mult[id] = f; }
  const out = [];
  for (let i = 0; i < STAGES.length; i++) { const st = STAGES[i];
    if (keep && keep[i] && keep[i].sig === sig(c, i)) { out.push(keep[i]); continue; }
    const X0 = i === 0 ? mix(c) : Object.fromEntries(toX(out[i - 1].Y).map((x, j) => [NUC[j].k, x]).filter(([, x]) => x > 1e-12));
    const T = c.T[st.key] ?? st.T, rho = c.rho[st.key] ?? st.rho, R = run({ ...st, T, rho, X0, mult }), fi = IDX[st.fuel];
    R.t90 = R.snaps.find((x) => x.Y[fi] < 0.1 * R.snaps[0].Y[fi])?.t ?? R.t; R.stuck = R.snaps.at(-1).Y[fi] > 0.5 * R.snaps[0].Y[fi];
    out.push({ ...R, st, T, rho, X0, sig: sig(c, i), i });
  }
  return out;
}
/* what a stage depends on: its own settings and every earlier one's, and the multipliers */
function sig(c, i) { const ks = STAGES.slice(0, i + 1).map((s) => [c.T[s.key], c.rho[s.key]]); return JSON.stringify([WORLD, STRENGTH, ks, c.mult, c.z, c.he]); }

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
export const encode = (c) => (isDefault(c) && (c.w ?? "ours") === "ours" ? "" : "#" + encodeURIComponent(JSON.stringify({ ...((c.w ?? "ours") === "ours" ? {} : { w: c.w, s: c.s }), T: c.T, rho: c.rho, mult: Object.fromEntries(Object.entries(c.mult).filter(([, v]) => v !== 1)), z: c.z, he: c.he })));
/* the settings in an address, its world made live first (so the defaults are that world's) */
export function decode(h) { let o = {}; try { o = h && h.length > 1 ? JSON.parse(decodeURIComponent(h.replace(/^#/, ""))) : {}; } catch { o = {}; } enter(o); return { ...defaults(), ...o, w: WORLD, s: STRENGTH, T: o.T ?? {}, rho: o.rho ?? {}, mult: o.mult ?? {} }; }
