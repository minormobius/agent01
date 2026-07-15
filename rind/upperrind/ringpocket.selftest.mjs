// ringpocket.selftest.mjs — pin the WALKED ring topology (pocketweave.js `ringMode`): 6 above · 6 below ·
// two ring loops (RA/RR) that CLOSE INTO A LOOP and cross every thread THROUGH A ZERO-GRADE ANTECHAMBER
// (the no-ladder rule — same as the weave's X interfaces), plus the fulfillment nexus. Guards that ring
// mode OFF leaves ops/pocket unchanged. Run: node rind/upperrind/ringpocket.selftest.mjs
import { buildPocketWorld, reciprocalDoor } from '../ops/pocketweave.js';
import { RADIAL_ENGINES, RING_ORDER, isRingKey, isAnte, anteKey } from '../ops/ringpocket.js';

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
ok(W.ringMode === true && W.geo.NF === 6, 'ringMode on, 6 engines below');
ok(RADIAL_ENGINES.join(',') === W.wefts.map((e) => e.id).join(','), 'the 6 engines are the radial set (no assembly, no reclaim)');
ok(W.geo.warps.length === 6, '6 white ops above');

const RA = W.pocket('RA'); RA.ensureAll();
const RR = W.pocket('RR'); RR.ensureAll();

// ── each ring crosses all 12 threads THROUGH AN ANTECHAMBER (never a direct floor-to-floor door) ──
for (const [name, ring] of [['assembly/RA', RA], ['reclaim/RR', RR]]) {
  const ante = ring.doors.filter((d) => isAnte(d.toKey));
  ok(ante.length === 6, `${name}: 6 BEEFY antechambers — one per adjacent pair, merged (not 12 thin ones)`);
  ok(ante.every((d) => isAnte(d.toKey) && d.threads.length === 2), `${name}: each antechamber junctions the ring + TWO threads`);
  const threads = ante.flatMap((d) => d.threads);
  ok(new Set(threads).size === 12, `${name}: still touches all 12 threads (2 per beefy antechamber)`);
  ok(RING_ORDER.every((k) => threads.includes(k)), `${name}: reaches every W0..W5 and P0..P5`);
  ok(!ring.doors.some((d) => /^[WP]\d$/.test(d.toKey)), `${name}: NO ring opens directly onto a thread — the no-ladder rule`);
}
ok(RA.doors.some((d) => d.toKey === 'NX'), 'the assembly ring is bonded to the fulfillment nexus');
ok(RA.rad < RR.rad, 'assembly is the inner ring, reclaim the outer');

// ── THE LOOP: the last arc segment stitches back to the first (a walk edge across the wrap seam) ──
function crossChunkEdge(pocket, cidA, cidB) {
  const wk = pocket.walk;
  for (let i = 0; i < wk.N; i++) { if (wk.nodeChunk[i] !== cidA) continue; for (const j of wk.adj[i]) if (wk.nodeChunk[j] === cidB) return true; }
  return false;
}
for (const [name, ring] of [['assembly', RA], ['reclaim', RR]]) {
  const first = ring.segs[0].chunkId, last = ring.segs[ring.segs.length - 1].chunkId;
  ok(first !== last && crossChunkEdge(ring, first, last), `${name}: the wrap seam stitches the last arc back to the first — THE LOOP CLOSES`);
  const wk = ring.walk, seen = new Set([0]), q = [0];
  for (let h = 0; h < q.length; h++) for (const v of wk.adj[q[h]]) if (!seen.has(v)) { seen.add(v); q.push(v); }
  ok(seen.size === wk.N, `${name}: the ring concourse is one connected loop`);
}

// ── the 12 threads: each crosses to the rings THROUGH its antechambers, never directly (no ladder) ──
for (const key of ['W0', 'P3']) {
  const th = W.pocket(key); th.ensureAll();
  const keys = th.doors.map((d) => d.toKey);
  ok(keys.includes(anteKey('RA', key)), `${key} crosses to the assembly ring through its antechamber (${anteKey('RA', key)})`);
  ok(keys.includes(anteKey('RR', key)), `${key} crosses to the reclaim ring through its antechamber`);
  ok(!keys.includes('RA') && !keys.includes('RR'), `${key} has NO direct ring door — no ladder`);
  ok(keys.some((k) => k[0] === 'X'), `${key} keeps its K-crossing station doors`);
  ok(!keys.includes('CW') && !keys.includes('CP'), `${key} no longer opens onto a commons`);
}

