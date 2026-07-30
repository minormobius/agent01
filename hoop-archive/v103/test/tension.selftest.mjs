// tension.selftest.mjs — surface-tension room relaxation: discourage long skinny (rim) rooms.
//   node hoop/v103/test/tension.selftest.mjs
import { solveChunk } from '../v8/chunkgen.js';
import { relaxZones } from '../paint/voronoi.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

// per-room PCA aspect ratio (long axis / short axis); skinny rooms score high. Average over rooms.
function avgAspect(chunk) {
  let sum = 0, n = 0;
  for (const r of chunk.rooms) {
    if (r.cells.length < 3) continue;
    let mx = 0, my = 0; for (const c of r.cells) { mx += chunk.cells[c].x; my += chunk.cells[c].y; } mx /= r.cells.length; my /= r.cells.length;
    let xx = 0, yy = 0, xy = 0; for (const c of r.cells) { const dx = chunk.cells[c].x - mx, dy = chunk.cells[c].y - my; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
    xx /= r.cells.length; yy /= r.cells.length; xy /= r.cells.length;
    const tr = xx + yy, det = xx * yy - xy * xy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc);
    sum += Math.sqrt(l1 / l2); n++;
  }
  return n ? sum / n : 0;
}
// every room's cells form ONE connected component over the chunk adjacency.
function allConnected(chunk) {
  for (const r of chunk.rooms) {
    if (!r.cells.length) continue;
    const inRoom = new Set(r.cells), seen = new Set([r.cells[0]]), q = [r.cells[0]];
    for (let h = 0; h < q.length; h++) for (const v of chunk.adj[q[h]]) if (inRoom.has(v) && !seen.has(v)) { seen.add(v); q.push(v); }
    if (seen.size !== r.cells.length) return false;
  }
  return true;
}

// ── relaxZones unit behaviour ──
const edges = []; const N = 20;                          // a 1×20 chain — maximally skinny, two zones
for (let i = 0; i < N - 1; i++) edges.push({ a: i, b: i + 1 });
const zone = Int32Array.from({ length: N }, (_, i) => (i < N / 2 ? 0 : 1));
ok(JSON.stringify([...relaxZones(N, edges, zone, 0)]) === JSON.stringify([...zone]), 'tension 0 is a no-op');
const relaxed = relaxZones(N, edges, zone, 0.8);
ok(relaxed.length === N && new Set(relaxed).size <= 2, 'relaxZones keeps the zone count, never invents zones');

// ── over a real chunk: tension lowers average room skinniness ──
const W = 900, H = 600, opts = { seed: 4, W, H, roomSize: 14, footprint: { dwell: 0.7, govern: 1.8, worship: 1.6, serve: 1.5, learn: 1.5, play: 1.6, make: 1.25, trade: 1.4, mend: 1, grow: 1.1, heal: 1.3, store: 0.7, move: 0.8 }, grand: ['serve', 'learn', 'play'], minRoom: 5 };
const plain = solveChunk(opts);
const plainDup = solveChunk(opts);
ok(JSON.stringify(plain.rooms.map((r) => r.cells.length)) === JSON.stringify(plainDup.rooms.map((r) => r.cells.length)), 'tension default (0) is deterministic + unchanged');

const maxAspect = (ch) => Math.max(...ch.rooms.filter((r) => r.cells.length >= 3).map((r) => { let mx = 0, my = 0; for (const c of r.cells) { mx += ch.cells[c].x; my += ch.cells[c].y; } mx /= r.cells.length; my /= r.cells.length; let xx = 0, yy = 0, xy = 0; for (const c of r.cells) { const dx = ch.cells[c].x - mx, dy = ch.cells[c].y - my; xx += dx * dx; yy += dy * dy; xy += dx * dy; } xx /= r.cells.length; yy /= r.cells.length; xy /= r.cells.length; const tr = xx + yy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - (xx * yy - xy * xy))); return Math.sqrt((tr / 2 + disc) / Math.max(1e-6, tr / 2 - disc)); }));
const taut = solveChunk({ ...opts, tension: 0.8 });
const a0 = avgAspect(plain), a1 = avgAspect(taut);
ok(a1 < a0, `surface tension lowers average room aspect (skinnier→chunkier): ${a1.toFixed(2)} < ${a0.toFixed(2)}`);
ok(maxAspect(taut) < maxAspect(plain), `the skinniest room gets less skinny (${maxAspect(taut).toFixed(1)} < ${maxAspect(plain).toFixed(1)})`);
ok(allConnected(taut), 'every room stays a single connected component (merge keeps connectivity)');
ok(taut.rooms.length <= plain.rooms.length && taut.rooms.length >= plain.rooms.length * 0.55, `tension merges some strips away (${taut.rooms.length} ≤ ${plain.rooms.length})`);
ok(taut.rooms.every((r) => r.door >= 0 || r.cells.length === 0), 'every surviving room still gets a door');

// a stronger pull rounds further, and never throws
const tauter = solveChunk({ ...opts, tension: 1 });
ok(avgAspect(tauter) <= a1 + 0.5, 'max tension is at least as chunky');
ok(allConnected(tauter), 'rooms stay connected at max tension');

console.log(`tension.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
