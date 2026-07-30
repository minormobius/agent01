// walkextend.selftest — proves the INCREMENTAL nav-mesh stitch (extendWalk) produces a graph IDENTICAL
// to a full buildWalk, over a real multi-chunk streamed world. This is the safety net for the perf fix
// that took the frontier hitch from O(all 54 chunks) every stream down to O(one new chunk).
import { createWorld, addChunk, buildWalk, extendWalk, neighbourSpec, edgeFree, globalOf } from '../v8/manager.js';
import { solveChunk } from '../v8/chunkgen.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const OPTS = { shape: 'hex', cellSize: 16, oxygenReach: 3, concourseWidth: 2, roomSize: 16 };

// neighbor sets, deduped + sorted — connectivity is what pathFind/sightBall depend on (dup edges are harmless)
const adjSets = (w) => w.adj.map((a) => [...new Set(a)].sort((x, y) => x - y).join(','));
function sameGraph(a, b, label) {
  if (a.N !== b.N) { ok(false, `${label}: N ${a.N} vs ${b.N}`); return; }
  let posOk = true, ncOk = true, adjOk = true;
  for (let i = 0; i < a.N; i++) { if (a.pos[2 * i] !== b.pos[2 * i] || a.pos[2 * i + 1] !== b.pos[2 * i + 1]) posOk = false; if (a.nodeChunk[i] !== b.nodeChunk[i] || a.nodeLocal[i] !== b.nodeLocal[i]) ncOk = false; }
  const sa = adjSets(a), sb = adjSets(b); for (let i = 0; i < a.N; i++) if (sa[i] !== sb[i]) { adjOk = false; break; }
  const baseOk = JSON.stringify(a.base) === JSON.stringify(b.base);
  ok(posOk && ncOk && adjOk && baseOk, `${label}: incremental graph == full rebuild (N=${a.N}, pos:${posOk} nodeMap:${ncOk} adj:${adjOk} base:${baseOk})`);
}

const world = createWorld();
addChunk(world, solveChunk({ seed: 7, ...OPTS }));
let walkInc = buildWalk(world, null);             // chunk 0 — same both ways
sameGraph(walkInc, buildWalk(world, null), 'chunk 0');

let seed = 1000, streamed = 0;
for (let s = 0; s < 6; s++) {
  let found = null;
  outer: for (const ch of world.chunks) for (let e = 0; e < ch.poly.length; e++) if (edgeFree(world, ch, e)) { found = { id: ch.id, e }; break outer; }
  if (!found) break;
  const spec = neighbourSpec(world, found.id, found.e);
  const rec = solveChunk({ seed: seed++, poly: spec.poly, inherit: spec.inherit, ...OPTS });
  addChunk(world, rec);
  extendWalk(walkInc, world, rec.id, null);       // the incremental stitch under test
  sameGraph(walkInc, buildWalk(world, null), `after streaming chunk ${rec.id}`);
  streamed++;
}
ok(streamed >= 3, `streamed + stitched ${streamed} neighbour chunks (${world.chunks.length} total)`);

// and the seam actually CONNECTS: a port cell of chunk 0 reaches a node of the last chunk (graph is one piece)
const reach = (w, src) => { const seen = new Set([src]), q = [src]; for (let h = 0; h < q.length; h++) for (const v of w.adj[q[h]]) if (!seen.has(v)) { seen.add(v); q.push(v); } return seen; };
const comp = reach(walkInc, 0);
const lastId = world.chunks[world.chunks.length - 1].id, lastBase = walkInc.base[lastId];
ok([...comp].some((n) => walkInc.nodeChunk[n] === lastId), 'the incrementally-stitched world is ONE connected component (seams crossable)');

console.log(`walkextend.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
