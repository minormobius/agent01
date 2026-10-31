// proofs/hadamard/search.worker.js — run the exhaustive searches off the main thread.
// Same engine as the page.
import { barkerSearch, barkerClass, bruteCirculant, show } from './hadamard.js';

self.onmessage = (e) => {
  const { task, from, to } = e.data;
  for (let n = from; n <= to; n++) {
    const t0 = performance.now();
    if (task === 'barker') {
      const r = barkerSearch(n);
      self.postMessage({ task, n, count: r.seqs.length, classes: new Set(r.seqs.map(barkerClass)).size, example: r.seqs[0] ? show(r.seqs[0]) : null, nodes: r.nodes, ms: performance.now() - t0 });
    } else {
      const rows = bruteCirculant(n);
      self.postMessage({ task, n, count: rows.length, example: rows[0] ? show(rows[0]) : null, nodes: 2 ** n, ms: performance.now() - t0 });
    }
  }
  self.postMessage({ task, done: true });
};
