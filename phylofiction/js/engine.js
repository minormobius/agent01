/* phylofiction — engine selector.
 *
 * Prefers the Rust/WASM engine (the user asked for the computation in Rust in
 * the browser); falls back to the pure-JS engine if WASM can't load (old
 * browser, file:// origin, fetch blocked). Both backends are bit-identical, so
 * the fallback is seamless — the same seed yields the same tree of life either
 * way. Mirrors mappa's "optional accelerator with a JS fallback" pattern.
 */

import { evolveWorld as jsEvolve, findSeed as jsFindSeed } from "./evolve.js";
import { loadWasmEngine } from "./wasm.js";

// the predicate behind "find a Great Oxidation" — kept identical to the Rust
// find_seed() so both backends surface the same seed.
const INTERESTING = (w) => w.summary.oxygenated && w.score.reversal > 0.2;

export async function initEngine() {
  try {
    return await loadWasmEngine();
  } catch (err) {
    console.warn("[phylofiction] WASM unavailable — using JS engine:", err && err.message);
    return {
      backend: "js",
      version: 0,
      evolveWorld: jsEvolve,
      findOxygenation: (start, limit = 600) => {
        const hit = jsFindSeed(INTERESTING, start, limit);
        return hit ? hit.n : null;
      },
    };
  }
}
