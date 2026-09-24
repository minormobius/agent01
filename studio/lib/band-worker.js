// band-worker.js — renders a piece's band (lib/band.js) off the main thread.
//
// The score module is imported here by URL, because its room functions (wet,
// slap) cannot cross postMessage. It must export bandEvents, and may export
// wet and slap.

import { renderBand } from './band.js';

self.onmessage = async (ev) => {
  const { score, sampleRate, seconds } = ev.data;
  try {
    const S = await import(score);
    const { L, R } = renderBand(S.bandEvents, sampleRate, { seconds, wet: S.wet, slap: S.slap });
    self.postMessage({ type: 'band', L: L.buffer, R: R.buffer }, [L.buffer, R.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.message || err) });
  }
};
