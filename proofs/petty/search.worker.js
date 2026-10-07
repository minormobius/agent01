// proofs/petty/search.worker.js — the exact brute-force volumes and the bigger hulls, off the main thread.
import * as P from './petty.js';
const { Q } = P;

self.onmessage = (e) => {
  const { task } = e.data;
  const say = (msg) => self.postMessage({ task, ...msg });
  const t0 = performance.now();
  if (task === 'brute') {
    const parts = e.data.parts, n = parts.reduce((s, a) => s + a, 0), m = parts.reduce((s, a) => s + a + 1, 0);
    let total = 1; for (let i = 0; i < n; i++) total = (total * (m - i)) / (i + 1);
    const gens = P.productAreaNormals(parts);
    say({ step: 'gens', gens: gens.map((g) => g.map((x) => Q.toNumber(x))), total: Math.round(total) });
    const b = P.bruteRatio(parts, (count) => say({ step: 'progress', count, total: Math.round(total) }));
    const c = P.simplexConstant(n), formula = P.partitionRatio(parts);
    say({
      done: true, n, subsets: b.subsets, piVolume: Q.str(b.piVolume), volume: Q.str(P.productVolume(parts)),
      R: Q.str(b.R), Rdec: Q.dec(b.R, 6), c: Q.str(c), cdec: Q.dec(c, 6), over: Q.str(b.overSimplex), overDec: Q.dec(b.overSimplex, 9),
      formula: Q.str(formula), agree: Q.eq(formula, b.overSimplex), beats: Q.cmp(b.overSimplex, Q.of(1)) > 0, ms: performance.now() - t0,
    });
  }
  if (task === 'sphere') {
    const pts = P.spherePoints(e.data.n, P.rng(e.data.seed));
    const B = P.body3(pts);
    say({ done: true, pts, faces: B.faces.map((f) => f.verts), gens: B.gens, R: B.R, volume: B.volume, ms: performance.now() - t0 });
  }
};
