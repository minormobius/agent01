/* The stars chapter's nebulae: each run's final state (js/nebuladata.js, 500 of its particles) in the 4D viewer, one
   tab per run, the particles orbiting the star under 1/r² (leapfrog, the run's own law) so a disk turns as a disk and
   a Hopf ball swirls as one. Drawing only; the runs are tools/nebula.mjs's. */
import { makeTile, eye, turn } from "./tile.js";

const $ = (id) => document.getElementById(id);
const SHOW = [
  ["d3_a1_0_n10000_T150_s1", "3D control", "our world: a cloud turning in one plane flattens to a thin disk"],
  ["d4_a1_0_n10000_T150_s1", "4D · one plane", "turning in one plane only: it flattens to a disk too, more slowly"],
  ["d4_a1_0.25_n10000_T150_s1", "4D · ratio ¼", "the second plane at a quarter of the first's rate: it thins, then stops"],
  ["d4_a1_0.5_n10000_T150_s1", "4D · ratio ½", "half the rate: it stops thicker"],
  ["d4_a1_0.75_n30000_T40_s1", "4D · ratio ¾", "three quarters: nearly round"],
  ["d4_a1_1_n30000_T40_s1", "4D · equal", "equal rates: it never flattens. Every orbit runs round one of Hopf's circles"],
];

export function buildNebula(NEBULA) {
  const host = $("nebulaTiles"); if (!host) return;
  for (const [name, tab, sub] of SHOW) {
    const run = NEBULA.find((r) => r.name === name); if (!run || !run.snap.length) continue;
    const d = run.d, pad = (v) => [...v, ...new Array(4 - v.length).fill(0)];
    const X = run.snap.map((q) => pad(q.slice(0, d))), V = run.snap.map((q) => pad(q.slice(d, 2 * d)));
    const rs = X.map((p) => Math.hypot(...p)).sort((a, b) => a - b), R90 = rs[Math.floor(0.9 * rs.length)], k = 1 / R90;
    const scene = { balls: [{ p: [0, 0, 0, 0], c: "#ffd27a", r: 0.07 }, ...X.map((p) => ({ p: p.map((v) => v * k), c: "#e9e4da", r: 0.016 }))] };
    makeTile(host, scene, {
      tab, title: tab === "3D control" ? "our world" : `four dimensions, ${tab.replace("4D · ", "")}`, sub,
      R: 1.25, spin: d === 3 ? [[0, 2, 0.0015]] : [[0, 2, 0.0012], [1, 3, 0.0007]], start: turn(eye(), 1, 2, -1.3), // the xy disk nearly edge-on, turning about the vertical
      step: () => { // the gas orbiting the star: two leapfrog steps a frame
        for (let s = 0; s < 2; s++) for (let i = 0; i < X.length; i++) {
          const x = X[i], v = V[i], dt = 0.004, acc = () => { const r2 = Math.max(0.0025, x[0] ** 2 + x[1] ** 2 + x[2] ** 2 + x[3] ** 2), f = 1 / (r2 * Math.sqrt(r2)); return x.map((u) => -f * u); };
          let a = acc(); for (let c = 0; c < 4; c++) { v[c] += 0.5 * dt * a[c]; x[c] += dt * v[c]; } a = acc(); for (let c = 0; c < 4; c++) v[c] += 0.5 * dt * a[c];
        }
        X.forEach((p, i) => { const b = scene.balls[i + 1].p; for (let c = 0; c < 4; c++) b[c] = p[c] * k; });
      },
    });
  }
}
