// micro.selftest.mjs — the chunk floor a nave-dweller walks: the office→floor→lower-rind gradient with two
// barriers, the white-collar layer, and the capillary structure as WOVEN SURFACES — two broad phase-boundary
// sheets that cross over-under (a weave), bounding three layers, with every office in contact with every
// production facility (broad, not deep). node hoop/forge/test/micro.selftest.mjs

import { buildMicroChunk, contact, weaveStats, WHITE_COLLAR, DEFAULTS } from '../micro.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── deterministic ──
ok(JSON.stringify(buildMicroChunk(7).facilities) === JSON.stringify(buildMicroChunk(7).facilities), 'a chunk is a pure function of its seed');

const mc = buildMicroChunk(3);

// ── the directional gradient: three ordered layers (top=office/inner … bottom=portal/outer), two barriers ──
ok(mc.bands.portal.z1 === mc.bands.floor.z0 && mc.bands.floor.z1 === mc.bands.office.z0, 'three layers stack in order: portal (bottom) → floor → office (top)');
ok(mc.bands.office.z0 > mc.bands.floor.z0 && mc.bands.floor.z0 > mc.bands.portal.z0, 'office is inner (top), portal is outer (bottom)');
ok(mc.barriers.length === 2 && mc.barriers[0].z > mc.barriers[1].z, 'two barriers (office/floor above, floor/portal below)');
// the portal touches ONLY the floor → the lower rind is reachable only by crossing the production floor
ok(mc.bands.portal.z1 === mc.bands.floor.z0 && mc.bands.portal.z1 < mc.bands.office.z0, 'the lower-rind portal is reachable only through the production floor');

// ── SURFACES, not nodes: two broad sheets, three layers tops (broad, not deep) ──
ok(mc.surfaces.white.length > 50 && mc.surfaces.material.length > 50, 'the systems are broad SAMPLED SURFACES, not node graphs');
ok(mc.layers.length === 3, `three layers tops (${mc.layers.length}): ${mc.layers.join(' · ')}`);
ok(Object.keys(mc.surfaces).length === 2, 'two phase-boundary surfaces bound the three layers');

// ── the WEAVE: the two sheets cross over-under, and "over" alternates ──
const ws = weaveStats(mc);
ok(ws.crossings >= mc.nLobes, `the sheets cross many times — a weave (${ws.crossings} crossings)`);
ok(ws.woven, 'the weave is genuine over-under (the "over" sheet alternates at each crossing)');
ok(mc.facilities.length === ws.crossings, 'a production facility sits at every weave crossing');

// ── the directionality: white-collar leans toward the office (up), material toward the lower rind (down) ──
const meanZ = (s) => s.reduce((a, p) => a + p.z, 0) / s.length;
ok(meanZ(mc.surfaces.white) > meanZ(mc.surfaces.material), 'the white-collar sheet leans up (office); the material sheet leans down (lower rind)');
ok(meanZ(mc.surfaces.white) < mc.bands.office.z0 && meanZ(mc.surfaces.material) > mc.bands.portal.z1, 'both sheets still live in/around the production floor (they weave there)');

// ── BROAD, NOT DEEP: every office touches every production facility (complete bipartite via broad sheets) ──
const c = contact(mc);
ok(c.facCovered, 'every facility is in contact with BOTH broad sheets (broad coverage)');
ok(c.complete && c.pairs === mc.offices.length * mc.facilities.length, `every office touches every production facility (${c.pairs} pairs, complete)`);
ok(c.layers <= 3, 'broad, not deep — three layers tops');

// ── the white-collar layer: every office runs a named job, on the white sheet ──
ok(mc.offices.length === WHITE_COLLAR.length && mc.offices.every((o) => o.label && o.blurb), 'every office runs a named job (the cortex over the autonomic floor)');
ok(WHITE_COLLAR.some((w) => w.id === 'perfusion') && WHITE_COLLAR.some((w) => w.id === 'gate'), 'the jobs include perfusion-watch and gate-control');

// ── the gated walk crosses barrier 1 (onto the floor) before barrier 2 (descend), ending at the portal ──
const zs = mc.walk.map((w) => w.z);
ok(zs[0] > mc.barriers[0].z && zs[zs.length - 1] < mc.barriers[1].z, 'the walk runs from the nave (top) down to the lower-rind portal (bottom)');
let c1 = -1, c2 = -1; for (let i = 1; i < zs.length; i++) { if (c1 < 0 && zs[i] <= mc.barriers[0].z) c1 = i; if (c2 < 0 && zs[i] <= mc.barriers[1].z) c2 = i; }
ok(c1 > 0 && c2 > c1, 'the walk crosses barrier 1 before barrier 2 (must traverse the floor to descend)');

// ── chunks vary by seed ──
ok(JSON.stringify(buildMicroChunk(1).facilities) !== JSON.stringify(buildMicroChunk(2).facilities), 'different seeds give different chunk floors');

console.log(`\nmicro.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
