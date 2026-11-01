/* WAVELAB's worker: the water, solved off the page's thread. kata's water (a 3D surface, 64³ samples 0.75 m apart, a
   48 m 3-torus) and ours beside it for comparison (a 2D surface, 128², the same spacing), driven by the page's
   messages. On each tick it moves both clocks on, transforms, and sends back kata's whole surface and the two profiles
   the chart draws: η along a ray from the last pebble, on each water. */
import { Pond } from "./waves.js";
export const N3 = 64, N2 = 128, DX = 0.75;
const P3 = new Pond(3, N3, DX), P2 = new Pond(2, N2, DX), C2 = [(N2 * DX) / 2, (N2 * DX) / 2];
let speed = 1, last = null, dir = [1, 0, 0], compare = false, pend = 0;
const R_MAX = 20, R_STEP = 0.25;
onmessage = (e) => {
  const m = e.data;
  if (m.type === "drop") { P3.drop(m.x, m.a, m.sigma); if (m.compare) { P2.clear(); P2.t = P3.t; P2.drop(C2, m.a, m.sigma); compare = true; last = m.x.slice(); } }
  else if (m.type === "swell") P3.swell(m.n, m.a);
  else if (m.type === "orbital") P3.orbital(m.l, m.k0, m.axis, m.c, m.peak);
  else if (m.type === "depth") { P3.setDepth(m.h); P2.setDepth(m.h); }
  else if (m.type === "clear") { P3.clear(); P2.clear(); compare = false; last = null; }
  else if (m.type === "speed") speed = m.s;
  else if (m.type === "dir") dir = m.d;
  else if (m.type === "tick") {
    pend += m.dt * speed; const dt = Math.min(pend, 0.25); pend = 0;
    P3.advance(dt); P2.advance(dt); P2.t = P3.t;
    const eta = P3.field(); let mx = 0; for (let i = 0; i < eta.length; i++) mx = Math.max(mx, Math.abs(eta[i]));
    let prof3 = null, prof2 = null;
    if (compare && last) {
      P2.field(); prof3 = []; prof2 = [];
      for (let r = 0; r <= R_MAX + 1e-9; r += R_STEP) { prof3.push(P3.at(last.map((v, i) => v + r * dir[i]))); prof2.push(P2.at([C2[0] + r, C2[1]])); }
    }
    const out = Float32Array.from(eta);
    postMessage({ eta: out, t: P3.t, max: mx, prof3, prof2, h: P3.h }, [out.buffer]);
  }
};
