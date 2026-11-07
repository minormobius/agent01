/* AMOEBA's physics, off the page's thread: steps as fast as it can, and hands the page the membrane whenever the page
   is ready for another (so a slow 4D step slows the cell, never the view). */
import { makeAmoeba, step, centre, spawnFood, FOOD } from "./amoeba.js";
let A = null, preset = "explore", paused = false, ready = true, speed = 1, hist = [], sentVersion = -1;
const PRESET = {
  explore: { floor: true, food: 0, opts: {} },
  hunt: { floor: true, food: 1, opts: {} },
  still: { floor: true, food: 0, opts: { noise: 0 } },
  float: { floor: false, food: 0, opts: {} },
};
function init(d, p, extra = {}) {
  preset = PRESET[p] ? p : "explore"; const pr = PRESET[preset];
  A = makeAmoeba(d, undefined, { dt: 0.02, ...pr.opts, ...extra }); A.floor = pr.floor; A.V00 = A.V0;
  if (!pr.floor) { for (let i = 0; i < A.nv; i++) A.P[i * d + 1] += 0; }
  if (pr.food) { A.keepFood = FOOD[d].count; while (A.foods.length < A.keepFood) spawnFood(A); }
  hist = [];
  sentVersion = -1; self.postMessage({ type: "mesh", d, nv: A.nv, nf: A.nf, F: A.M.F.slice() });
  send();
}
function send() {
  const { d, nv, P, g, u, v, sig } = A, gn = new Float32Array(nv * d);
  for (let i = 0; i < nv; i++) { let l = 0; for (let c = 0; c < d; c++) l += g[i * d + c] ** 2; l = Math.sqrt(l) || 1; for (let c = 0; c < d; c++) gn[i * d + c] = g[i * d + c] / l; }
  const C = centre(A); hist.push([A.t, C]); while (hist.length > 2 && A.t - hist[0][0] > 4) hist.shift();
  const [t0, C0] = hist[0], vel = A.t > t0 ? Math.hypot(...[...C].map((x, k) => (k === 1 ? 0 : x - C0[k]))) / (A.t - t0) : 0;
  // (the mesh itself, when remeshing has changed it since the last frame the page took)
  const remeshed = (A.meshVersion || 0) !== sentVersion; sentVersion = A.meshVersion || 0;
  const msg = { type: "frame", t: A.t, d, nv, nf: A.nf, F: remeshed ? A.M.F.slice() : null, P: Float32Array.from(P), g: gn, u: Float32Array.from(u), v: Float32Array.from(A.myo), sig: Float32Array.from(sig), chem: Float32Array.from(A.chem), pv: A.pv ? [...A.pv] : null, steer: A.steer ? [...A.steer.dir] : null,
    nuc: [...A.nuc.c], nucA: A.nuc.a, foods: A.foods.map((F) => [...F]), C: [...C], V: A.V, V0: A.V0, V00: A.V00, area: A.Area, Pr: A.Pr, eaten: A.eaten, vel, floor: A.floor, stepMs: A.stepMs || 0 };
  ready = false; self.postMessage(msg, [msg.P.buffer, msg.g.buffer, msg.u.buffer, msg.v.buffer, msg.sig.buffer, msg.chem.buffer]);
}
// paced to the clock: RATE seconds of the cell's time per second of yours (behind, it catches up within a budget;
// a slow 4D step just runs slower)
const RATE = 1; let wall = performance.now();
function loop() {
  const now = performance.now(), el = Math.min(0.1, (now - wall) / 1000); wall = now;
  if (A && !paused) { A.goal = (A.goal ?? A.t) + el * RATE * speed; const t0 = performance.now(); let n = 0;
    while (A.t < A.goal && performance.now() - t0 < 40) { step(A); n++; }
    if (A.t < A.goal - 0.2) A.goal = A.t + 0.2;
    if (n) A.stepMs = (performance.now() - t0) / n; }
  if (A && ready) send();
  setTimeout(loop, 8);
}
self.onmessage = (e) => { const m = e.data;
  if (m.type === "init") init(m.d, m.preset, m.opts || {});
  else if (m.type === "ready") ready = true;
  else if (m.type === "pause") paused = m.on;
  else if (m.type === "speed") speed = m.v;
  else if (m.type === "steer" && A) A.steer = m.dir ? { dir: Float64Array.from(m.dir), s: m.s ?? 1 } : null;
};
loop();
