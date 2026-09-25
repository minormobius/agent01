// sound-worker.js — renders the episode's soundtrack off the main thread (sound.js), and
// hands back the two channels as transferable buffers.
import { renderEpisode } from './sound.js';
self.onmessage = (e) => {
  const t0 = performance.now();
  const { L, R, rate } = renderEpisode(e.data.rate || 32000);
  self.postMessage({ L, R, rate, ms: performance.now() - t0 }, [L.buffer, R.buffer]);
};
