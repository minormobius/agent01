// postal.js — the postal system for the infinite ship: stable, deterministic, hierarchical
// addresses for every chamber, derived (never stored) from the ship engine.
//
// WHY THIS EXISTS. The world is a pure function of (shipSeed, chunkCoord, genome): nothing is
// persisted, so an address can't be a database row — it has to be *derivable*. Two facts from
// ship.js make a real address possible:
//   • SEAMS ARE SEED-ONLY. edgePorts() (the 4 doors a chunk shares) come from rngFor(seed,…),
//     never the genome — the connectivity skeleton is fixed for ever.
//   • CHAMBER SLOTS ARE GENOME-STABLE. A chunk always places exactly 4 rooms in a fixed order
//     (commons, then quadrants (1,0),(0,1),(1,1)); genome.sample() draws the RNG exactly once
//     regardless of weights, so the *slot* (placement ordinal) never moves even as the room's
//     *type* drifts. So an NPC bound to (chunk, ordinal) survives genome drift; its position is
//     resolved at lookup time.
//
// THE ADDRESS is therefore: shipSeed : quadtree-block-path(chunk) : ordinal. The block path is a
// Morton/quadtree code over chunk space, so nearby chambers share long prefixes (locality
// clustering — cheap "who's near here", range queries, routing heuristics). A Hilbert key is also
// offered for a strict nearest-neighbour linear order. A Merkle digest over the quadtree gives
// verifiable, forkable region state (the atproto thesis) — derived on demand, not stored.
//
// Pure, deterministic, zero-dep beyond the ship engine (read off globalThis.HoopShip, the same
// way world.js reads it). Runs in node + browser; pinned by hoop/test/postal.selftest.mjs.

const SHIP = () => globalThis.HoopShip;
export const CHUNK = 24; // mirror of HoopShip.CHUNK (asserted equal in the selftest)

// ── world ↔ chunk tile arithmetic (floor-correct for negatives) ───────────────────────────
export function chunkOf(wx, wy) {
  const cx = Math.floor(wx / CHUNK), cy = Math.floor(wy / CHUNK);
  return { cx, cy, lx: wx - cx * CHUNK, ly: wy - cy * CHUNK };
}
// world-tile centre of a room (rooms carry LOCAL tile coords in the chunk)
export function roomWorldCenter(room, cx, cy) {
  return { x: cx * CHUNK + room.cx, y: cy * CHUNK + room.cy };
}

// ── chambers of a chunk (the addressable rooms), in canonical placement order ──────────────
// ordinal = index in the placement order = a permanent slot id. Position is resolved live.
export function chambersIn(seed, cx, cy, genome) {
  const ch = SHIP().generateChunk(seed, cx, cy, genome);
  return ch.rooms.map((r, i) => {
    const c = roomWorldCenter(r, cx, cy);
    return {
      cx, cy, ord: i, type: r.type, glyph: r.glyph, gravity: r.gravity,
      x: c.x, y: c.y,                                   // world centre tile
      rect: { x0: cx * CHUNK + r.x, y0: cy * CHUNK + r.y, w: r.w, h: r.h },
    };
  });
}

// reverse: which chamber owns a world tile? (the room rect containing it, else the nearest centre)
export function chamberAt(seed, wx, wy, genome) {
  const { cx, cy } = chunkOf(wx, wy);
  const rooms = chambersIn(seed, cx, cy, genome);
  for (const r of rooms) {
    if (wx >= r.rect.x0 && wx < r.rect.x0 + r.rect.w && wy >= r.rect.y0 && wy < r.rect.y0 + r.rect.h) return r;
  }
  let best = rooms[0], bd = Infinity;
  for (const r of rooms) { const d = (r.x - wx) ** 2 + (r.y - wy) ** 2; if (d < bd) { bd = d; best = r; } }
  return best;
}

// ── space-filling indices over chunk space (signed → unsigned via zig-zag) ─────────────────
const ZZ = (n) => (n < 0 ? -n * 2 - 1 : n * 2);          // signed → unsigned
const UZ = (z) => ((z & 1) ? -((z + 1) >>> 1) : (z >>> 1)); // unsigned → signed
const BITS = 16, MAXZZ = (1 << BITS) - 1;                 // addressable: chunk coords ±32767

function part1by1(n) { n &= 0xffff; n = (n | (n << 8)) & 0x00ff00ff; n = (n | (n << 4)) & 0x0f0f0f0f; n = (n | (n << 2)) & 0x33333333; n = (n | (n << 1)) & 0x55555555; return n >>> 0; }
function compact1by1(n) { n &= 0x55555555; n = (n | (n >> 1)) & 0x33333333; n = (n | (n >> 2)) & 0x0f0f0f0f; n = (n | (n >> 4)) & 0x00ff00ff; n = (n | (n >> 8)) & 0x0000ffff; return n >>> 0; }

