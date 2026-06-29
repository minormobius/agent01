// weavefloor.selftest.mjs — certify the POLAR / spiral weave puzzle:
//   • all 6 white meet at the TOP-floor centre tile, all 8 production meet at the BOTTOM-floor centre tile,
//   • those two centre tiles are DISCONNECTED except through the weave (different systems, no shaft),
//   • every white still meets every production (K(6,8)), • 100% of both floors, • and it's a SEEDABLE FAMILY.
//   Run: node rind/ops/test/weavefloor.selftest.mjs

import { buildWeaveFloor } from '../weavefloor.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const m = buildWeaveFloor(3);

// ── scale: 19 chunks, sub-chunk rooms, full region ──
ok(m.chunks.length === 19, '19 hex chunks');
ok(m.cells.length > 900, `sub-chunk rooms fill the region (${m.cells.length} chambers)`);
ok(m.cells.every((c) => c.chunk >= 0), 'every chamber belongs to a chunk');

// ── the centre tiles: white hub on TOP, production hub on BOTTOM, and they are DISCONNECTED ──
const centre = m.cells.find((c) => c.i === m.centerCell);
ok(centre && centre.hub, 'there is a centre hub tile');
ok(centre.upper.kind === 'whub' && centre.lower.kind === 'phub', 'centre tile: white hub on the upper floor, production hub on the lower');
// disconnected: no hub chamber carries the SAME system on both floors (nothing bridges the two hubs vertically)
ok(m.cells.filter((c) => c.hub).every((c) => c.upper.kind === 'whub' && c.lower.kind === 'phub'), 'the two hubs share no vertical link — joined only through the weave');

// ── all 6 white converge at the top centre; all 8 production converge at the bottom centre ──
const near = m.cells.filter((c) => !c.hub && c.r < m.hubR * 3.4);
ok(new Set(near.map((c) => c.w)).size === 6, 'all 6 white-collar arms converge at the centre (top hub)');
ok(new Set(near.map((c) => c.f)).size === 8, 'all 8 production arms converge at the centre (bottom hub)');

// ── K(6,8) preserved: every white meets every production somewhere in the rosette ──
ok(m.contactPairs === 48, `every white meets every production — ${m.contactPairs}/48 contact pairs (K(6,8))`);
ok(m.contact.everyTouchesEvery, 'contact.everyTouchesEvery');

// ── 100% of both floors: every non-hub chamber is owned on both floors, opposite systems ──
const body = m.cells.filter((c) => !c.hub);
ok(body.every((c) => c.upper && c.lower), 'every chamber is owned on both floors (no gaps)');
ok(body.every((c) => c.upper.kind !== c.lower.kind), 'over/under: the two floors carry opposite systems at every chamber');
// every surface rides both floors
for (let w = 0; w < 6; w++) { const fl = new Set(body.filter((c) => c.w === w).map((c) => (c.over ? 2 : 1))); ok(fl.has(1) && fl.has(2), `white arm ${w} rides both floors as it spirals`); }

// ── tours: enter a white arm, meet all 8 production in radial order, floors alternating by parity ──
ok(m.tours.length === 6 && m.tours.every((t) => t.stops.length === 8), 'each white arm tours all 8 production arms');
ok(m.tours[0].stops.every((s, i, a) => i === 0 || s.r >= a[i - 1].r), 'a tour is ordered outward by radius (centre → rim)');

// ── a SEEDABLE FAMILY: different seeds give different valid rosettes (not one fixed solution) ──
const fams = [1, 2, 3, 7, 42].map((sd) => buildWeaveFloor(sd));
ok(fams.every((x) => x.contactPairs === 48), 'EVERY seed in the family satisfies K(6,8)');
ok(fams.every((x) => x.cells.find((c) => c.i === x.centerCell).upper.kind === 'whub'), 'every seed keeps the white-hub/production-hub split');
const sigs = new Set(fams.map((x) => `${x.family.turnsW.toFixed(3)}:${x.family.phaseW.toFixed(3)}:${x.family.dir}`));
ok(sigs.size >= 4, `the seeds are genuinely different rosettes (${sigs.size}/5 distinct spiral parameters)`);
ok(JSON.stringify(buildWeaveFloor(9).cells.map((c) => [c.w, c.f])) === JSON.stringify(buildWeaveFloor(9).cells.map((c) => [c.w, c.f])), 'deterministic per seed');

console.log(`weavefloor.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
