// pocketdeck.selftest.mjs — v106's UPPER RIND: the ring-weave pocket dimension as a GAME deck.
//
//   node hoop/v107/test/pocketdeck.selftest.mjs
//
// Pins: the deck solves completely and deterministically (88 pockets: NX · assembly ring · 6 ZA
// antechambers · 6 white threads · ND · reclaim ring · 6 ZR antechambers · 6 engine halls · 36 X
// interfaces); the full K(6,6) of stations exists; EVERY door pairs (both sides place a cell — the
// no-orphan-crossing rule); the two rings CLOSE INTO LOOPS (first and last arc share seam ports);
// the two nexuses carry their gilded rooms (NX ⇅ the nave lift · ND ⇓ the lower-rind shaft); pocket
// slots never overlap (islands); and recs are game-shaped (poly/cells/rooms/road/ports/region).

import { prepareWeaveDeck, weaveSolveNext, weaveDoorPairs, nexusRoomOf, PAIRS, RING_ORDER } from '../rindweave/pocketdeck.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const SEED = 7, CX = 24450, CY = 300;
const st = prepareWeaveDeck(SEED, { cx: CX, cy: CY });

// ── 1. the roster ──
ok(st.order.length === 88, `88 chunk solves queued (got ${st.order.length})`);
ok(st.stations.length === 36, `full K(6,6): 36 stations (got ${st.stations.length})`);
ok(RING_ORDER.length === 12 && PAIRS.length === 6, 'ring order interleaves 12 threads into 6 pairs');
ok(st.pockets.has('NX') && st.pockets.has('ND') && st.pockets.has('RA') && st.pockets.has('RR'), 'both rings and both nexuses exist');
ok(st.order[0][0] === 'NX', 'the fulfillment nexus solves FIRST (the shaft lands there)');

// ── 2. solve everything ──
let n = 0, r;
while ((r = weaveSolveNext(st))) {
  n++;
  const rec = r.rec;
  ok(rec.weave && rec.weave.key === r.key, n === 1 ? 'recs carry their weave tag {key, si, kind}' : 'weave tag (rest)');
  if (n === 1) {
    ok(Array.isArray(rec.poly) && rec.cells.length > 0 && Array.isArray(rec.rooms) && rec.road && rec.roomOf && Array.isArray(rec.ports) && rec.region, 'recs are game-shaped (poly/cells/rooms/road/roomOf/ports/region)');
  }
}
ok(n === 88, `all 88 chunks solved (got ${n})`);

// ── 3. every crossing pairs — no orphan doors ──
const pairs = weaveDoorPairs(st);
const un = new Map();
for (const p of st.pockets.values()) for (const d of p.doors) { const pid = [d.key, d.toKey].sort().join('|'); un.set(pid, (un.get(pid) || 0) + 1); }
ok([...un.values()].every((v) => v === 2), 'every door has exactly one reciprocal (no orphan crossings)');
ok(pairs.length === 110, `110 teleport pairs (12 threads×2 ring-ends + 12 ante↔ring + 36×2 interface + NX + ND; got ${pairs.length})`);

// each thread reaches BOTH rings through its pair's antechambers
for (const key of RING_ORDER) {
  const p = st.pockets.get(key);
  ok(p.doors.some((d) => d.toKey.startsWith('ZA:')) && p.doors.some((d) => d.toKey.startsWith('ZR:')), `${key} opens onto both its antechambers (assembly + reclaim ends)`);
}
// each antechamber is the Y junction: ring + its two threads
for (let i = 0; i < 6; i++) {
  for (const ring of ['A', 'R']) {
    const k = 'Z' + ring + ':' + PAIRS[i][0] + '+' + PAIRS[i][1];
    const d = st.pockets.get(k).doors.map((x) => x.toKey).sort();
    ok(d.length === 3 && d.includes('R' + ring) && d.includes(PAIRS[i][0]) && d.includes(PAIRS[i][1]), `${k} junctions the ring + both threads (got ${d.join(',')})`);
  }
}
// the rings touch all six antechambers + their nexus
const raTo = st.pockets.get('RA').doors.map((d) => d.toKey);
const rrTo = st.pockets.get('RR').doors.map((d) => d.toKey);
ok(raTo.filter((k) => k.startsWith('ZA:')).length === 6 && raTo.includes('NX'), 'assembly ring: 6 antechambers + the fulfillment nexus');
ok(rrTo.filter((k) => k.startsWith('ZR:')).length === 6 && rrTo.includes('ND'), 'reclaim ring: 6 antechambers + the dispatch nexus');

// ── 4. the rings CLOSE INTO LOOPS: the last arc's end seam sits at the first arc's start seam ──
for (const key of ['RA', 'RR']) {
  const p = st.pockets.get(key);
  const first = p.segs[0].rec, last = p.segs[p.segs.length - 1].rec;
  const fp = first.ports.filter((q) => q.inherited), lp = last.ports.filter((q) => q.inherited);
  const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 2;
  ok(fp.some((a) => lp.some((b) => near(a, b))), `${key} closes into a loop (shared seam port between first and last arc)`);
}

// ── 5. the two nexuses carry their gilded rooms ──
const nx = nexusRoomOf(st, 'NX'), nd = nexusRoomOf(st, 'ND');
ok(nx && nx.room.nexus && nx.room.role === 'fulfillment' && nx.room.glyph === '⇅', 'NX gilds the fulfillment chamber (the lift up to the nave)');
ok(nd && nd.room.nexus && nd.room.role === 'descent' && nd.room.glyph === '⇓', 'ND gilds the descent chamber (the shaft down to the lower rind)');

// ── 6. pockets are ISLANDS: solved recs' bounding boxes never overlap across pockets ──
const boxes = [];
for (const p of st.pockets.values()) for (const g of p.segs) {
  if (!g.rec) continue;
  boxes.push({ key: p.key, ...g.rec.region });
}
let overlaps = 0;
for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
  const a = boxes[i], b = boxes[j];
  if (a.key === b.key) continue;   // segments of one pocket abut by design
  if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) overlaps++;
}
ok(overlaps === 0, `pocket islands never overlap (${overlaps} cross-pocket bbox overlaps)`);

// ── 7. determinism: a second build lands identical doors ──
const st2 = prepareWeaveDeck(SEED, { cx: CX, cy: CY });
while (weaveSolveNext(st2)) {}
const sig = (s) => [...s.pockets.values()].flatMap((p) => p.doors.map((d) => `${d.key}|${d.toKey}|${d.si}|${d.cell}`)).sort().join(';');
ok(sig(st) === sig(st2), 'same seed → identical door placement (atproto-stable)');

// ── 8. npcs' half vs the machines' half: whites keep wild-type rooms (homes exist) ──
const w0 = st.pockets.get('W0').segs[0].rec;
ok(w0.rooms.some((rm) => rm.role === 'dwell'), 'a white thread has dwell rooms (residents + keepers can live there)');

console.log(`pocketdeck.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
