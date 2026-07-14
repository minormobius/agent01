// Client-side compute worker. Runs the deterministic civ sim on a background thread (so the UI
// never freezes) and posts back the same payload the /api/civ/* endpoints return — bit-identical,
// because it imports the SAME shared request logic (mappa/civ/api.js) the edge worker uses.
import { doRun, doFrames, doSweep } from './civ-engine.js';

self.onmessage = (e) => {
  const { id, pathname, qs, body } = e.data || {};
  try {
    const params = new URLSearchParams(qs || '');
    let result;
    if (pathname.endsWith('/frames')) result = doFrames(params);
    else if (pathname.endsWith('/sweep')) result = doSweep(params, body || null);
    else result = doRun(params);
    // hand back a JSON string: cheaper than structured-cloning the big chronicle object graph.
    self.postMessage({ id, ok: true, json: JSON.stringify(result) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
