/* OOZE's physics, off the page's thread: the level set up (./play.js on AMOEBA's engine), stepped in time with the
   clock, judged, and handed to the page frame by frame; and levels grown from seeds here too (the oracle takes a few
   seconds on a big one, which would freeze the page). */
import { setup, play, floorPos } from "./play.js";
import { generate } from "./game.js";
import { centre } from "../../amoeba/js/amoeba.js";
let A = null, paused = false, ready = true, sentVersion = -1, hist = [];
function start(level) {
  A = setup(level); A.seed = (level.seed || 1) * 31 + 7; hist = []; sentVersion = -1;
  self.postMessage({ type: "mesh", d: 4, nv: A.nv, nf: A.nf, F: A.M.F.slice() }); send();
}
function send() {
  const { nv, P, g, u, sig } = A, gn = new Float32Array(nv * 4);
  for (let i = 0; i < nv; i++) { let l = 0; for (let c = 0; c < 4; c++) l += g[i * 4 + c] ** 2; l = Math.sqrt(l) || 1; for (let c = 0; c < 4; c++) gn[i * 4 + c] = g[i * 4 + c] / l; }
  const C = centre(A); hist.push([A.t, C]); while (hist.length > 2 && A.t - hist[0][0] > 4) hist.shift();
  const [t0, C0] = hist[0], vel = A.t > t0 ? Math.hypot(...[...C].map((x, k) => (k === 1 ? 0 : x - C0[k]))) / (A.t - t0) : 0;
  const remeshed = (A.meshVersion || 0) !== sentVersion; sentVersion = A.meshVersion || 0;
  const msg = { type: "frame", t: A.t, d: 4, nv, nf: A.nf, F: remeshed ? A.M.F.slice() : null, P: Float32Array.from(P), g: gn, u: Float32Array.from(u), v: Float32Array.from(A.myo), sig: Float32Array.from(sig), chem: Float32Array.from(A.chem),
    pv: A.pv ? [...A.pv] : null, steer: A.steer ? [...A.steer.dir] : null, nuc: [...A.nuc.c], nucA: A.nuc.a, foods: A.foods.map((F) => [...F]), C: [...C], V: A.V, V0: A.V0, area: A.Area, Pr: A.Pr, eaten: A.eaten, vel, floor: true,
    stepMs: A.stepMs || 0, energy: A.energy, eMax: A.eMax, state: A.game.state, pos: floorPos(A) };
  ready = false; self.postMessage(msg, [msg.P.buffer, msg.g.buffer, msg.u.buffer, msg.v.buffer, msg.sig.buffer, msg.chem.buffer]);
}
// paced to the clock (RATE seconds of the cell's a second of yours; a slow step just runs slower)
const RATE = 1; let wall = performance.now();
function loop() {
  const now = performance.now(), el = Math.min(0.1, (now - wall) / 1000); wall = now;
  if (A && !paused && A.game.state === "playing") { A.goal = (A.goal ?? A.t) + el * RATE; const t0 = performance.now(); let n = 0;
    while (A.t < A.goal && A.game.state === "playing" && performance.now() - t0 < 40) { play(A); n++; }
    if (A.t < A.goal - 0.2) A.goal = A.t + 0.2;
    if (n) A.stepMs = (performance.now() - t0) / n; }
  if (A && ready) send();
  setTimeout(loop, 8);
}
self.onmessage = (e) => { const m = e.data;
  if (m.type === "level") start(m.level);
  else if (m.type === "generate") { const g = generate(m.seed, m.diff); self.postMessage({ type: "generated", seed: m.seed, diff: m.diff, level: g ? g.level : null, difficulty: g ? g.oracle.difficulty : null }); }
  else if (m.type === "ready") ready = true;
  else if (m.type === "pause") paused = m.on;
  else if (m.type === "steer" && A) A.steer = m.dir ? { dir: Float64Array.from(m.dir), s: m.s ?? 1 } : null;
};
loop();
