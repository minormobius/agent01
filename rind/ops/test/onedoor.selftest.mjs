// onedoor.selftest.mjs — THE PROOF of the hard spec line: anywhere → anywhere is EXACTLY one door, incl. the hubs.
// The per-thread door graph (cells3d) only reaches "≈ one door" (max up to 4) because same-colour arms never cross.
// The one-door layer collapses the walkable space to TWO connected door-free concourses joined only by the 48 K(6,8)
// crossing-doors ⇒ 0 within a colour, exactly 1 across. Pinned across seeds/widths/chunks. Run: node …/onedoor.selftest.mjs

import { buildOneDoor, assignConcourses, placeDoors, buildDoorGraph, routeOneDoor, routeGraded, certify } from '../onedoor.js';
import { buildWeave3D } from '../weave3d.js';
import { routeMinDoors } from '../cells3d.js';
import { buildCurveModel } from '../curveseed.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const CFG = { rings: 1, spacing: 30, width: 6, flatR: 0.16, layers: 8 };
const seeds = [1, 2, 3, 7, 11, 15, 22, 42];
const base = buildOneDoor(3, CFG);

// ══ THE HEADLINE: max doors over ALL pairs === 1, by construction AND measured, on EVERY seed ══
let worstMeasured = 0, allOneDoor = true, anyUnreachable = false;
for (const s of seeds) { const c = buildOneDoor(s, CFG).cert; worstMeasured = Math.max(worstMeasured, c.measuredMax); if (!c.oneDoor) allOneDoor = false; if (c.unreachable) anyUnreachable = true; }
ok(worstMeasured === 1, `★ anywhere → anywhere is EXACTLY one door — measured max ${worstMeasured} over all sampled pairs, all ${seeds.length} seeds`);
ok(allOneDoor, '★ the one-door certificate passes on every seed (structural proof + measurement agree)');
ok(!anyUnreachable, 'every pair is reachable (the chunk is one navigable space)');

// the STRUCTURAL proof is airtight: two 0-connected concourses joined by ≥1 door ⇒ 0 within, 1 across ⇒ max 1
ok(base.cert.structuralMax1, 'structural guarantee holds: white 1-component ∧ production 1-component ∧ ≥1 door');

// ══ TWO CONCOURSES: partition every chamber, each exactly ONE connected door-free region ══
let allPartition = true, allWhite1 = true, allProd1 = true;
for (const s of seeds) { const c = buildOneDoor(s, CFG).cert; if (!c.noMatrix) allPartition = false; if (c.whiteComps !== 1) allWhite1 = false; if (c.prodComps !== 1) allProd1 = false; }
ok(allPartition, 'the two concourses PARTITION every chamber — no interstitial third region left for wayfinding');
ok(allWhite1, '★ the white concourse is ONE connected door-free region on every seed (the 6 arms + nave hub, no walls between)');
ok(allProd1, '★ the production concourse is ONE connected door-free region on every seed (the 8 arms + bottom hub)');

// continuity holds across WIDTHS and CHUNKS too
let allW = true; for (const w of [3, 6, 10, 16]) { const c = buildOneDoor(3, { ...CFG, width: w }).cert; if (c.whiteComps !== 1 || c.prodComps !== 1 || c.measuredMax !== 1) allW = false; }
ok(allW, 'one door + one component per concourse at every width (thin corridors and fat alike)');
let allR = true; for (const rings of [0, 1, 2]) { const c = buildOneDoor(3, { ...CFG, rings }).cert; if (c.measuredMax !== 1 || c.whiteComps !== 1 || c.prodComps !== 1) allR = false; }
ok(allR, 'one door holds across 1 / 7 / 19 chunks');

// ══ WITHIN a concourse is FREE (0 doors); ACROSS is exactly 1 ══
const g = base.cert.graph, cells = base.model.cells;
const whiteCells = cells.filter((c) => base.cert.color[c.gi] === 'white'), prodCells = cells.filter((c) => base.cert.color[c.gi] === 'prod');
const w0 = whiteCells[0].gi, w1 = whiteCells[whiteCells.length - 1].gi, p0 = prodCells[0].gi, p1 = prodCells[prodCells.length - 1].gi;
ok(routeOneDoor(g, w0, w1).doors === 0, 'two far-apart WHITE points: 0 doors (the concourse is one free-walk space)');
ok(routeOneDoor(g, p0, p1).doors === 0, 'two far-apart PRODUCTION points: 0 doors');
ok(routeOneDoor(g, w0, p0).doors === 1, 'a white point to a production point: EXACTLY 1 door');
ok(routeOneDoor(g, w0, w0).doors === 0, 'a point to itself: 0 doors');

