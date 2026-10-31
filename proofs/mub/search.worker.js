// proofs/mub/search.worker.js — the heavier searches, off the main thread. Same engine as the page.
import * as M from './mub.js';

self.onmessage = (e) => {
  const { task } = e.data;
  const say = (msg) => self.postMessage({ task, ...msg });
  const t0 = performance.now();
  if (task === 'grassl') {
    const G = M.grasslVectors({ starts: e.data.starts, seed: e.data.seed, onProgress: (it, found) => say({ step: 'progress', it, found }) });
    const C = M.stageC(G.vectors);
    say({
      done: true, vectors: G.vectors, phases: G.phases, maxResidual: G.maxResidual, firstFull: G.firstFull, starts: G.starts,
      ov: C.ov, maxErr: C.maxErr, margin: C.margin, values: C.values, degrees: C.degrees, cliques: C.cliques, pairs: C.pairs, full: C.full,
      ms: performance.now() - t0,
    });
  }
  if (task === 'search') {
    const { d, k, runs, steps } = e.data, out = [];
    for (let r = 0; r < runs; r++) {
      const res = M.mubSearch(d, k, { steps, seed: 1000 * e.data.seed + r + 1, every: 50, onProgress: (it, f) => { if (it % 500 === 0) say({ step: 'progress', run: r, it, f }); } });
      out.push(res.f);
      say({ step: 'run', run: r, f: res.f, trace: res.trace });
    }
    say({ done: true, fs: out, ms: performance.now() - t0 });
  }
  if (task === 'random') {
    const rnd = M.rng(e.data.seed), Q = M.charges();
    let n = 0, cubic = 0, worstZero = 0, worstH = 0, cubicG = [];
    for (let t = 0; t < e.data.count; t++) {
      const H = M.randomHadamard(rnd); if (!H) continue; n++;
      worstH = Math.max(worstH, M.hadamardError(H));
      const gmax = Math.max(...Q.map((q) => Math.hypot(...M.gValue(H, q.a))));
      if (M.isCubic(H)) { cubic++; cubicG.push(gmax); } else worstZero = Math.max(worstZero, gmax);
      if ((t + 1) % 25 === 0) say({ step: 'progress', t: t + 1, n, cubic, worstZero });
    }
    say({ done: true, n, cubic, worstZero, worstH, cubicMin: Math.min(...cubicG), cubicMax: Math.max(...cubicG), ms: performance.now() - t0 });
  }
};
