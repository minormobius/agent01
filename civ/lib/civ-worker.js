// Client-side compute worker. Runs the deterministic civ sim on a background thread (so the UI
// never freezes) and posts back the same payload the /api/civ/* endpoints return — bit-identical,
// because it imports the SAME shared request logic (mappa/civ/api.js) the edge worker uses.
import { doRun, doFrames, doSweep, doSites, doTimeline, CAP } from './civ-engine.js';

// The browser runs on the user's machine with no edge CPU limit, so it can afford a
// finer mesh than the API will serve (n > CAP.runN is browser-compute only — the edge
// worker rejects it explicitly rather than silently clamping to a different world).
const BROWSER_CAP = { ...CAP, runN: 2600 };

self.onmessage = (e) => {
  const { id, pathname, qs, body } = e.data || {};
  try {
    const params = new URLSearchParams(qs || '');
    let result;
    if (pathname.endsWith('/frames')) result = doFrames(params, BROWSER_CAP);
    else if (pathname.endsWith('/sweep')) result = doSweep(params, body || null, BROWSER_CAP);
    else if (pathname.endsWith('/sites')) result = doSites(params, BROWSER_CAP);
    else if (pathname.endsWith('/timeline')) result = doTimeline(params, BROWSER_CAP);
    else result = doRun(params, BROWSER_CAP);
    // hand back a JSON string: cheaper than structured-cloning the big chronicle object graph.
    self.postMessage({ id, ok: true, json: JSON.stringify(result) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
