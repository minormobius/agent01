/* ATOM⁴'s live liquids: a drop of our water (3D) beside a drop of Xater (4D), each a molecular-dynamics run in the
   page (js/md.js), drawn in a 4D tile (js/tile.js). The molecules are rigid, with the force fields fitted to
   Hartree–Fock pair energies (js/forcefields.js), and charges meet by the quick damped-shifted-force sum. It's for
   looking at, not for numbers: the science runs use the full Ewald sum, and this force field gives our own water only
   about half its real cohesion (README). Each drop sits in a box twice its size, so heat it and molecules boil off;
   cool it and they come back. */
import { System } from "./md.js";
import { termsOf } from "./ffmodel.js";
import { FORCEFIELDS } from "./forcefields.js";
import { CENSUS } from "./census.js";
import { makeTile, eye, turn } from "./tile.js";

const $ = (id) => document.getElementById(id);
const amu = 1822.888486, K = 3.166811563e-6, kJ = 2625.4996, fs = 41.341374;
const COLOUR = { 3: "#d9483b", 4: "#c79bff" };
/* a drop of N molecules of world d: on a lattice at the liquid's rough spacing, in a box twice the drop's width */
export function drop(d, N, kT) {
  const ff = FORCEFIELDS[d], m = CENSUS[d].find((x) => x.Z === ff.Z), { q, pairs } = termsOf(ff.p), th = (m.param * Math.PI) / 180, R = m.R;
  const pad = (v) => [...v, ...new Array(d - v.length).fill(0)];
  const kind = { sites: [{ m: (d === 3 ? 16 : 20) * amu, q: -2 * q, t: "X", at: pad([0, 0]) }, { m: 1.008 * amu, q, t: "H", at: pad([R * Math.cos(th / 2), R * Math.sin(th / 2)]) }, { m: 1.008 * amu, q, t: "H", at: pad([R * Math.cos(th / 2), -R * Math.sin(th / 2)]) }], constraints: [[0, 1], [0, 2], [1, 2]] };
  const sp = m.dimer.RXX * 0.98, side = Math.ceil(Math.pow(N, 1 / d)), L = Math.max(2.2 * side * sp, 2 * 11 + 1), rc = Math.min(11, L / 2 - 0.5);
  const positions = Array.from({ length: N }, (_, a) => { const c = []; let i = a; for (let k = 0; k < d; k++) { c.push(L / 2 + ((i % side) - (side - 1) / 2) * sp); i = Math.floor(i / side); } return c; });
  const sys = new System({ d, L, kind, N, pairs, rc, dsf: { alpha: 0.12 }, positions, seed: 7 + d });
  sys.thermalize(kT);
  return sys;
}
/* the scene: each molecule's atoms (wrapped by its heavy atom into the box), its two bonds, and the box's edges */
function sceneOf(sys) {
  const { d, N, ns } = sys, balls = [], bonds = [], P = [], lines = [];
  for (let a = 0; a < N; a++) { const o = balls.length; balls.push({ p: [0, 0, 0, 0], c: COLOUR[d], r: 0.06 }, { p: [0, 0, 0, 0], el: "H", r: 0.035 }, { p: [0, 0, 0, 0], el: "H", r: 0.035 }); bonds.push([o, o + 1], [o, o + 2]); }
  const corners = 1 << d; for (let c = 0; c < corners; c++) P.push([0, 1, 2, 3].map((k) => (k < d ? ((c >> k) & 1 ? 1 : -1) : 0)));
  for (let c = 0; c < corners; c++) for (let k = 0; k < d; k++) if (!((c >> k) & 1)) lines.push([c, c | (1 << k)]);
  return { balls, bonds, P, lines, ns };
}
function place(sys, scene) {
  const { d, N, ns, L, x } = sys, h = L / 2;
  for (let a = 0; a < N; a++) {
    const o = a * ns, shift = []; for (let k = 0; k < d; k++) shift.push(-L * Math.floor(x[o * d + k] / L));
    for (let s = 0; s < ns; s++) { const b = scene.balls[a * 3 + s].p; for (let k = 0; k < 4; k++) b[k] = k < d ? (x[(o + s) * d + k] + shift[k] - h) / h : 0; }
  }
}
/* how the drop is doing: hydrogen bonds per molecule (an H within HB of another molecule's heavy atom) and molecules
   that have boiled off (no heavy atom within FAR) */
export function census(sys) {
  const { d, N, ns } = sys, HB = d === 3 ? 4.3 : 4.6, FAR = d === 3 ? 7.5 : 9.5; let hb = 0, free = 0;
  for (let a = 0; a < N; a++) {
    let near = false;
    for (let b = 0; b < N; b++) { if (a === b) continue; const r = Math.hypot(...sys.sep(a * ns, b * ns)); if (r < FAR) near = true; for (const h of [1, 2]) if (Math.hypot(...sys.sep(a * ns + h, b * ns)) < HB) hb++; }
    if (!near) free++;
  }
  return { hb: hb / N, free };
}

export function buildLiquid() {
  const host = $("liquidTiles"); if (!host) return;
  const ctl = $("liquidT"), out = $("liquidTv");
  const runs = [3, 4].map((d) => {
    const N = d === 3 ? 64 : 81, kT = +ctl.value * K, sys = drop(d, N, kT), scene = sceneOf(sys), read = document.createElement("p");
    read.className = "read"; place(sys, scene);
    const run = { d, N, sys, scene, read, avg: null, frame: 0 };
    const tile = makeTile(host, scene, {
      title: d === 3 ? "our water, 64 molecules" : "Xater, 81 molecules", sub: d === 3 ? "3D, drawn in a 4D tile with w = 0" : "4D: turn it through w, or slice it",
      R: 1.25, spin: [0.0012, 0.0008], start: d === 3 ? turn(eye(), 1, 2, -0.35) : turn(turn(eye(), 0, 3, 0.5), 1, 2, 0.3), sliceRange: 1,
      step: () => {
        const kT = +ctl.value * K; for (let k = 0; k < 4; k++) sys.step(2 * fs, kT, 200 * fs); place(sys, scene);
        run.avg = run.avg == null ? sys.Epot : 0.97 * run.avg + 0.03 * sys.Epot;
        if (++run.frame % 20 === 0) { const c = census(sys); read.innerHTML = `T ${(sys.temperature() / K).toFixed(0)} K · U ${((run.avg / N) * kJ).toFixed(1)} kJ/mol a molecule · ${c.hb.toFixed(2)} hydrogen bonds a molecule · ${c.free} boiled off`; }
      },
    });
    tile.el.appendChild(read);
    return run;
  });
  const show = () => { out.textContent = `${ctl.value} K`; }; ctl.addEventListener("input", show); show();
  return runs;
}
