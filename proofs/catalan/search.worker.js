// proofs/catalan/search.worker.js — replay the certificates off the main thread.
// Same engine as the page.
import * as K from './catalan.js';
const { Q } = K;

self.onmessage = (e) => {
  const { task } = e.data;
  const say = (msg) => self.postMessage({ task, ...msg });
  const t0 = performance.now();
  if (task === 'digits') {
    const g = K.catalanDigits(e.data.digits);
    say({ done: true, ...g, ms: performance.now() - t0 });
  }
  if (task === 'curves') {
    const k = e.data.kappa, out = {};
    for (const fn of ['X', 'Y']) {
      const pts = [], lo = fn === 'X' ? -1 : 0, M = 220;
      for (let i = 0; i <= M; i++) {
        let x = lo + ((1 - lo) * i) / M;
        if (fn === 'X' && Math.abs(x) < 0.004) continue;          // log|x| → −∞ at 0
        if (x <= 0 && fn === 'Y') continue;
        if (x >= 0.998) continue;                                  // log(1 − x) → −∞ at 1
        const q = Q.of(Math.round(x * 1e6), 1000000);
        pts.push([x, K.fixedToNumber(K.barrier(k, fn, q))]);
      }
      out[fn] = pts;
    }
    say({ done: true, kappa: k, curves: out, ms: performance.now() - t0 });
  }
  if (task === 'barriers') {
    const N = { 2: K.numerators(2), 1: K.numerators(1) };
    say({ step: 'numerators', rows: K.DESCARTES.map((r) => ({ key: r.kappa + r.fn, deg: N[r.kappa][r.fn].length - 1, want: r.deg })) });
    const desc = K.DESCARTES.map((r) => {
      const A = N[r.kappa][r.fn], pts = r.points.map(Q.dec), got = [];
      for (let i = 0; i + 1 < pts.length; i++) got.push(K.variations(A, pts[i], pts[i + 1]));
      const br = K.BRACKETS[r.kappa + r.fn], good = br.filter((m) => K.signAt(A, m) * K.signAt(A, m + 2) < 0).length;
      return { key: r.kappa + r.fn, got, want: r.counts, brackets: br.length, good };
    });
    say({ step: 'descartes', rows: desc });
    const vals = K.VALUE_TABLE.map(([k, fn, s, type, bound]) => {
      const v = K.barrier(k, fn, Q.of(s, 10000000000)), m = K.marginTo(bound, v);
      return { k, fn, s, type, bound, value: K.fixedToString(v, 15), ok: m >= 0n && m <= 10n ** 48n + 10n ** 45n };
    });
    say({ step: 'values', rows: vals });
    const norms = [2, 1].map((k) => ({ k, value: K.fixedToString(K.normCombo(k), 15), bound: K.NORM_TABLE[k], ok: K.marginTo(K.NORM_TABLE[k], K.normCombo(k)) >= 0n }));
    say({ step: 'norms', rows: norms });
    say({ done: true, final: [2, 1].map((k) => ({ k, value: K.finalBound(k).map(String).join('/'), dec: Q.toNumber(K.finalBound(k)) })), ms: performance.now() - t0 });
  }
  if (task === 'matrices') {
    const B = K.buildB();
    // a light picture of ℬ: sign and log-magnitude of each entry
    const pic = B.map((row) => row.map((x) => (Q.isZero(x) ? 0 : Q.sign(x) * Math.log10(Math.abs(Q.toNumber(x)) + 1e-300))));
    say({ step: 'built', pic, ms: performance.now() - t0 });
    const res = [0, 1, -1].map((s) => {
      const r = K.pivots101(B, s), d = K.detQ(B, s);
      const prod = r.pivots.reduce((a, p) => (a * BigInt(p)) % 101n, 1n), sign = r.swaps.length % 2 ? 100n : 1n;
      return { s, pivots: r.pivots, want: K.PIVOT_TABLE[s], swaps: r.swaps, wantSwaps: K.SWAP_TABLE[s], nonzero: !Q.isZero(d), numDigits: d[0].toString().replace('-', '').length, denDigits: d[1].toString().length, modCheck: K.toF101(d) === (prod * sign) % 101n };
    });
    say({ done: true, res, ms: performance.now() - t0 });
  }
};