// ── THE BEEFY ANTECHAMBER — a single zero-grade chamber junctioning the ring + TWO threads ──
{
  const ante = W.pocket(anteKey('RA', 'W2')); ante.ensureAll();   // 'ZA:W2+P2'
  ok(ante.ante === true && ante.segs.length === 1, 'the antechamber is a single chamber (one segment)');
  ok(ante.spine === null, 'the antechamber has NO spine → no grade → a ZERO-GRADE crossing (no ladder)');
  const dk = ante.doors.map((d) => d.toKey);
  ok(dk.includes('RA') && dk.includes('W2') && dk.includes('P2'), 'the BEEFY antechamber junctions the ring + BOTH threads (W2 & P2)');
  ok(ante.doors.length === 3, 'exactly three doors — the ring + its two threads (a Y junction)');
  ok(ante.W > W.pocket('X0:0').W, 'the beefy antechamber is bigger than a plain 2-door interface');
}

// ── reciprocity round-trips THROUGH the beefy antechamber (thread → antechamber → ring, and thread↔thread) ──
{
  const w2 = W.pocket('W2'); w2.ensureAll(); const p2 = W.pocket('P2'); p2.ensureAll();
  const thDoor = w2.doors.find((d) => d.toKey === anteKey('RA', 'W2'));
  const inAnte = reciprocalDoor(W, 'W2', thDoor);
  ok(inAnte && inAnte.toKey === 'W2', 'W2 → beefy antechamber lands at the door back to W2');
  const anteToRing = W.pocket(anteKey('RA', 'W2')).doors.find((d) => d.toKey === 'RA');
  const onRing = reciprocalDoor(W, anteKey('RA', 'W2'), anteToRing);
  ok(onRing && onRing.toKey === anteKey('RA', 'W2'), 'antechamber → assembly ring lands at the ring\'s pair antechamber door');
  // the beefy chamber also joins its two threads: W2 → antechamber → P2 (one chamber, three ways)
  const anteToP2 = W.pocket(anteKey('RA', 'W2')).doors.find((d) => d.toKey === 'P2');
  const onP2 = reciprocalDoor(W, anteKey('RA', 'W2'), anteToP2);
  ok(onP2 && onP2.toKey === anteKey('RA', 'P2') && anteKey('RA', 'P2') === anteKey('RA', 'W2'), 'the beefy antechamber also joins its two threads — W2 ↔ P2 through one chamber');
  // outer ring, from an engine
  const p1 = W.pocket('P1'); p1.ensureAll();
  const inAnteR = reciprocalDoor(W, 'P1', p1.doors.find((d) => d.toKey === anteKey('RR', 'P1')));
  ok(inAnteR && inAnteR.toKey === 'P1', 'P1 → reclaim antechamber lands at the chamber\'s door back to P1');
}

// ── the nexus (a direct bond, the lift — not a weave crossing) ──
{
  const NX = W.pocket('NX'); NX.ensureAll();
  ok(NX.doors.some((d) => d.toKey === 'RA'), 'the nexus opens onto the assembly ring');
  ok(isRingKey('RA') && isAnte('ZA:W2') && !isAnte('W0'), 'key classifiers agree');
}

// ── determinism ──
{
  const a = buildPocketWorld(7, { ringMode: true }), b = buildPocketWorld(7, { ringMode: true });
  const ra = a.pocket('RA'); ra.ensureAll(); const rb = b.pocket('RA'); rb.ensureAll();
  ok(ra.doors.map((d) => d.toKey).join(',') === rb.doors.map((d) => d.toKey).join(','), 'deterministic ring doors');
}

console.log(`\nringpocket.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