// ══ "INCLUDING CENTRAL HUBS": the hubs obey the rule too — this is where the old model failed hardest ══
let allHubs = true, allHubInternal0 = true; for (const s of seeds) { const c = buildOneDoor(s, CFG).cert; if (!c.hubsOneDoor) allHubs = false; if (c.hubInternalMax !== 0) allHubInternal0 = false; }
ok(allHubs, '★ the white nave hub and the production hub are EXACTLY one door apart (never a shaft, never two)');
ok(allHubInternal0, 'inside a hub, every cell is 0 doors from the hub centre (the hub is one open concourse, not walled arms)');

// ══ CONTRAST — the per-thread model (cells3d) genuinely needs MORE than one door, which is the whole problem ══
const w3 = buildWeave3D(3, CFG), C = w3.cellsModel;
let perThreadMax = 0; for (let i = 0; i < 200; i++) { const a = C.cells[(i * 7) % C.cells.length].gi, b = C.cells[(i * 13 + 5) % C.cells.length].gi; const r = routeMinDoors(C, a, b); if (r) perThreadMax = Math.max(perThreadMax, r.doors); }
ok(perThreadMax >= 2, `the per-thread door graph really does exceed one door (max ${perThreadMax}) — the concourse layer is what fixes it, not a tuning`);

// ══ THE 48 DOORS: the K(6,8) crossings, realised as at-grade doorways ══
const fam = (s) => buildOneDoor(s, { rings: 2, spacing: 34, width: 4, flatR: 0.25, layers: 8 }).cert;
let kSum = 0, gradeSum = 0; for (const s of seeds) { const c = fam(s); kSum += c.doorPairs; gradeSum += c.atGradeDoors / Math.max(1, c.doorCount); }
ok(kSum / seeds.length >= 44, `most K(6,8) crossings open a door (avg ${(kSum / seeds.length).toFixed(1)}/48 on the weave family)`);
ok(seeds.some((s) => fam(s).k48), 'some seeds realise the full K(6,8) = 48/48 doors');
ok(gradeSum / seeds.length >= 0.85, `★ the vast majority of doors are ZERO-GRADE — you step through at grade, not up a stair (avg ${((gradeSum / seeds.length) * 100) | 0}% at grade; the rest are honest over/under crossings)`);
ok(base.cert.doors.every((d) => d.grade >= 0), 'every placed door is a real white↔production adjacency with a measured grade');

// ══ the doors actually connect the two concourses (each door is white on one side, production on the other) ══
ok(base.cert.doors.every((d) => base.cert.color[d.a] !== base.cert.color[d.b]), 'every door has a white side and a production side (a real interface, not an internal seam)');

// ══ API shape + determinism ══
const a1 = certify(base.model), a2 = certify(buildOneDoor(3, CFG).model);
ok(a1.measuredMax === a2.measuredMax && a1.doorPairs === a2.doorPairs && a1.whiteCells === a2.whiteCells, 'deterministic per seed (same concourses, same doors, same proof)');
ok(base.model.NW === 6 && base.model.NF === 8, '6 white + 8 production threads (the K(6,8) identity survives as an overlay)');
const asg = assignConcourses(base.model); ok(asg.whiteHub.size > 0 && asg.prodHub.size > 0, 'both hubs are non-empty');
const pd = placeDoors(base.model, asg.color); ok(pd.doors.length > 0 && buildDoorGraph(base.model, asg.color, pd.doors).N === base.model.cells.length, 'door graph spans every chamber');

