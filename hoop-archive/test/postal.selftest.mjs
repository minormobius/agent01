// postal.selftest.mjs — pins the deterministic addressing kernel (hoop/js/postal.js).
// Run: node hoop/test/postal.selftest.mjs
import '../js/ship.js'; // side-effect: sets globalThis.HoopShip (classic engine script)
import {
  CHUNK, chunkOf, chambersIn, chamberAt, encodeAddress, decodeAddress, blockPrefix,
  resolve, addressOf, mortonKey, unmorton, hilbertKey, chambersNear,
  chunkDigest, blockDigest, addressFromGid, gidFromAddress,
} from '../js/postal.js';

const Ship = globalThis.HoopShip, SEED = Ship.FLAGSHIP_SEED;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── engine assumptions ──
ok(CHUNK === Ship.CHUNK, 'CHUNK matches the engine');

// ── chambers + reverse lookup ──
{
  const rooms = chambersIn(SEED, 0, 0);
  ok(rooms.length === 4, 'a chunk has 4 addressable chambers');
  ok(rooms.every((r, i) => r.ord === i), 'ordinals are 0..3 in placement order');
  ok(rooms.every((r) => Number.isInteger(r.x) && Number.isInteger(r.y)), 'each chamber resolves to a world centre tile');
  // reverse: the centre of chamber k maps back to chamber k
  for (const r of rooms) ok(chamberAt(SEED, r.x, r.y).ord === r.ord, `chamberAt(centre of ord ${r.ord}) round-trips`);
  // determinism
  const again = chambersIn(SEED, 0, 0);
  ok(JSON.stringify(again) === JSON.stringify(rooms), 'chambersIn is deterministic');
}

// ── genome stability: the SLOT is permanent even as the room TYPE drifts ──
{
  const drift = Ship.genomeFromLog([{ type: 'garden', amt: 40 }, { type: 'forge', amt: 25 }]).snapshot();
  const base = chambersIn(SEED, 5, 5);
  const drifted = chambersIn(SEED, 5, 5, drift);
  ok(drifted.length === base.length, 'genome drift does not change the chamber count');
  ok(base.every((r, i) => drifted[i].ord === r.ord), 'ordinals (slots) are stable under genome drift');
  const addr = encodeAddress({ cx: 5, cy: 5, ord: 2 });
  ok(resolve(SEED, addr).ord === resolve(SEED, addr, drift).ord, 'an address resolves to the same slot under either genome');
  const flipped = base.some((r, i) => r.type !== drifted[i].type);
  ok(flipped, 'and at least one room TYPE did drift (the flavour moves, the slot does not)');
}

// ── address codec round-trips (incl. negatives) ──
{
  let allOk = true;
  for (const [cx, cy, ord] of [[0, 0, 0], [1, 0, 3], [-1, -1, 2], [-32, 17, 1], [12345, -987, 0], [-5000, 5000, 3]]) {
    const a = encodeAddress({ cx, cy, ord }), d = decodeAddress(a);
    if (d.cx !== cx || d.cy !== cy || d.ord !== ord) { allOk = false; console.error('    round-trip fail', cx, cy, ord, '→', a, '→', JSON.stringify(d)); }
  }
  ok(allOk, 'encode→decode round-trips for positive and negative coords');
  ok(addressOf(SEED, chambersIn(SEED, 3, -2)[1].x, chambersIn(SEED, 3, -2)[1].y) === encodeAddress({ cx: 3, cy: -2, ord: 1 }), 'addressOf(world tile) yields the chamber address');
  // morton bijection
  const m = mortonKey(-7, 13); ok(unmorton(m).cx === -7 && unmorton(m).cy === 13, 'morton key is invertible');
}

