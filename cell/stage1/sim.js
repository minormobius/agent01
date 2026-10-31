// Stage 1 engine, run as a Web Worker by index.html. Exact Gillespie direct method.
// Events go back to the page with their times so it can draw the activity timeline.
// Gillespie direct method. Species 0..5 mRNA, 6..11 protein (free), 12 complex alpha-beta.
const NG = 6, SC = 12, NR = 27;
let x, p, t = 0, rng, ko = [], nEv = 0;
const a = new Float64Array(NR);
function mulberry32(s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; let q = Math.imul(s ^ s >>> 15, 1 | s); q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q; return ((q ^ q >>> 14) >>> 0) / 4294967296; }; }
function props() {
  for (let g = 0; g < NG; g++) {
    const G = p.genes[g], b = 4 * g;
    let tx = ko[g] ? 0 : G.tx;
    if (G.repressedBy != null) { const r = x[NG + G.repressedBy] / p.K; tx /= 1 + r * r; }
    a[b] = tx; a[b + 1] = p.dm * x[g]; a[b + 2] = G.tl * x[g]; a[b + 3] = p.dp * x[NG + g];
  }
  a[24] = p.kon * x[NG + p.A] * x[NG + p.B];
  a[25] = p.koff * x[SC];
  a[26] = p.dp * x[SC];
}
function fire(r) {
  if (r < 24) { const g = r >> 2, k = r & 3; if (k === 0) x[g]++; else if (k === 1) x[g]--; else if (k === 2) x[NG + g]++; else x[NG + g]--; }
  else if (r === 24) { x[NG + p.A]--; x[NG + p.B]--; x[SC]++; }
  else if (r === 25) { x[NG + p.A]++; x[NG + p.B]++; x[SC]--; }
  else x[SC]--;
}
onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') { p = m.params; x = Int32Array.from(m.x); t = 0; rng = mulberry32(m.seed); ko = m.ko.slice(); nEv = 0; return; }
  if (m.type === 'ko') { ko[m.g] = m.on; return; }
  if (m.type === 'step') {
    const tEnd = t + m.dt, ev = [], MAX = 4000, deadline = performance.now() + 12;
    let dropped = 0;
    for (;;) {
      props();
      let a0 = 0; for (let i = 0; i < NR; i++) a0 += a[i];
      if (a0 <= 0) { t = tEnd; break; }
      const tau = -Math.log(1 - rng()) / a0;
      if (t + tau > tEnd) { t = tEnd; break; } // memoryless: safe to stop here
      t += tau;
      let u = rng() * a0, r = 0;
      while (r < NR - 1 && u >= a[r]) { u -= a[r]; r++; }
      while (a[r] === 0 && r > 0) r--; // float round-off guard
      fire(r); nEv++;
      if (ev.length < MAX * 2) ev.push(r, t); else dropped++;
      if ((nEv & 1023) === 0 && performance.now() > deadline) break; // keep frames smooth
    }
    postMessage({ t, x: Array.from(x), ev, dropped, nEv });
  }
};
