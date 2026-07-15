// ringpocket.selftest.mjs — pin the WALKED ring topology (pocketweave.js `ringMode`): 6 above · 6 below ·
// two ring loops (RA/RR) that touch all 12 threads + the nexus, the rings CLOSE INTO A LOOP (the wrap
// seam stitches the last arc to the first), and the reciprocity round-trips. Also guards that ring mode
// OFF leaves ops/pocket unchanged. Run: node rind/upperrind/ringpocket.selftest.mjs
import { buildPocketWorld, reciprocalDoor } from '../ops/pocketweave.js';
import { RADIAL_ENGINES, RING_ORDER, isRingKey } from '../ops/ringpocket.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── ring mode OFF ⇒ the original pocket is unchanged ──
{
  const w = buildPocketWorld(7);
  ok(!w.ringMode && w.geo.NF === 8, 'default: 8 engines, no ring mode');
  ok(w.label('CW') === 'the ops commons' && w.label('CP') === 'the works floor', 'default: the two commons exist');
}

// ── ring mode ON ──
const W = buildPocketWorld(7, { ringMode: true });
ok(W.ringMode === true, 'ringMode flag set');
ok(W.geo.NF === 6, '6 engines below (NF=6)');
ok(RADIAL_ENGINES.join(',') === W.wefts.map((e) => e.id).join(','), 'the 6 engines are the radial set (no assembly, no reclaim)');
ok(!W.wefts.some((e) => e.id === 'assembly' || e.id === 'reclaim'), 'assembly & reclaim are NOT radial engines');
ok(W.geo.warps.length === 6, '6 white ops above');

// ── the two rings touch all 12 threads ──
const RA = W.pocket('RA'); RA.ensureAll();
const RR = W.pocket('RR'); RR.ensureAll();
ok(RA.ring && RR.ring, 'RA & RR are ring pockets');
for (const [name, ring] of [['assembly/RA', RA], ['reclaim/RR', RR]]) {
  const threadDoors = ring.doors.filter((d) => /^[WP]\d$/.test(d.toKey));
  ok(new Set(threadDoors.map((d) => d.toKey)).size === 12, `${name} touches all 12 distinct threads`);
  ok(RING_ORDER.every((k) => threadDoors.some((d) => d.toKey === k)), `${name} reaches every W0..W5 and P0..P5`);
}
ok(RA.doors.some((d) => d.toKey === 'NX'), 'the assembly ring carries a door to the fulfillment nexus');
ok(!RR.doors.some((d) => d.toKey === 'NX'), 'the reclaim ring has no nexus door (only assembly is bonded to it)');
ok(RA.rad < RR.rad, 'assembly is the inner ring, reclaim the outer');

// ── THE LOOP: the last arc segment stitches back to the first (a walk edge across the wrap seam) ──
function crossChunkEdge(pocket, cidA, cidB) {
  const wk = pocket.walk;
  for (let i = 0; i < wk.N; i++) { if (wk.nodeChunk[i] !== cidA) continue; for (const j of wk.adj[i]) if (wk.nodeChunk[j] === cidB) return true; }
  return false;
}
for (const [name, ring] of [['assembly', RA], ['reclaim', RR]]) {
  const first = ring.segs[0].chunkId, last = ring.segs[ring.segs.length - 1].chunkId;
  ok(first >= 0 && last >= 0 && first !== last, `${name}: first & last arcs are distinct chunks`);
  ok(crossChunkEdge(ring, first, last), `${name}: the wrap seam stitches the last arc back to the first — THE LOOP CLOSES`);
  // and the whole ring is one connected concourse
  const wk = ring.walk, seen = new Set([0]), q = [0];
  for (let h = 0; h < q.length; h++) for (const v of wk.adj[q[h]]) if (!seen.has(v)) { seen.add(v); q.push(v); }
  ok(seen.size === wk.N, `${name}: the ring concourse is one connected loop (all ${wk.N} nodes reachable)`);
}

// ── the 12 threads: each grows an inner (RA) + outer (RR) door, keeps its K-station doors ──
for (const key of ['W0', 'P3']) {
  const th = W.pocket(key); th.ensureAll();
  const keys = th.doors.map((d) => d.toKey);
  ok(keys.includes('RA'), `${key} has an inner door to the assembly ring`);
  ok(keys.includes('RR'), `${key} has an outer door to the reclaim ring`);
  ok(keys.some((k) => k[0] === 'X'), `${key} keeps its K-crossing station doors`);
  ok(!keys.includes('CW') && !keys.includes('CP'), `${key} no longer opens onto a commons`);
}

// ── reciprocity round-trips through the rings + nexus ──
{
  const w2 = W.pocket('W2'); w2.ensureAll(); const p1 = W.pocket('P1'); p1.ensureAll();
  const thDoor = w2.doors.find((d) => d.toKey === 'RA');   // walk W2 → assembly ring
  const r = reciprocalDoor(W, 'W2', thDoor);
  ok(r && r.toKey === 'W2', 'crossing W2→RA lands at the assembly ring\'s door back to W2');
  const back = reciprocalDoor(W, 'RA', r);                             // and back
  ok(back && back.toKey === 'RA', 'crossing RA→W2 lands at W2\'s assembly-ring door');
  const nxDoor = RA.doors.find((d) => d.toKey === 'NX');
  const rn = reciprocalDoor(W, 'RA', nxDoor);
  ok(rn && rn.toKey === 'RA', 'RA→NX lands at the nexus door back to the assembly ring');
  const rr = reciprocalDoor(W, 'P1', p1.doors.find((d) => d.toKey === 'RR'));
  ok(rr && rr.toKey === 'P1', 'crossing P1→RR lands at the reclaim ring\'s door back to P1');
}

// ── the nexus ──
{
  const NX = W.pocket('NX'); NX.ensureAll();
  ok(NX.doors.some((d) => d.toKey === 'RA'), 'the nexus opens onto the assembly ring');
  ok(NX.doors.length >= 1, 'the nexus has a door');
  ok(isRingKey('RA') && isRingKey('RR') && isRingKey('NX') && !isRingKey('W0'), 'isRingKey identifies the ring/nexus keys');
}

// ── determinism ──
{
  const a = buildPocketWorld(7, { ringMode: true }), b = buildPocketWorld(7, { ringMode: true });
  const ra = a.pocket('RA'); ra.ensureAll(); const rb = b.pocket('RA'); rb.ensureAll();
  ok(ra.doors.map((d) => d.toKey).join(',') === rb.doors.map((d) => d.toKey).join(','), 'deterministic ring doors');
}

console.log(`\nringpocket.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
