/* PHASELAB's worker: one dimension's run (3D or 4D), stepping as fast as it can (the 3D one held to the 4D one's
   time, so the two show the same moment), posting what the page draws.
   3D: the whole 32³ box. 4D: the 32³ slice the page asks for (a frame E0 E1 E2, its normal N, and the offset along it),
   sampled from the 32⁴ box with quadrilinear interpolation, periodic; so 4 MB never crosses to the page. */
import * as P from "./phase.js";
let ch = null, preset = "unmix", running = true, cap = Infinity, slice = { E: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]], N: [0, 0, 0, 1], off: 0 }, sliceDirty = true, last = 0, rate = 0, gen = 0;
export const PRESETS = { unmix: { phi0: 0, end: 2000 }, emulsion: { phi0: -0.4, end: 1000 }, droplet: { R: 8, bg: -0.9, end: 1500 }, nucleus: { R: 7, bg: -0.9, end: 1000 } };
function start(D, p, seed) {
  preset = p; ch = ch && ch.D === D ? ch : P.makeCH(D, 32); const q = PRESETS[p];
  if (p === "droplet" || p === "nucleus") P.droplet(ch, q.R, q.bg); else P.quench(ch, q.phi0, seed);
  sliceDirty = true; gen++; cap = D === 3 ? 0 : Infinity; post(true);
}
function sliceOf() {
  const N = ch.N, out = new Float32Array(N ** 3), phi = ch.phi, s = slice, c = N / 2, st = [1, N, N * N, N * N * N], x = [0, 0, 0, 0];
  if (ch.D === 3) { for (let p = 0; p < out.length; p++) out[p] = phi[p]; return out; }
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    for (let a = 0; a < 4; a++) x[a] = c + (i - c) * s.E[0][a] + (j - c) * s.E[1][a] + (k - c) * s.E[2][a] + s.off * s.N[a];
    // quadrilinear, periodic
    let v = 0; const f = [0, 0, 0, 0], b = [0, 0, 0, 0];
    for (let a = 0; a < 4; a++) { const fl = Math.floor(x[a]); f[a] = x[a] - fl; b[a] = ((fl % N) + N) % N; }
    for (let m = 0; m < 16; m++) { let w = 1, p = 0; for (let a = 0; a < 4; a++) { const hi = (m >> a) & 1; w *= hi ? f[a] : 1 - f[a]; p += ((b[a] + hi) % N) * st[a]; } v += w * phi[p]; }
    out[i + N * (j + N * k)] = v;
  }
  return out;
}
let statsAt = 0, S = {};
function post(force) {
  const now = performance.now();
  // the measures cost a lot in 4D (a cluster count over a million cells): every few steps
  if (force || ch.steps - statsAt >= (ch.D === 3 ? 4 : 6)) {
    statsAt = ch.steps; S = P.stats(ch);
    if (preset === "droplet" || preset === "nucleus") { S.mu = P.farMu(ch); const plus = P.clusters(ch, 1); S.radii = plus.sizes.map((n) => P.radiusOf(ch.D, n)); }
  }
  postMessage({ gen, D: ch.D, field: sliceOf(), stats: { ...S, t: ch.t, steps: ch.steps, rate, preset } });
  sliceDirty = false;
}
function loop() {
  // a run stops at its preset's end; the 3D run never gets ahead of the 4D one (the page passes the 4D run's time as cap)
  if (ch && running && ch.t < PRESETS[preset].end && ch.t < cap) {
    const t0 = performance.now(); P.step(ch, preset === "droplet" || preset === "nucleus" ? P.dtDrop(ch.t) : P.dtAt(ch.t)); const ms = performance.now() - t0; rate += (1000 / ms - rate) * 0.2;
    if (ch.D === 4 || ch.steps % 3 === 0) post(false);
  } else if (ch && sliceDirty) post(false);
  setTimeout(loop, 0);
}
onmessage = (e) => {
  const m = e.data;
  if (m.type === "start") start(m.D, m.preset, m.seed || 1);
  if (m.type === "slice") { slice = m.slice; sliceDirty = true; if (!running || ch?.D === 4) post(false); }
  if (m.type === "run") running = m.v;
  if (m.type === "cap") cap = m.t;
};
loop();