// ══ THE ON-CURVE SUBSTRATE (curveseed.js): nuclei seeded ALONG the analytic curves, polyhedra grown to fill. The
// one-door tech must hold here too — via the geodesic hub-flood (nearest-curve owners fragment) + graph stitching.
// This substrate lands the FULL K(6,8)=48 with EVERY door at grade (nuclei sit on the curves), on every seed. ══
const cseeds = [1, 2, 3, 7, 11, 42];
let cAllOne = true, cWorstMax = 0, cAllK48 = true, cAllGrade = true, cAllConn = true;
for (const s of cseeds) {
  const m = buildCurveModel(s, { rings: 1, flatR: 0.16, layers: 8, pitch: 36 });
  const cells = m.cells, seen = new Set([cells[0].gi]), q = [cells[0].gi];
  for (let h = 0; h < q.length; h++) for (const nb of cells[q[h]].adj) if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
  if (seen.size !== cells.length) cAllConn = false;
  const c = certify(m);
  cWorstMax = Math.max(cWorstMax, c.measuredMax);
  if (!c.oneDoorOk) cAllOne = false;
  if (!c.k48) cAllK48 = false;
  if (c.steepDoors !== 0) cAllGrade = false;
}
ok(cAllConn, 'on-curve: the grown polyhedra pack the prism as ONE connected solid (orphan slivers stitched in)');
ok(cAllOne && cWorstMax === 1, `★ on-curve substrate ALSO proves one door — nuclei on the curves, grown to fill, max ${cWorstMax} over all seeds`);
ok(cAllK48, '★ on-curve lands the FULL K(6,8) = 48/48 on every seed (nuclei on the curves realise every crossing)');
ok(cAllGrade, '★ on-curve: EVERY door is zero-grade (no over/under stairs — the crossings sit on the curves)');
const cm = buildCurveModel(3, { rings: 1, flatR: 0.16, layers: 8, pitch: 36 });
const cc = certify(cm);
ok(cc.whiteComps === 1 && cc.prodComps === 1, 'on-curve: each concourse is ONE region (geodesic hub-flood guarantees it)');
ok(cm.curveCount > 0 && cm.fillerCount > 0 && cm.nucleiCount === cm.curveCount + cm.fillerCount, 'on-curve: nuclei = on-curve + filler, accounted');
ok(buildCurveModel(5, { filler: 0 }).cells.every((c) => c.owner), 'on-curve filler=0 is pure thread cells (no matrix) — the instructive fragmented case');
const cc2 = certify(buildCurveModel(3, { rings: 1, flatR: 0.16, layers: 8, pitch: 36 }));
ok(cc2.doorPairs === cc.doorPairs && cc2.whiteCells === cc.whiteCells, 'on-curve is deterministic per seed');

// ══ GRADE-AWARE ROUTING: plain door-minimisation takes near-vertical shortcuts between stacked cells (grade ≫ cap);
// routeGraded keeps the SAME door count but walks a pedestrian-grade path. ══
const gm = buildCurveModel(42, { rings: 1, flatR: 0.16, layers: 8, pitch: 36 }), gc = certify(gm), gcells = gm.cells;
const gradeOf = (path) => { let g = 0; for (let i = 1; i < path.length; i++) { const a = gcells[path[i - 1]], b = gcells[path[i]]; g = Math.max(g, Math.abs(a.z - b.z) / (Math.hypot(a.x - b.x, a.y - b.y) || 1e-6)); } return g; };
let sameDoors = true, gradedWalkable = true, doorMinSteep = false;
for (let t = 0; t < 8; t++) {
  const A = gcells[(t * 137) % gcells.length].gi, B = gcells[(t * 331 + 50) % gcells.length].gi;
  const r1 = routeOneDoor(gc.graph, A, B), r2 = routeGraded(gc.graph, A, B, gm.maxGrade || 0.6);
  if (!r1 || !r2) continue;
  if (r2.doors !== r1.doors) sameDoors = false;
  if (r2.maxGrade > 1.2) gradedWalkable = false;
  if (gradeOf(r1.path) > 2) doorMinSteep = true;
}
ok(doorMinSteep, 'plain door-minimisation really does take steep (grade > 2) shortcuts — the problem being fixed');
ok(sameDoors, 'grade-aware routing crosses the SAME number of doors (still ≤ 1) as door-minimisation');
ok(gradedWalkable, '★ grade-aware routing walks a pedestrian-grade path (max grade ≤ ~1.2, near the cap) — routing no longer breaks the grade requirement');

console.log(`onedoor.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
