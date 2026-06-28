// micro.selftest.mjs — the chunk-floor a nave-dweller walks: the office→transit→lower-rind gradient with two
// barriers, the white-collar layer, and the capillary structure (two space-colonization beds that perfuse
// every chamber and cross in 2D — hence the two decks). node hoop/forge/test/micro.selftest.mjs

import { buildMicroChunk, spaceColonize, coverage, bedsCrossInPlane, segsCross, edgesOf, WHITE_COLLAR, DEFAULTS } from '../micro.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── deterministic ──
ok(JSON.stringify(buildMicroChunk(7).walk) === JSON.stringify(buildMicroChunk(7).walk), 'a chunk is a pure function of its seed');

const mc = buildMicroChunk(3);

// ── the directional gradient: three ordered bands, two barriers ──
ok(mc.bands.office.y1 === mc.bands.transit.y0 && mc.bands.transit.y1 === mc.bands.portal.y0, 'three bands stack in order: office → transit → portal');
ok(mc.barriers.length === 2 && mc.barriers[0].y < mc.barriers[1].y, 'two barriers, in order (office/transit, then transit/lower-rind)');
// the portal touches ONLY the transit band → you can reach the lower rind only through material transit
ok(mc.bands.portal.y0 === mc.bands.transit.y1 && mc.bands.portal.y0 > mc.bands.office.y1, 'the lower-rind portal is reachable only from the transit band (not the office)');

// ── the gated walk crosses barrier 1 BEFORE barrier 2, and ends at the portal ──
const ys = mc.walk.map((w) => w.y);
ok(ys[0] < mc.barriers[0].y && ys[ys.length - 1] > mc.barriers[1].y, 'the walk runs from the nave (above) to the lower-rind portal (below)');
let cross1 = -1, cross2 = -1; for (let i = 1; i < mc.walk.length; i++) { if (cross1 < 0 && ys[i] >= mc.barriers[0].y) cross1 = i; if (cross2 < 0 && ys[i] >= mc.barriers[1].y) cross2 = i; }
ok(cross1 > 0 && cross2 > cross1, 'the walk crosses barrier 1 before barrier 2 (must traverse transit to descend)');

// ── chambers live in the transit band (the working floor) ──
ok(mc.chambers.length === DEFAULTS.nChambers, `${mc.chambers.length} production chambers`);
ok(mc.chambers.every((c) => c.y > mc.bands.transit.y0 && c.y < mc.bands.transit.y1), 'every chamber sits in the material-transit band');

// ── the capillary structure: both beds PERFUSE every chamber ──
const cov = coverage(mc);
ok(cov.arterial === cov.total, `the material arterial bed perfuses every chamber (${cov.arterial}/${cov.total})`);
ok(cov.crew === cov.total, `the white-collar crew bed reaches every chamber (${cov.crew}/${cov.total})`);
ok(edgesOf(mc.arterial).length > mc.chambers.length, 'the arterial bed is a real branching tree (more segments than chambers)');

// ── the two beds CROSS in 2D → they can't be coplanar → the two decks are necessary ──
ok(bedsCrossInPlane(mc), 'the arterial & crew beds cross in projection — so they must live on separate decks');
// sanity: the crossing test itself works
ok(segsCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }), 'segsCross detects a proper crossing');
ok(!segsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 }), 'segsCross rejects parallel segments');

// ── the white-collar layer: every office runs a named job ──
ok(mc.offices.length === WHITE_COLLAR.length && mc.offices.every((o) => o.label && o.blurb && o.y < mc.bands.office.y1), 'every office sits in the office band with a named job');
ok(WHITE_COLLAR.some((w) => w.id === 'perfusion') && WHITE_COLLAR.some((w) => w.id === 'gate'), 'the jobs include perfusion-watch and gate-control (cortex over the autonomic bed)');

// ── space colonization reaches a scattered field generally (not just this layout) ──
const pts = Array.from({ length: 24 }, (_, i) => ({ x: 40 + (i % 6) * 60, y: 40 + ((i / 6) | 0) * 60 }));
const sc = spaceColonize({ x: 0, y: 0 }, pts, {});
ok(sc.reached.filter(Boolean).length === pts.length, `space colonization reaches a generic field (${sc.reached.filter(Boolean).length}/${pts.length})`);

// ── chunks vary by seed (not a fixed stamp) ──
ok(JSON.stringify(buildMicroChunk(1).chambers) !== JSON.stringify(buildMicroChunk(2).chambers), 'different seeds give different chunk floors');

console.log(`\nmicro.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
