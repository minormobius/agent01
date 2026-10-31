// proofs/sidorenko/search.worker.js — homomorphism densities off the main thread. Same engine as the page.
import * as S from './sidorenko.js';

self.onmessage = (e) => {
  const { task } = e.data;
  const say = (msg) => self.postMessage({ task, ...msg });
  const t0 = performance.now();
  if (task === 'host') {
    const { adj, n, exact } = e.data;
    const r = S.ratio(adj, n);
    let ex = null;
    if (exact) { const c = S.exactCompare(adj, n); ex = { sign: c.sign, hom: c.hom.toString(), edges: c.edges.toString() }; }
    say({ done: true, ...r, exact: ex, ms: performance.now() - t0 });
  }
  if (task === 'ladder') {
    const K = (n) => Array.from({ length: n }, (_, i) => ((1 << n) - 1) & ~(1 << i));
    for (let n = 3; n <= e.data.max; n++) { const r = S.ratio(K(n), n); say({ step: 'point', n, ratio: r.ratio }); }
    say({ done: true, ms: performance.now() - t0 });
  }
  if (task === 'random') {
    const rnd = S.rng(e.data.seed), out = [];
    for (let t = 0; t < e.data.count; t++) {
      const n = e.data.nmin + Math.floor(rnd() * (e.data.nmax - e.data.nmin + 1)), p = 0.15 + 0.8 * rnd();
      const adj = S.randomGraph(n, p, rnd); if (adj.every((x) => !x)) continue;
      const r = S.ratio(adj, n); out.push({ n, p: r.p, log10ratio: r.log10ratio });
      say({ step: 'point', n, p: r.p, log10ratio: r.log10ratio });
    }
    say({ done: true, ms: performance.now() - t0 });
  }
};
