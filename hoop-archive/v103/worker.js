// worker.js — v090: generate AND paint a chunk, both off the main thread.
//
// v8's worker only solved the chunk (topology); v090 also runs the voronoi-walls + mega-paint reskin
// here, so the heavy ray-trace never touches the main thread. We post back the v8 record (the page
// needs its cells/rooms/ports for the walk graph + fog) PLUS the painted scene (plain cloneable
// objects — polygons, pre-traced floor colours, deco components, wall lights). The page just draws it.
//
// Same fallback contract as v8: if the platform lacks Workers the page calls solveChunk()+paintChunk()
// synchronously (same modules), so the result is identical either way.

import { solveChunk } from './v8/chunkgen.js';
import { paintChunk } from './skin.js';

self.onmessage = (e) => {
  const { id, opts } = e.data || {};
  try {
    const rec = solveChunk(opts || {});
    rec.seed = (opts && opts.seed) >>> 0;          // the chunk's seed drives its lights + deco genomes
    const painted = paintChunk(rec, (opts && opts.skin) || {});
    self.postMessage({ id, rec, painted }, [rec.road.buffer, rec.roomOf.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack || err) });
  }
};
