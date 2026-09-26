// band-load.js — render a piece's band, in a worker where the browser allows.
//
//   loadBand(scoreUrl, sampleRate, seconds) -> Promise<{ L, R }>
//
// `scoreUrl` is the absolute URL of the piece's score.js (bandEvents, wet, slap).

import { renderBand } from './band.js';

export function loadBand(score, sampleRate, seconds, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const inThread = async () => {
      try {
        await new Promise((ok) => setTimeout(ok, 0));
        const S = await import(score);
        resolve(renderBand(S.bandEvents, sampleRate, { seconds, wet: S.wet, slap: S.slap, vocal: S.vocal ? S.vocal(sampleRate) : null }));
      } catch (err) { reject(err); }
    };
    let w;
    try { w = new Worker(new URL('./band-worker.js', import.meta.url), { type: 'module' }); }
    catch { w = null; }
    if (!w) { inThread(); return; }
    signal?.addEventListener('abort', () => { w.terminate(); reject(new DOMException('cancelled', 'AbortError')); }, { once: true });
    w.onmessage = (ev) => {
      const m = ev.data;
      w.terminate();
      if (m.type === 'band') resolve({ L: new Float32Array(m.L), R: new Float32Array(m.R) });
      else inThread();
    };
    w.onerror = () => { w.terminate(); inThread(); };
    w.postMessage({ score, sampleRate, seconds });
  });
}
