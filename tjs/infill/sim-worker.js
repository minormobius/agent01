// Module worker: runs the FDTD acoustic sim off the main thread so the render
// stays smooth. Posts {type:'progress',...} ticks and a final {type:'done',...}.
import { simulate } from './acoustics.js';

self.onmessage = (e) => {
  const params = e.data;
  try {
    const res = simulate(params, (pr) => self.postMessage({ type: 'progress', ...pr }));
    self.postMessage({ type: 'done', freqs: res.freqs, tl: res.tl, tlDisplay: res.tlDisplay, meta: res.meta });
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
