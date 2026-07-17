// Entry for the browser bundle (civ/lib/civ-engine.js). Re-exports the shared request logic so
// the client can run the sim locally, bit-identically to the edge API. Bundled with esbuild:
//   node scripts/build-civ-engine.mjs   (regenerate civ/lib/civ-engine.js after engine changes)
export { doRun, doFrames, doSweep, doSites, CAP, PRESETS } from '../../mappa/civ/api.js';
export { chronicleHash, loadWorldSpec } from '../../mappa/civ/chronicle.js';
