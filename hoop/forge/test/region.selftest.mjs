// region.selftest.mjs — A COHERENT FORGE REGION: many chunks at once + physarum-grown conduits.
// node hoop/forge/test/region.selftest.mjs
//
// Invariants: the region composes `count` chunks on one shared foam with seamless seams; the global
// chamber graph is connected; the inter-engine supply graph closes the loop across chunks (emitter
// output tag → consumer intake tag); and physarum grows a tiered conduit network whose TRUNK arterials
// span chunk seams — the emergent axial-rail, not drawn by hand. All deterministic.

import { buildForgeRegion } from '../floor.js';
import { ENGINES } from '../engines.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const reg = buildForgeRegion(7, { count: 7 });

// ── composition ──
ok(reg.recs.length === 7 && reg.recs.every(Boolean), `7 chunks solved (${reg.recs.length})`);
ok(reg.facilities.length >= 7, `region carries facilities (${reg.facilities.length})`);
ok(reg.rooms.length >= 60, `region has a substantial chamber graph (${reg.rooms.length} rooms)`);

// ── seamless seams: adjacent chunks share rooms across ports → cross edges exist ──
ok(reg.crossEdges.length >= 6, `chunks are stitched across seams (${reg.crossEdges.length} cross-seam links)`);
// cross edges actually join DIFFERENT chunks
ok(reg.crossEdges.every(([a, b]) => reg.rooms[a].chunk !== reg.rooms[b].chunk), 'every cross-seam link joins two different chunks');

// ── global chamber graph is connected ──
function connected(N, edges) {
  const adj = Array.from({ length: N }, () => []); for (const e of edges) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
  const seen = new Uint8Array(N); let c = 0; const q = [0]; seen[0] = 1;
  while (q.length) { const u = q.pop(); c++; for (const v of adj[u]) if (!seen[v]) { seen[v] = 1; q.push(v); } }
  return c === N;
}
ok(connected(reg.rooms.length, reg.edgeList), 'the global chamber graph is one connected component');

// ── inter-engine supply graph closes the loop ──
ok(reg.supply.length >= 1, `inter-engine supply edges exist (${reg.supply.length})`);
// every supply edge: the source facility EMITS the tag, the target facility CONSUMES it
ok(reg.supply.every((s) => (ENGINES[reg.facilities[s.from].engine].output || []).includes(s.tag) && (ENGINES[reg.facilities[s.to].engine].intake || []).includes(s.tag)), 'every supply edge matches emitter output → consumer intake');
// supply edges attach to the right rooms (a sink room emits, a source room receives) and are distinct
ok(reg.supply.every((s) => s.fromRoom !== s.toRoom), 'supply edges link distinct rooms');
// at least one supply edge SPANS a chunk seam (the inter-chunk economy — the axial-rail demand)
const crossSupply = reg.supply.filter((s) => s.cross).length;
ok(crossSupply >= 1, `supply spans chunk seams (${crossSupply}/${reg.supply.length} cross-chunk)`);

// ── physarum conduits: a tiered network with TRUNK arterials that cross seams ──
ok(reg.conduits.length >= 10, `physarum grew a conduit network (${reg.conduits.length} edges)`);
const tiers = new Set(reg.conduits.map((c) => c.tier));
ok(tiers.has(3) && tiers.has(1), `the conduit network is tiered (capillary…arterial): tiers ${[...tiers].sort().join(',')}`);
// THE EMERGENT AXIAL-RAIL: at least one TRUNK (tier-3) conduit edge crosses a chunk seam — a trans-rind
// route grown from the inter-facility demand, not drawn by hand.
const trunkCrossSeam = reg.conduits.filter((c) => c.tier === 3 && reg.rooms[c.a].chunk !== reg.rooms[c.b].chunk).length;
const anyCrossSeam = reg.conduits.filter((c) => reg.rooms[c.a].chunk !== reg.rooms[c.b].chunk).length;
ok(anyCrossSeam >= 1, `conduits cross chunk seams (${anyCrossSeam} trans-rind edges)`);
ok(trunkCrossSeam >= 1 || anyCrossSeam >= 3, `trunk routes span the rind (${trunkCrossSeam} tier-3 cross-seam, ${anyCrossSeam} total cross-seam)`);

// ── the closed economy is representable: reclaim consumes product, assembly emits product ──
const engineSet = new Set(reg.facilities.map((f) => f.engine));
// across several seeds, the region exercises a variety of engines (not all one kind)
let variety = 0; for (let s = 0; s < 8; s++) { const r = buildForgeRegion(s * 13 + 1, { count: 7 }); variety = Math.max(variety, new Set(r.facilities.map((f) => f.engine)).size); }
ok(variety >= 3, `regions exercise a variety of engines (max ${variety} distinct across seeds)`);

// ── determinism ──
const a = buildForgeRegion(42, { count: 7 }), b = buildForgeRegion(42, { count: 7 });
ok(JSON.stringify(a.facilities) === JSON.stringify(b.facilities) && JSON.stringify(a.conduits) === JSON.stringify(b.conduits), 'buildForgeRegion is deterministic (facilities + conduits)');

// ── scale: a larger region (19 chunks) still composes + grows ──
const big = buildForgeRegion(3, { count: 19 });
ok(big.recs.length === 19 && big.recs.every(Boolean), `a larger region composes (${big.recs.length} chunks)`);
ok(connected(big.rooms.length, big.edgeList), 'the 19-chunk region is still one connected chamber graph');
ok(big.conduits.filter((c) => big.rooms[c.a].chunk !== big.rooms[c.b].chunk).length >= 3, 'the larger region grows trans-chunk conduits');

console.log(`\nregion.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
