/* WAKE's lake, no DOM: a valley flooded to y = 0, with islands, and the buoys a course rounds.

   The ground is Fall Line's kind of hill: a height over (x, z, w). Here it is analytic, so the physics and the oracle
   read it exactly and only the shader needs it baked (one sample a metre into a 3D texture, as Fall Line's). Inside
   the valley the bottom lies DEPTH under the surface with a little lumpiness; past 0.84 of the way out it climbs to
   beaches and walls; islands are smooth domes standing out of the water. A level gives positions relative to the
   lake's middle; the start is a place and a heading. */
import { BOATS, camFrame, cross3 } from "./boat.js";
export const BOX = [200, 160, 96], HN = [201, 161, 97], MID = [100, 80, 48];
export const BASIN = { c: MID, a: [94, 74, 44] }, DEPTH = 3.5, GATE = 3.5, BUOY_R = 0.9;
export const basinE = (q) => Math.hypot((q[0] - BASIN.c[0]) / BASIN.a[0], (q[1] - BASIN.c[1]) / BASIN.a[1], (q[2] - BASIN.c[2]) / BASIN.a[2]);
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function vnoise(x, z, w, seed) {
  const h = (a, b, c) => { let n = (Math.imul(a + 7, 73856093) ^ Math.imul(b + 11, 19349663) ^ Math.imul(c + 13, 83492791) ^ Math.imul(seed, 374761393)) >>> 0; n ^= n >>> 13; n = Math.imul(n, 0x5bd1e995) >>> 0; n ^= n >>> 15; return (n >>> 0) / 4294967296; };
  const ix = Math.floor(x), iz = Math.floor(z), iw = Math.floor(w), fx = x - ix, fz = z - iz, fw = w - iw, s = (t) => t * t * (3 - 2 * t), u = s(fx), v = s(fz), q = s(fw);
  let r = 0; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) r += h(ix + a, iz + b, iw + c) * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? q : 1 - q);
  return r;
}
/* a level is written in its start's frame: [ahead, right, ana] from the lake's middle, the boat setting off along
   "ahead" (+x) with "right" (+z) across it and ana the rest. place() turns it into the lake's x, z, w */
export const START = (() => { const T = [1, 0, 0], e1 = [0, 1, 0], e2 = cross3(T, e1); return { T, e1, e2, ana: camFrame(T, e1, e2).ana }; })();
const abs3 = (p) => [0, 1, 2].map((i) => MID[i] + p[0] * START.T[i] + p[1] * START.e1[i] + p[2] * START.ana[i]);
export function place(level) {
  return { ...level, buoys: level.buoys.map(abs3), islands: (level.islands || []).map((i) => ({ ...i, c: abs3(i.c) })), start: { p: abs3(level.start), T: START.T, e1: START.e1 } };
}
/* the ground's height at g (x, z, w) */
export function heightAt(P, g, seed = P.seed || 1) {
  const e = basinE(g);
  let h = -DEPTH + 0.9 * (vnoise(g[0] / 13, g[1] / 13, g[2] / 13, seed) - 0.5);
  h += (DEPTH + 1.2) * sm(0.84, 0.95, e) + 22 * sm(0.94, 1.05, e) ** 2; // the beach, then the walls
  for (const i of P.islands) { const d = Math.hypot(g[0] - i.c[0], g[1] - i.c[1], g[2] - i.c[2]) / i.r; if (d < 1) h += (DEPTH + i.h) * (1 - d * d) ** 2; }
  return h;
}
export const depthAt = (P, g) => -heightAt(P, g);
/* bake for the shader: heights H, the (empty) trails' field F, the slope bound L, and a blank kerb table */
export function bake(P) {
  const [NX, NZ, NW] = HN, N = NX * NZ * NW, H = new Float32Array(N);
  for (let w = 0; w < NW; w++) for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) H[x + NX * (z + NZ * w)] = heightAt(P, [x, z, w]);
  let L = 0;
  for (let w = 1; w < NW - 1; w += 1) for (let z = 1; z < NZ - 1; z += 1) for (let x = 1; x < NX - 1; x += 1) {
    if (basinE([x, z, w]) > 0.92) continue; // (the walls are steeper, but thick: a ray that oversteps into one is still caught)
    const i = x + NX * (z + NZ * w); L = Math.max(L, Math.hypot((H[i + 1] - H[i - 1]) / 2, (H[i + NX] - H[i - NX]) / 2, (H[i + NX * NZ] - H[i - NX * NZ]) / 2));
  }
  const F = new Float32Array(N * 2).fill(20);
  return { H, F, L: Math.max(0.4, Math.min(3, L * 1.15)), tan: new Float32Array(256 * 4), rows: 1 };
}
/* is a level sound: everything in the water, the buoys apart and clear of the islands and the shore, the start too */
export function check(P) {
  const deep = (g, need) => depthAt(P, g) > need, probs = [];
  P.buoys.forEach((b, i) => { if (!deep(b, 1.5)) probs.push(`buoy ${i + 1} is in the shallows`); if (basinE(b) > 0.78) probs.push(`buoy ${i + 1} is near the shore`); });
  for (let i = 0; i < P.buoys.length; i++) for (let j = i + 1; j < P.buoys.length; j++) if (Math.hypot(...P.buoys[i].map((x, k) => x - P.buoys[j][k])) < 3 * GATE) probs.push(`buoys ${i + 1} and ${j + 1} are close`);
  if (!deep(P.start.p, 1.5)) probs.push("the start is aground");
  return { ok: probs.length === 0, probs };
}
export { BOATS };
