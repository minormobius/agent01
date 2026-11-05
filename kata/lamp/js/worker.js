/* LAVALAMP's worker: one dimension's lamp, stepping as fast as it can (the 3D one held to the 4D one's time), posting
   the real half of φ and T, interleaved, as the page's two-channel texture. In 4D it cuts the 3D slice the page asks
   for: gravity stays vertical (y is always one of the slice's directions), and the two across it (E0, E2, unit 4-vectors
   in x, z, w) and the offset along the third (N) can turn. */
import * as Lm from "./lamp.js";
import { makeThreadedFFT } from "./pfft.js";
export const PRESETS = {
  // (the glass lamp: a sharper interface, ε = 0.7, so blobs this small aren't mostly interface; a fifth of the glass
  // wax; a gentler heater)
  lamp: { phys: { glass: true, eps: 0.7, waxShare: 0.2, heat: 0.5, mob: 0.2, cfl: 0.7, flowEvery: 2, coolFrom: 0.65 }, end: 3000 },
  thread: { phys: { g: 0, heat: 0, cool: 0 }, R: 4, n: 3, end: 300 },
  cooling: { phys: { g: 0, heat: 0, cool: 0 }, R: 5, end: 80 },
};
let startGen = 0, L = null, preset = "lamp", running = true, cap = Infinity, rate = 0, gen = 0, slice = { E0: [1, 0, 0], E2: [0, 1, 0], N: [0, 0, 1], off: 0 }, dirty = true, statsAt = -99, S = {};
/* threads for the 4D lamp's FFTs, when the page is cross-origin isolated (SharedArrayBuffer) and there are cores to
   spare: the page's own thread and the 3D lamp's take two */
let pool = null;
export const THREADS = () => (D4 && self.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined" ? Math.max(1, Math.min(maxThreads, 4, (navigator.hardwareConcurrency || 2) - 2)) : 1);
let maxThreads = 4;
let D4 = false;
let note = "", fftImpl = null;
async function start(D, p, seed, over = {}) {
  D4 = D === 4; preset = p; const q = PRESETS[p], n = THREADS();
  if (pool) { pool.close(); pool = null; }
  L = null; note = ""; const myGen = ++startGen;
  if (n > 1) {
    // the lamp's arrays on shared memory, and its transform the threaded one, swapped in once the helpers are up. If
    // they aren't up in 4 s, or anything about them fails (a browser that can't start a worker inside a worker, say),
    // the same lamp runs on this one thread
    const reg = [], alloc = (k) => { const a = new Float64Array(new SharedArrayBuffer(8 * k)); reg.push(a); return a; };
    const dims = [16, 64, 16, 16]; fftImpl = Lm.makeFFTn(dims);
    const Lw = Lm.makeLamp(D, 16, 32, { ...q.phys, ...over }, { alloc, fft: (re, im, inv) => fftImpl(re, im, inv) });
    try {
      const P = await Promise.race([makeThreadedFFT(dims, n, reg), new Promise((_, rej) => setTimeout(() => rej(new Error("the helper threads didn't start within 4 s")), 4000))]);
      if (myGen !== startGen) { P.close(); return; }
      pool = P; fftImpl = P.fft;
    } catch (e) { if (myGen !== startGen) return; note = `one thread (${e.message || e})`; }
    L = Lw;
  } else L = Lm.makeLamp(D, 16, 32, { ...q.phys, ...over });
  if (p === "lamp") Lm.START.lamp(L, seed); else if (p === "thread") Lm.START.thread(L, q.R, q.n); else Lm.START.cooling(L, q.R);
  gen++; cap = D === 3 ? 0 : Infinity; statsAt = -99; post(true);
}
/* the threaded transform failed in the middle of a run: drop the helpers and carry on with one thread */
function oneThread(e) { if (pool) { try { pool.close(); } catch (err) { /* gone already */ } pool = null; } fftImpl = Lm.makeFFTn([16, 64, 16, 16]); note = `one thread (${e.message || e})`; }
function fieldOut() {
  const { nh, ny, D } = L, out = new Float32Array(nh * ny * nh * 2), phi = Lm.realHalf(L, L.phi), T = Lm.realHalf(L, L.T);
  if (D === 3) { for (let p = 0; p < phi.length; p++) { out[2 * p] = phi[p]; out[2 * p + 1] = T[p]; } return out; }
  // 4D: the real half is x + nh(y + ny(z + nh w)); sample across (x, z, w) trilinearly, periodic; y as it is
  const c = nh / 2 - 0.5, s = slice, idx = (x, y, z, w) => x + nh * (y + ny * (z + nh * w)), wrap = (v) => ((v % nh) + nh) % nh;
  for (let k = 0; k < nh; k++) for (let i = 0; i < nh; i++) {
    const h = [0, 1, 2].map((a) => c + (i - c) * s.E0[a] + (k - c) * s.E2[a] + s.off * s.N[a]), f = h.map((v) => v - Math.floor(v)), b = h.map((v) => Math.floor(v));
    for (let y = 0; y < ny; y++) {
      let vp = 0, vt = 0;
      for (let m = 0; m < 8; m++) { let w = 1; const g = [0, 1, 2].map((a) => { const hi = (m >> a) & 1; w *= hi ? f[a] : 1 - f[a]; return wrap(b[a] + hi); }); const q = idx(g[0], y, g[1], g[2]); vp += w * phi[q]; vt += w * T[q]; }
      const o = i + nh * (y + ny * k); out[2 * o] = vp; out[2 * o + 1] = vt;
    }
  }
  return out;
}
function post(force) {
  if (force || L.steps - statsAt >= (L.D === 3 ? 4 : 3)) {
    statsAt = L.steps; S = Lm.stats(L);
    if (preset === "thread") { const r = Lm.ripple(L, PRESETS.thread.n); S.amp = r.amp; S.minArea = r.minArea; S.meanArea = r.meanArea; S.pinched = r.pinched; }
    if (preset === "cooling") S.heat = Lm.heatIn(L, PRESETS.cooling.R);
  }
  postMessage({ gen, D: L.D, field: fieldOut(), stats: { ...S, t: L.t, steps: L.steps, rate, preset, threads: pool ? pool.threads : 1, note } });
  dirty = false;
}
function loop() {
  try {
    if (L && running && L.t < PRESETS[preset].end && L.t < cap) {
      const t0 = performance.now();
      try { Lm.step(L); } catch (e) { if (!pool) throw e; oneThread(e); }
      rate += (1000 / (performance.now() - t0) - rate) * 0.2; if (L.D === 4 || L.steps % 3 === 0) post(false);
    } else if (L && dirty) post(false);
  } catch (e) { postMessage({ gen, error: String((e && e.message) || e) }); L = null; }
  setTimeout(loop, 0);
}
onmessage = (e) => {
  const m = e.data;
  if (m.type === "start") { if (m.threads) maxThreads = m.threads; start(m.D, m.preset, m.seed || 1, m.phys || {}).catch((e) => postMessage({ gen, error: String((e && e.message) || e) })); }
  if (m.type === "slice") { slice = m.slice; dirty = true; }
  if (m.type === "run") running = m.v;
  if (m.type === "cap") cap = m.t;
};
loop();