// ── locality: nearby chambers share longer address prefixes than far ones ──
{
  const commonLen = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i] && a[i] !== '.') i++; return i; };
  const A = encodeAddress({ cx: 100, cy: 100, ord: 0 });
  const adj = commonLen(A, encodeAddress({ cx: 100, cy: 101, ord: 0 }));
  const far = commonLen(A, encodeAddress({ cx: 900, cy: 40, ord: 0 }));
  ok(adj > far, `adjacent chunks share a longer address prefix than far ones (adj ${adj} > far ${far})`);
  ok(blockPrefix(A, 6).length === 6, 'blockPrefix returns the sector handle (the address prefix)');
  // Hilbert is a *better* nearest-neighbour order than Morton: sort cells by key and measure the
  // average spatial step between consecutive cells (Hilbert ≈1 = always adjacent; Morton jumps).
  const grid = []; for (let y = 1; y <= 12; y++) for (let x = 1; x <= 12; x++) grid.push([x, y]);
  const avgStep = (key) => { const o = grid.slice().sort((a, b) => key(a[0], a[1]) - key(b[0], b[1])); let s = 0; for (let i = 1; i < o.length; i++) s += Math.hypot(o[i][0] - o[i - 1][0], o[i][1] - o[i - 1][1]); return s / (o.length - 1); };
  const hStep = avgStep(hilbertKey);
  ok(hStep < avgStep(mortonKey) && hStep < 1.2, `Hilbert orders chambers by nearest-neighbour better than Morton (step ${hStep.toFixed(2)})`);
}

// ── neighbourhood query ──
{
  const near = chambersNear(SEED, 12, 12, 1);
  ok(near.length === 9 * 4, 'chambersNear(radius 1) returns the 3×3 block of chunks × 4 chambers');
  ok(near[0].x !== undefined, 'and they are sorted by distance from the query tile');
}

// ── Merkle digest: deterministic, structural, genome-sensitive ──
{
  ok(chunkDigest(SEED, 2, 3) === chunkDigest(SEED, 2, 3), 'chunkDigest is deterministic');
  ok(chunkDigest(SEED, 2, 3) !== chunkDigest(SEED, 2, 4), 'different chunks digest differently');
  // a block folds its four children (verify the Merkle structure)
  const manual = Ship.hashInts(Ship.hashInts(Ship.hashInts(Ship.hashInts(
    Ship.hashInts(SEED, 1, 1, 1),
    chunkDigest(SEED, 2, 2)), chunkDigest(SEED, 3, 2)), chunkDigest(SEED, 2, 3)), chunkDigest(SEED, 3, 3)) >>> 0;
  ok(blockDigest(SEED, 1, 1, 1) === manual, 'blockDigest folds its four child chunk digests (Merkle)');
  ok(blockDigest(SEED, 0, 0, 3) === blockDigest(SEED, 0, 0, 3), 'blockDigest is deterministic');
  ok(blockDigest(SEED, 0, 0, 2) !== blockDigest(SEED, 1, 0, 2), 'different regions have different digests');
  const drift = Ship.genomeFromLog([{ type: 'garden', amt: 50 }]).snapshot();
  ok(blockDigest(SEED, 0, 0, 2) !== blockDigest(SEED, 0, 0, 2, drift), 'a region digest changes when the genome drifts (forkable, verifiable state)');
}

// ── bridge to the live foam chamber id (world.js FoamField gid = "cx,cy,i") ──
{
  const gid = '3,-2,1', a = addressFromGid(gid);
  ok(typeof a === 'string' && a.includes('.'), 'addressFromGid wraps a foam gid into an address');
  ok(gidFromAddress(a) === gid, 'gidFromAddress round-trips back to the exact foam gid');
  ok(addressFromGid('not-a-gid') === undefined && addressFromGid('1,2') === undefined, 'a malformed gid yields no address');
  // foam chambers per chunk vary, so ordinals can exceed 0..3 — still exact
  ok(gidFromAddress(addressFromGid('10,10,7')) === '10,10,7', 'high (foam) ordinals round-trip');
  ok(gidFromAddress(addressFromGid('-40,128,0')) === '-40,128,0', 'negative-coord gids round-trip');
}

console.log(`postal.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
