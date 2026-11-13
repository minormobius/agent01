/* PULL's samples, off the page's thread: every species pulled to failure, seed after seed, a result posted as each finishes */
import { test, SPECIES } from "./bench.js";
self.onmessage = (ev) => { const { seeds } = ev.data; for (let s = 1; s <= seeds; s++) for (const sp of SPECIES) { const r = test({ ...sp.opts, seed: s }, { steps: 110, strain: 0.045 }); self.postMessage({ id: sp.id, seed: s, peak: r.peak, broke: r.brokeAtPeak, slip: r.slipAtPeak, curve: s === 1 ? r.curve : null }); } self.postMessage({ done: true }); };
