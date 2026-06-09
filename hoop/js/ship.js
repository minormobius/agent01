// hoop/js/ship.js
// ─────────────────────────────────────────────────────────────────────────────
// THE SHIP ENGINE — deterministic, infinite, chunked.
//
// A generation ship with no edges: an endless lattice of CHUNK×CHUNK tile chunks,
// each generated lazily and DETERMINISTICALLY from
//     (shipSeed, chunkCoord, genomeSnapshot)
// so identical coordinates yield identical rooms on every machine and across
// atproto repos. Chunk borders are SEAMLESS: the corridor crossing a shared edge
// is decided by a hash of that edge, so the two chunks either side always agree.
//
// Two moves turn a ROOM engine into a WORLD engine:
//   1. ROOM_TYPES is a weighted palette (cf. mappa's BIOMES table).
//   2. The ship GENOME — those weights — DRIFTS with play. Plant gardens and the
//      frontier samples more gardens: a positive feedback loop. The genome is a
//      pure function of the action log, so the whole ship stays reproducible from
//      (shipSeed + log) — which is exactly what makes it atproto-persistable and
//      tangled-remixable.
//
// Gravity is NOT global. Every room carries a REGIME (normal / spin / none / mag)
// sampled from its type + a low-frequency SECTOR field, so coherent zones emerge:
// a torus-spin sector tilts, a derelict sector has zero-g pockets, a cylinder
// sector feels normal. The movement layer reads room.gravity; the engine only
// paints it. A few rooms flip `format` to 'side' (a tall zero-g shaft seen edge-on).
//
// Classic global script (not an ES module) so it loads with <script src> before
// the module app.js AND unit-tests in plain node (see ship.selftest.mjs):
//     eval(readFileSync('hoop/js/ship.js')) → globalThis.HoopShip
// Determinism is load-bearing: no Date, no Math.random anywhere below.
// ─────────────────────────────────────────────────────────────────────────────
(function (g) {
  'use strict';

  const CHUNK = 24;                        // tiles per chunk side
  const TILE = { VOID: 0, FLOOR: 1, DOOR: 2 };
  const GRAV_LIST = ['normal', 'spin', 'none', 'mag'];
  const GRAV = { NORMAL: 'normal', SPIN: 'spin', NONE: 'none', MAG: 'mag' };
  const FORMAT = { TOP: 'top', SIDE: 'side' };

  // ── room palette ──────────────────────────────────────────────────────────
  // grav: relative weights over regimes for rooms of this type, BEFORE the sector
  // field tilts them. side: chance this room flips to an edge-on format.
  const ROOM_TYPES = [
    { id: 'garden',     glyph: '❀', accent: '#6fcf8e', grav: { normal: 5, spin: 1 },           side: 0 },
    { id: 'forge',      glyph: '⚒', accent: '#e0884a', grav: { normal: 3, mag: 3 },            side: 0 },
    { id: 'archive',    glyph: '❍', accent: '#8fb0d8', grav: { normal: 4, mag: 1 },            side: 0 },
    { id: 'shrine',     glyph: '☥', accent: '#d8b85a', grav: { normal: 3, spin: 2 },           side: 0 },
    { id: 'nursery',    glyph: '✿', accent: '#e89ac0', grav: { normal: 5 },                    side: 0 },
    { id: 'observatory',glyph: '✷', accent: '#9a8fe0', grav: { none: 4, spin: 2, normal: 1 },  side: 0.35 },
    { id: 'reactor',    glyph: '☢', accent: '#e0d24a', grav: { mag: 4, spin: 1 },              side: 0 },
    { id: 'commons',    glyph: '⌂', accent: '#cfd8d0', grav: { normal: 6 },                    side: 0 },
    { id: 'ruin',       glyph: '☖', accent: '#8a8f86', grav: { none: 5, spin: 1 },             side: 0.5 },
    { id: 'shaft',      glyph: '↕', accent: '#7fd8d0', grav: { none: 6 },                      side: 0.8 },
  ];
  const TYPE_INDEX = Object.fromEntries(ROOM_TYPES.map((t, i) => [t.id, i]));

  // ── prng + hashing ──────────────────────────────────────────────────────────
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // FNV-1a over the int args → a stable 32-bit seed. Order matters; keep it fixed.
  function hashInts() {
    let h = 0x811c9dc5 >>> 0;
    for (let n = 0; n < arguments.length; n++) {
      let v = arguments[n] | 0;
      for (let b = 0; b < 4; b++) { h ^= (v & 0xff); h = Math.imul(h, 0x01000193) >>> 0; v >>>= 8; }
    }
    return h >>> 0;
  }
  function rngFor() { return mulberry32(hashInts.apply(null, arguments)); }

  // ── the ship genome ─────────────────────────────────────────────────────────
  // A weight per room type. sample() draws a type weighted by the genome, so the
  // frontier's character follows the weights. nudge() is how play bends the ship.
  function ShipGenome(weights) {
    this.w = weights ? weights.slice() : ROOM_TYPES.map(() => 1);
  }
  ShipGenome.prototype.clone = function () { return new ShipGenome(this.w); };
  ShipGenome.prototype.snapshot = function () { return this.w.slice(); };
  ShipGenome.prototype.nudge = function (typeId, amt) {
    const i = TYPE_INDEX[typeId];
    if (i != null) this.w[i] = Math.max(0.05, this.w[i] + (amt == null ? 1 : amt));
    return this;
  };
  ShipGenome.prototype.sample = function (rnd) {
    let tot = 0; for (let i = 0; i < this.w.length; i++) tot += this.w[i];
    let r = rnd() * tot;
    for (let i = 0; i < this.w.length; i++) { r -= this.w[i]; if (r <= 0) return ROOM_TYPES[i]; }
    return ROOM_TYPES[ROOM_TYPES.length - 1];
  };
  // Replay an action log into a genome — deterministic, so seed+log ⇒ ship.
  // Each action is { type: <roomTypeId>, amt? }. Unknown types are ignored.
  function genomeFromLog(actions) {
    const gnm = new ShipGenome();
    if (actions) for (const a of actions) if (a && a.type) gnm.nudge(a.type, a.amt);
    return gnm;
  }

  // ── seamless edge ports ─────────────────────────────────────────────────────
  // A vertical seam sits between chunk (X,Y) and (X+1,Y); its door y-offset is
  // keyed on the LEFT chunk so both sides compute the same value. Likewise a
  // horizontal seam between (X,Y) and (X,Y+1) is keyed on the TOP chunk.
  const seamV = (seed, X, Y) => 3 + Math.floor(rngFor(seed, 1, X, Y)() * (CHUNK - 6));
  const seamH = (seed, X, Y) => 3 + Math.floor(rngFor(seed, 2, X, Y)() * (CHUNK - 6));
  function edgePorts(seed, cx, cy) {
    return {
      W: seamV(seed, cx - 1, cy),  // shared with the chunk to the west
      E: seamV(seed, cx, cy),      // shared with the chunk to the east
      N: seamH(seed, cx, cy - 1),  // shared with the chunk to the north
      S: seamH(seed, cx, cy),      // shared with the chunk to the south
    };
  }

  // ── the sector gravity field ────────────────────────────────────────────────
  // A low-frequency deterministic field over chunk space giving each region a
  // gravity *character*. Smoothly interpolated so neighbouring chunks share a
  // mood: you cross from a cylinder sector into a spin sector gradually.
  function smooth(t) { return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sectorField(seed, fx, fy) {
    const SCALE = 5; // chunks per cell
    const x = fx / SCALE, y = fy / SCALE;
    const x0 = Math.floor(x), y0 = Math.floor(y), tx = smooth(x - x0), ty = smooth(y - y0);
    const corner = (i, j) => rngFor(seed, 7, i, j)();
    const top = lerp(corner(x0, y0), corner(x0 + 1, y0), tx);
    const bot = lerp(corner(x0, y0 + 1), corner(x0 + 1, y0 + 1), tx);
    return lerp(top, bot, ty); // [0,1): 0 = cylinder/normal, 1 = high spin/derelict
  }

  function pickGravity(type, rnd, sector) {
    // Base weights from the room type, tilted by the sector field: high sector
    // pushes spin and zero-g; low sector keeps things grounded.
    const base = type.grav;
    const w = {
      normal: (base.normal || 0) * (1.2 - sector),
      spin:   (base.spin   || 0) + sector * 3,
      none:   (base.none   || 0) + Math.max(0, sector - 0.55) * 4,
      mag:    (base.mag    || 0) * (1.1 - sector * 0.5),
    };
    let tot = 0; for (const k of GRAV_LIST) tot += Math.max(0, w[k]);
    if (tot <= 0) return GRAV.NORMAL;
    let r = rnd() * tot;
    for (const k of GRAV_LIST) { r -= Math.max(0, w[k]); if (r <= 0) return k; }
    return GRAV.NORMAL;
  }

  // ── chunk generation ────────────────────────────────────────────────────────
  // Returns a fully-described, rasterised chunk. The corridor spine connects all
  // four seam ports through a central hub, so the infinite network is always
  // connected; rooms hang off the four quadrants, sized and typed by the genome.
  function generateChunk(shipSeed, cx, cy, genomeWeights) {
    const genome = new ShipGenome(genomeWeights);
    const rnd = rngFor(shipSeed, 9, cx, cy);
    const tiles = new Uint8Array(CHUNK * CHUNK);
    const grav = new Uint8Array(CHUNK * CHUNK); // GRAV_LIST index + 1 on floor, 0 = void
    const at = (x, y) => y * CHUNK + x;
    const inb = (x, y) => x >= 0 && x < CHUNK && y >= 0 && y < CHUNK;
    const ports = edgePorts(shipSeed, cx, cy);
    const sector = sectorField(shipSeed, cx, cy);
    const hub = (CHUNK >> 1);
    const rooms = [];

    const carve = (x, y, regimeIdx) => {
      if (!inb(x, y)) return;
      tiles[at(x, y)] = tiles[at(x, y)] || TILE.FLOOR;
      grav[at(x, y)] = regimeIdx; // last writer wins; rooms overwrite corridor
    };
    const carveRect = (x0, y0, w, h, regimeIdx) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) carve(x, y, regimeIdx);
    };
    const corridorRegime = 1 + GRAV_LIST.indexOf(sector > 0.6 ? GRAV.SPIN : GRAV.NORMAL);

    // 1. corridor spine: each port → hub (L-shaped), then mark the port tile a DOOR
    const link = (px, py) => {
      const sx = Math.sign(hub - px) || 1, sy = Math.sign(hub - py) || 1;
      for (let x = px; x !== hub; x += sx) carve(x, py, corridorRegime);
      for (let y = py; y !== hub; y += sy) carve(hub, y, corridorRegime);
      carve(hub, hub, corridorRegime);
    };
    link(0, ports.W);                tiles[at(0, ports.W)] = TILE.DOOR;
    link(CHUNK - 1, ports.E);        tiles[at(CHUNK - 1, ports.E)] = TILE.DOOR;
    link(ports.N, 0);                tiles[at(ports.N, 0)] = TILE.DOOR;
    link(ports.S, CHUNK - 1);        tiles[at(ports.S, CHUNK - 1)] = TILE.DOOR;

    // 2. rooms: a hub commons + one room per quadrant, varied sizes, genome-typed.
    const placeRoom = (qx, qy, forceType) => {
      const type = forceType || genome.sample(rnd);
      const w = 4 + Math.floor(rnd() * 6), h = 4 + Math.floor(rnd() * 5); // 4..9 × 4..8
      // anchor the room within its quadrant, kept off the chunk border
      const minX = qx === 0 ? 2 : hub + 1, maxX = qx === 0 ? hub - w - 1 : CHUNK - w - 2;
      const minY = qy === 0 ? 2 : hub + 1, maxY = qy === 0 ? hub - h - 1 : CHUNK - h - 2;
      const rx = Math.max(2, minX + Math.floor(rnd() * Math.max(1, maxX - minX)));
      const ry = Math.max(2, minY + Math.floor(rnd() * Math.max(1, maxY - minY)));
      const gravity = pickGravity(type, rnd, sector);
      const format = (gravity === GRAV.NONE && rnd() < type.side) ? FORMAT.SIDE : FORMAT.TOP;
      const regimeIdx = 1 + GRAV_LIST.indexOf(gravity);
      carveRect(rx, ry, w, h, regimeIdx);
      // connect the room's centre back to the hub spine so it's reachable
      link(Math.min(CHUNK - 1, rx + (w >> 1)), Math.min(CHUNK - 1, ry + (h >> 1)));
      const room = {
        type: type.id, glyph: type.glyph, accent: type.accent,
        x: rx, y: ry, w, h, gravity, format,
        cx: rx + (w >> 1), cy: ry + (h >> 1),
      };
      rooms.push(room);
      return room;
    };
    placeRoom(0, 0, ROOM_TYPES[TYPE_INDEX.commons]); // a grounded commons near the hub
    placeRoom(1, 0); placeRoom(0, 1); placeRoom(1, 1);

    return { cx, cy, seed: shipSeed >>> 0, sector, ports, tiles, grav, rooms, format: FORMAT.TOP };
  }

  // The flagship everyone lands on: one canonical seed. Solo voyages pass their own.
  const FLAGSHIP_SEED = 0x10070ace;
  function voyageSeed(s) { return (s >>> 0) || FLAGSHIP_SEED; }

  g.HoopShip = {
    CHUNK, TILE, GRAV, GRAV_LIST, FORMAT, ROOM_TYPES, TYPE_INDEX,
    FLAGSHIP_SEED, voyageSeed,
    mulberry32, hashInts, rngFor,
    ShipGenome, genomeFromLog,
    edgePorts, sectorField, generateChunk,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