// Morton (Z-order) key — its base-4 digits ARE the quadtree/Merkle block path (clean prefixes).
export function mortonKey(cx, cy) {
  const zx = ZZ(cx), zy = ZZ(cy);
  if (zx > MAXZZ || zy > MAXZZ) throw new RangeError('chunk coord out of addressable range (±32767)');
  return (part1by1(zx) | (part1by1(zy) << 1)) >>> 0;
}
export function unmorton(m) { return { cx: UZ(compact1by1(m >>> 0)), cy: UZ(compact1by1((m >>> 1))) }; }

// Hilbert key — a strict nearest-neighbour linear order (consecutive keys are spatially adjacent).
export function hilbertKey(cx, cy) {
  let x = ZZ(cx), y = ZZ(cy), d = 0;
  for (let s = 1 << (BITS - 1); s > 0; s >>= 1) {
    const rx = (x & s) > 0 ? 1 : 0, ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) { if (rx === 1) { x = s - 1 - x; y = s - 1 - y; } const t = x; x = y; y = t; }
  }
  return d; // ≤ 2^32, exact in a double
}

// ── the address string: <16 base-4 quadtree digits>.<ordinal> ─────────────────────────────
export function encodeAddress({ cx, cy, ord }) {
  const m = mortonKey(cx, cy);
  let s = '';
  for (let i = BITS - 1; i >= 0; i--) s += ((m >>> (2 * i)) & 3).toString();
  return s + '.' + ord;
}
export function decodeAddress(str) {
  const dot = str.lastIndexOf('.'), q = str.slice(0, dot), ord = +str.slice(dot + 1);
  let m = 0;
  for (let i = 0; i < BITS; i++) m = ((m * 4) + (q.charCodeAt(i) - 48)) >>> 0;
  return { ...unmorton(m >>> 0), ord };
}
// the enclosing block at a given quadtree level (the address prefix) — a "sector" handle
export function blockPrefix(addr, level) { return addr.slice(0, Math.max(0, Math.min(BITS, level))); }

// resolve an address (string or {cx,cy,ord}) to its live chamber under a genome
export function resolve(seed, addr, genome) {
  const a = typeof addr === 'string' ? decodeAddress(addr) : addr;
  const rooms = chambersIn(seed, a.cx, a.cy, genome);
  return rooms[Math.max(0, Math.min(rooms.length - 1, a.ord))];
}
export function addressOf(seed, wx, wy, genome) {
  const c = chamberAt(seed, wx, wy, genome);
  return encodeAddress({ cx: c.cx, cy: c.cy, ord: c.ord });
}

// ── neighbourhood queries (for "who lives near here") ──────────────────────────────────────
export function chunksNear(cx, cy, radius) {
  const out = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) out.push([cx + dx, cy + dy]);
  return out;
}
export function chambersNear(seed, wx, wy, radiusChunks, genome) {
  const { cx, cy } = chunkOf(wx, wy), out = [];
  for (const [x, y] of chunksNear(cx, cy, radiusChunks)) for (const r of chambersIn(seed, x, y, genome)) out.push(r);
  out.sort((a, b) => ((a.x - wx) ** 2 + (a.y - wy) ** 2) - ((b.x - wx) ** 2 + (b.y - wy) ** 2));
  return out;
}

// ── Merkle digest over the quadtree: verifiable, forkable region state (derive on demand) ──
export function chunkDigest(seed, cx, cy, genome) {
  const Ship = SHIP(), ch = Ship.generateChunk(seed, cx, cy, genome);
  let h = Ship.hashInts(seed, cx, cy, ch.rooms.length);
  for (const r of ch.rooms) h = Ship.hashInts(h, Ship.TYPE_INDEX[r.type] ?? 0, r.cx, r.cy);
  return h >>> 0;
}
// a block at `level` covers a 2^level × 2^level square of chunks at block-index (bx,by);
// its digest folds its four children (Merkle), bottoming out at chunkDigest.
export function blockDigest(seed, bx, by, level, genome) {
  const Ship = SHIP();
  if (level <= 0) return chunkDigest(seed, bx, by, genome);
  let h = Ship.hashInts(seed, level, bx, by);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) h = Ship.hashInts(h, blockDigest(seed, bx * 2 + i, by * 2 + j, level - 1, genome));
  return h >>> 0;
}
