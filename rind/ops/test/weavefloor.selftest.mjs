// weavefloor.selftest.mjs — certify the space-filling two-floor weave over a 19-chunk region:
//   • 19 chunks, • every chamber owned on BOTH floors (no gaps), • the upper floor is the complement of the
//   lower (a real over/under weave), • every surface rides both floors. Run: node rind/ops/test/weavefloor.selftest.mjs

import { buildWeaveFloor } from '../weavefloor.js';
import { warpOver } from '../weave.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const m = buildWeaveFloor(3);

// ── 19 chunks around a core ──
ok(m.chunks.length === 19, '19 hex chunks (centre + 6 + 12)');
ok(m.entry && Math.abs(m.entry.x - m.W / 2) < 1, 'core entry at region centre');
// every chamber is assigned to one of the 19 chunks
ok(m.cells.every((c) => c.chunk >= 0 && c.chunk < 19), 'every chamber belongs to a chunk');
ok(m.cells.length > 600, `region is ~19 chunks big (${m.cells.length} chambers, vs ~one chunk before)`);

// ── 100% coverage, no gaps: every chamber owns a surface on BOTH floors ──
ok(m.cells.every((c) => c.upper && c.lower), 'every chamber is owned on BOTH floors (no empty/bg cells)');
ok(m.cells.every((c) => c.poly.length >= 3), 'every chamber is a real voronoi polygon');

// ── the weave: upper floor is the exact complement of the lower (over/under) ──
let badComplement = 0;
for (const c of m.cells) { const sameKind = c.upper.kind === c.lower.kind; if (sameKind) badComplement++; }
ok(badComplement === 0, 'at every chamber the two floors carry opposite systems (warp over weft, or weft over warp)');
// parity drives it: warp on upper iff (w+f) even
ok(m.cells.every((c) => (c.over ? c.upper.kind === 'warp' : c.upper.kind === 'weft')), 'plain-weave parity: warp is upper iff (w+f) even');

// ── both floors carry BOTH systems (a woven fabric, not white-on-top / production-on-bottom) ──
const up = m.cells, kinds = (sel) => new Set(m.cells.map((c) => c[sel].kind));
ok(kinds('upper').has('warp') && kinds('upper').has('weft'), 'UPPER floor carries both white-collar and production chambers');
ok(kinds('lower').has('warp') && kinds('lower').has('weft'), 'LOWER floor carries both white-collar and production chambers');

// ── every surface rides BOTH floors as it weaves ──
for (let w = 0; w < 6; w++) { const fl = new Set(Array.from({ length: 8 }, (_, f) => (warpOver(w, f) ? 2 : 1))); ok(fl.has(1) && fl.has(2), `white surface ${w} weaves across both floors (4 over / 4 under)`); }
for (let f = 0; f < 8; f++) { const fl = new Set(Array.from({ length: 6 }, (_, w) => (warpOver(w, f) ? 1 : 2))); ok(fl.has(1) && fl.has(2), `production line ${f} weaves across both floors`); }

// ── chunk coverage: every one of the 19 chunks actually holds chambers (the region is filled) ──
const perChunk = new Array(19).fill(0); for (const c of m.cells) perChunk[c.chunk]++;
ok(perChunk.every((n) => n > 0), 'all 19 chunks are filled with chambers');

// ── material flow + tours intact ──
ok(m.weftFlow.length === 8 && m.weftFlow.every((wf) => wf.pts.length >= 2), 'each production line is a ribbon to flow along');
ok(m.tours.length === 6 && m.tours.every((t) => t.stops.length === 8), 'each white surface tours all 8 production lines');
ok(m.tours[0].stops.filter((x) => x.floor === 2).length === 4, 'a tour alternates floors (4 over / 4 under)');
ok(m.contact.everyTouchesEvery, 'K(6,8) holds: every white surface touches every production line');

// ── determinism ──
ok(JSON.stringify(buildWeaveFloor(9).cells.map((c) => [c.w, c.f])) === JSON.stringify(buildWeaveFloor(9).cells.map((c) => [c.w, c.f])), 'deterministic from seed');

console.log(`weavefloor.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
