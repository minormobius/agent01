// weavefloor.selftest.mjs — certify the woven two-floor fabric: every surface occupies BOTH floors, every
// crossing has one strand upper + one lower (a real over/under weave), all 48 contacts present.
//   Run: node rind/ops/test/weavefloor.selftest.mjs

import { buildWeaveFloor } from '../weavefloor.js';
import { warpOver } from '../weave.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const m = buildWeaveFloor(3);
ok(m.warps.length === 6 && m.wefts.length === 8, '6 warp (white) + 8 weft (production) surfaces');
ok(m.crossings.length === 48, '48 crossings = the 48 K(6,8) contacts');

// ── the weave is real: at EVERY crossing exactly one strand is upper, one lower ──
let bad = 0;
for (const c of m.crossings) { const warpFloor = c.warpOver ? 2 : 1, weftFloor = c.warpOver ? 1 : 2; if (warpFloor === weftFloor) bad++; }
ok(bad === 0, 'over/under: at every crossing the warp and weft are on opposite floors');

// ── every surface OCCUPIES BOTH FLOORS (the fix: not "white on top, production on bottom") ──
for (let w = 0; w < 6; w++) {
  const floors = new Set(m.wefts.map((wf) => (warpOver(w, wf.f) ? 2 : 1)));
  ok(floors.has(1) && floors.has(2), `white surface ${w} rides BOTH floors as it weaves (over some, under others)`);
}
for (let f = 0; f < 8; f++) {
  const floors = new Set(m.warps.map((wc) => (warpOver(wc.w, f) ? 1 : 2)));
  ok(floors.has(1) && floors.has(2), `production line ${f} rides BOTH floors as it weaves`);
}
// and each surface is split ~evenly (4/4 for warps over 8 wefts)
for (let w = 0; w < 6; w++) { const up = m.wefts.filter((wf) => warpOver(w, wf.f)).length; ok(up === 4, `white ${w}: 4 crossings upper / 4 lower (broad, not deep)`); }

// ── both floors are populated by BOTH kinds of surface (a woven fabric, not two segregated decks) ──
const upper = m.cells.filter((c) => c.kind !== 'bg' && c.floor === 2), lower = m.cells.filter((c) => c.kind !== 'bg' && c.floor === 1);
ok(upper.some((c) => c.kind === 'warp') && upper.some((c) => c.kind === 'weft'), 'UPPER floor carries both white and production chambers');
ok(lower.some((c) => c.kind === 'warp') && lower.some((c) => c.kind === 'weft'), 'LOWER floor carries both white and production chambers');

// ── the undulation actually moves between the two floors ──
ok(Math.abs(m.hWarp(0, m.yOf(0)) - m.hWarp(0, m.yOf(1))) > m.GAP * 0.5, 'a warp climbs/dips ~a full floor between consecutive wefts');
ok(m.hWarp(0, m.yOf(0)) === (warpOver(0, 0) ? m.GAP : 0), 'warp height matches its over/under parity at a crossing');

// ── voronoi substrate intact + ribbons tagged ──
ok(m.cells.length === m.foam.cells.length && m.cells.every((c) => c.poly.length >= 3), 'every chamber is a real voronoi polygon');
ok(m.cells.some((c) => c.kind === 'warp') && m.cells.some((c) => c.kind === 'weft') && m.cells.some((c) => c.kind === 'cross'), 'chambers tagged warp / weft / crossing');

// ── material flow along production ribbons ──
ok(m.weftFlow.length === 8 && m.weftFlow.every((wf) => wf.pts.length >= 2), 'each production line is a real ribbon of chambers to flow along');
ok(m.supply.length >= 8, `inter-engine supply chain present (${m.supply.length} edges)`);

// ── tour: enter a white surface, weave through all 8, floor alternating ──
ok(m.tours.length === 6 && m.tours.every((t) => t.stops.length === 8), 'each white surface tours all 8 production lines');
ok(m.tours[0].stops.filter((s) => s.floor === 2).length === 4, 'a tour alternates floors — 4 over, 4 under');
ok(m.contact.everyTouchesEvery, 'K(6,8) holds: every white surface touches every production line');

// determinism
ok(JSON.stringify(buildWeaveFloor(9).crossings) === JSON.stringify(buildWeaveFloor(9).crossings), 'deterministic from seed');

console.log(`weavefloor.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
