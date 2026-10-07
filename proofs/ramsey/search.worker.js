// proofs/ramsey/search.worker.js — the long runs, off the main thread. Same engine as the page.
import * as R from './ramsey.js';

self.onmessage = async (e) => {
  const { task } = e.data;
  const say = (msg) => self.postMessage({ task, ...msg });
  const t0 = performance.now();
  if (task === 'exhaust') {
    const { m, n } = e.data;
    let last = 0;
    const res = R.exhaust(m, n, R.formula(m, n), (v, levels) => { const now = performance.now(); if (now - last > 250) { last = now; say({ step: 'progress', levels: levels.slice() }); } });
    say({ done: true, ...res, ms: performance.now() - t0 });
  }
  if (task === 'replay') {
    const T = await (await fetch('./traces.json')).json();
    const key = new Map(T.records.map((r) => [`${r[0]}|${r[1]}|${JSON.stringify(r[2])}`, r]));
    let batch = [], done = 0;
    for (const [k, t] of R.domain()) for (const p of R.patterns(t, k - t)) {
      const res = R.check(k, t, p), tr = key.get(`${k}|${t}|${JSON.stringify(p)}`);
      const same = !!tr && tr[3] === res.classification && R.flagsHash(R.matrixTriples(res.initial)) === tr[4] && JSON.stringify(res.rounds) === JSON.stringify(tr[5].map((rd) => rd.map(([i, j, d]) => [i, j, d])));
      const valid = !!tr && R.checkTrace(tr).ok;
      batch.push({ k, t, p, c: res.classification, rounds: res.rounds.length, same, valid });
      done++;
      if (batch.length >= 40) { say({ step: 'batch', batch, done }); batch = []; }
    }
    say({ step: 'batch', batch, done });
    say({ done: true, total: done, ms: performance.now() - t0 });
  }
};
