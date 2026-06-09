// hoop — the canvas world. (Phase 2: infinite. Phase 3: continuous + gravity.)
//
// The fixed 48×28 room is gone. The map is an ENDLESS ship, stitched from ship.js
// chunks generated on demand around the camera (see ChunkField). You can walk
// forever; the frontier generates ahead of you, its character bent by the ship
// genome. Coordinates are unbounded world tiles — a place at (x,y) means the same
// tile on every machine for a given voyage seed.
//
// Two big substrates replaced the grid here (the "voronoi ship" rewrite):
//
//   • THE DECK IS AN ADAPTIVE VORONOI MESH, not a tile grid. Each chunk scatters
//     sites whose DENSITY follows the detail: a fine ring of sites along every
//     floor│void boundary (so plates hug the hull), tight clusters around fixtures
//     and lights, and a coarse Poisson fill in open bays. Polygon cells (half-plane
//     clipping against the 3×3-neighbour sites, so plates cross chunk seams cleanly)
//     are the unit of plating AND of the light probe — light is sampled once per
//     cell, previewing the radiance-cascade probe density the WebGPU pass will use.
//
//   • MOVEMENT IS CONTINUOUS AND GRAVITY-AWARE, not grid-stepped. The player is a
//     point with velocity; the gravity regime of the cell under their feet sets the
//     handling — normal (snappy), mag (crisp, planted), spin (a tilt-drift you walk
//     against), none (zero-g: shove off and glide until a wall). The forum layer
//     stays tile-addressed: player.x/y is always the integer tile you occupy
//     (round of the continuous px/py), so places, drops, presence and click-to-walk
//     are unchanged. app.js sees the same World API it always did.
//
// ship.js is a global script (loaded before this module), so we read it off the
// global rather than importing it.

import { drawStalk, stalkModel } from './ink.js';

const Ship = globalThis.HoopShip;
const C = Ship.CHUNK;
const FLOOR = Ship.TILE.FLOOR, DOOR = Ship.TILE.DOOR;
// gravity regime → a faint floor hue, so sectors read at a glance.
const GRAV_HUE = { normal: [70, 90, 80], spin: [96, 78, 120], none: [70, 120, 128], mag: [120, 96, 60] };
const SPAWN = { x: 24, y: 14 }; // the flagship landing — keeps the Hub thread reachable
const CLIP_R = 3;               // max half-extent of a plate (clip-box radius, tiles)

// ── pure mesh kernel (exported for the headless selftest) ─────────────────────
// clipCell: Voronoi cell of site A as a polygon, by clipping a box against the
// perpendicular bisectors with A's nearest neighbours. `others` = [{x,y,hull},…].
export function clipCell(A, others, R = CLIP_R) {
  let poly = [[A.x - R, A.y - R], [A.x + R, A.y - R], [A.x + R, A.y + R], [A.x - R, A.y + R]];
  const near = others
    .map((s) => [s, (s.x - A.x) ** 2 + (s.y - A.y) ** 2])
    .filter((p) => p[1] > 1e-9)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 20)
    .map((p) => p[0]);
  for (const B of near) {
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, nx = A.x - B.x, ny = A.y - B.y; // keep side toward A
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = (a[0] - mx) * nx + (a[1] - my) * ny, db = (b[0] - mx) * nx + (b[1] - my) * ny;
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) { const tt = da / (da - db); out.push([a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt]); }
    }
    poly = out;
    if (poly.length < 3) break;
  }
  return poly;
}

// ── the infinite map ─────────────────────────────────────────────────────────
export class ChunkField {
  constructor(seed, genome) {
    this.seed = Ship.voyageSeed(seed);
    this.genome = genome || null;
    this.cache = new Map();
    this.sites_ = new Map();         // per-chunk adaptive site list (cached)
    this.mesh_ = new Map();          // per-chunk voronoi cells + fixtures (cached)
    this.overlay = new Set();        // "x,y" forced-floor tiles
    this._carveSpawn();
  }
  _key(cx, cy) { return cx + ',' + cy; }
  chunk(cx, cy) {
    const k = this._key(cx, cy);
    let c = this.cache.get(k);
    if (!c) {
      c = Ship.generateChunk(this.seed, cx, cy, this.genome);
      this.cache.set(k, c);
      if (this.cache.size > 256) this._evict(cx, cy);
    }
    return c;
  }
  _evict(cx, cy) {
    for (const map of [this.cache, this.sites_, this.mesh_])
      for (const k of map.keys()) { const [x, y] = k.split(',').map(Number); if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) > 6) map.delete(k); }
  }
  _local(wx, wy) {
    const cx = Math.floor(wx / C), cy = Math.floor(wy / C);
    return { cx, cy, lx: wx - cx * C, ly: wy - cy * C };
  }
  tile(wx, wy) {
    if (this.overlay.has(wx + ',' + wy)) return FLOOR;
    const { cx, cy, lx, ly } = this._local(wx, wy);
    return this.chunk(cx, cy).tiles[ly * C + lx];
  }
  regime(wx, wy) {
    if (this.overlay.has(wx + ',' + wy)) return 'normal';
    const { cx, cy, lx, ly } = this._local(wx, wy);
    const g = this.chunk(cx, cy).grav[ly * C + lx];
    return Ship.GRAV_LIST[g - 1] || 'normal';
  }
  isFloor(wx, wy) { const t = this.tile(wx, wy); return t === FLOOR || t === DOOR; }
  addPlaceTile(wx, wy) { this.overlay.add(wx + ',' + wy); this.sites_.clear(); this.mesh_.clear(); } // remesh: a place adds floor

  // ── adaptive sites (deterministic per chunk) ──────────────────────────────
  // ONE plate site per floor tile — full coverage, so no hall ever reads as void
  // (the old sparse fill starved 1-tile corridors of plates) — plus a deduped hull
  // site at every void tile that touches floor, which clips the tile plates crisply
  // at the wall face and densifies plates along the hull. A site's identity depends
  // only on its home chunk, so neighbours agree on shared sites → seamless borders.
  // Bump SUBDIV>1 to subdivide each tile into a finer plate lattice.
  sites(cx, cy) {
    const k = this._key(cx, cy);
    let s = this.sites_.get(k);
    if (s) return s;
    const SUBDIV = 1;                         // plate sites per tile side (resolution knob)
    const ch = this.chunk(cx, cy), bx = cx * C, by = cy * C, out = [];
    const jr = Ship.rngFor(this.seed, 77, cx, cy);
    const voidSeen = new Set();
    for (let ly = 0; ly < C; ly++) for (let lx = 0; lx < C; lx++) {
      const wx = bx + lx, wy = by + ly;
      if (!this.isFloor(wx, wy)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const vx = wx + dx, vy = wy + dy;
        if (!this.isFloor(vx, vy)) { const vk = vx + ',' + vy; if (!voidSeen.has(vk)) { voidSeen.add(vk); out.push({ x: vx + 0.5, y: vy + 0.5, hull: true }); } }
      }
      const regime = this.regime(wx, wy);
      for (let sy = 0; sy < SUBDIV; sy++) for (let sx = 0; sx < SUBDIV; sx++) {
        const h = Ship.hashInts(this.seed, wx * SUBDIV + sx, wy * SUBDIV + sy, 3);
        const cell = 1 / SUBDIV, jit = cell * 0.42;
        out.push({
          x: wx + (sx + 0.5) * cell + (jr() - 0.5) * jit,
          y: wy + (sy + 0.5) * cell + (jr() - 0.5) * jit,
          hull: false, regime,
          albedo: [148 + ((h & 31) - 16), 158 + (((h >> 5) & 31) - 16), 166 + (((h >> 10) & 31) - 16)],
        });
      }
    }
    // garden milfoil fixtures (rendered separately; not plate sites)
    const fixtures = [];
    for (const room of ch.rooms) if (room.type === 'garden') {
      const frng = Ship.rngFor(this.seed, 55, cx * 131 + room.x, cy * 131 + room.y);
      const n = 2 + Math.floor(frng() * Math.min(5, (room.w * room.h) / 6));
      for (let i = 0; i < n; i++) {
        const lx = room.x + 1 + Math.floor(frng() * Math.max(1, room.w - 2));
        const ly = room.y + 1 + Math.floor(frng() * Math.max(1, room.h - 2));
        fixtures.push({ kind: 'stalk', wx: bx + lx + 0.5, wy: by + ly + 0.9, ang: (frng() - 0.5) * 0.5, model: stalkModel(frng) });
      }
    }
    s = { all: out, fixtures };
    this.sites_.set(k, s);
    return s;
  }

  // ── voronoi plates for a chunk (cells whose SITE lives in this chunk) ──────
  // Clipped against the 3×3 neighbourhood so plates are seamless across borders.
  // A coarse bucket grid keeps the k-nearest search local. Guarded: on any failure
  // the chunk renders via the flat-fill fallback rather than throwing.
  mesh(cx, cy) {
    const k = this._key(cx, cy);
    let m = this.mesh_.get(k);
    if (m) return m;
    try {
      const here = this.sites(cx, cy);
      // gather neighbourhood sites + bucket them (bucket = 1 tile; plates are tile-sized)
      const buckets = new Map(), bkey = (x, y) => Math.floor(x) + ',' + Math.floor(y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
        for (const s of this.sites(cx + dx, cy + dy).all) { const bk = bkey(s.x, s.y); (buckets.get(bk) || buckets.set(bk, []).get(bk)).push(s); }
      const candidatesNear = (A) => {
        const res = [], bx = Math.floor(A.x), by = Math.floor(A.y);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const b = buckets.get((bx + dx) + ',' + (by + dy)); if (b) for (const s of b) res.push(s); }
        return res;
      };
      // jittered ink polyline for one seam edge, baked in world coords (deterministic).
      const inkSeg = (a, b, wWorld, sd) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, pxn = -dy / L, pyn = dx / L;
        const segs = Math.max(2, Math.round(L * 3.6)), rng = Ship.rngFor(this.seed, 88, sd & 0xffff, (sd >>> 16) & 0xffff), pts = [];
        for (let i = 0; i <= segs; i++) { const t = i / segs, j = (i === 0 || i === segs) ? 0 : (rng() - 0.5) * wWorld * 1.6; pts.push(a[0] + dx * t + pxn * j, a[1] + dy * t + pyn * j); }
        return pts;
      };
      const cells = [], hullSeg = [], panelSeg = [];
      for (const A of here.all) {
        if (A.hull) continue;
        const cand = candidatesNear(A);
        const poly = clipCell(A, cand);
        if (poly.length < 3) continue;
        const edges = [];
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], b = poly[(i + 1) % poly.length];
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          let nbHull = false, bd = 1e9;
          for (const s of cand) { if (s === A) continue; const d = (s.x - mx) ** 2 + (s.y - my) ** 2; if (d < bd) { bd = d; nbHull = s.hull; } }
          edges.push({ a, b, hull: nbHull });
          const sd = (Math.round(a[0] * 64 + b[0]) ^ Math.round((a[1] * 64 + b[1]) * 131)) >>> 0;
          (nbHull ? hullSeg : panelSeg).push(inkSeg(a, b, nbHull ? 0.09 : 0.045, sd));
        }
        cells.push({ A, poly, edges, albedo: A.albedo, regime: A.regime });
      }
      m = { cells, fixtures: here.fixtures, hullSeg, panelSeg, ok: true };
    } catch (e) {
      m = { cells: [], fixtures: [], hullSeg: [], panelSeg: [], ok: false }; // flat-fill fallback keeps the deck visible
    }
    this.mesh_.set(k, m);
    if (this.mesh_.size > 256) for (const kk of this.mesh_.keys()) { const [x, y] = kk.split(',').map(Number); if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) > 6) this.mesh_.delete(kk); }
    return m;
  }

  // A guaranteed spawn room + a corridor punched to the containing chunk's hub,
  // so the player always lands on ground with a way out into the generated ship.
  _carveSpawn() {
    for (let y = SPAWN.y - 2; y <= SPAWN.y + 2; y++)
      for (let x = SPAWN.x - 3; x <= SPAWN.x + 3; x++) this.overlay.add(x + ',' + y);
    const hubX = Math.floor(SPAWN.x / C) * C + (C >> 1), hubY = Math.floor(SPAWN.y / C) * C + (C >> 1);
    const sx = Math.sign(hubX - SPAWN.x) || 1, sy = Math.sign(hubY - SPAWN.y) || 1;
    for (let x = SPAWN.x; x !== hubX; x += sx) this.overlay.add(x + ',' + SPAWN.y);
    for (let y = SPAWN.y; y !== hubY; y += sy) this.overlay.add(hubX + ',' + y);
  }
}

// ── continuous gravity-aware movement (exported pure kernel for the selftest) ──
// Integrates one frame: input + the cell's gravity regime → velocity; axis-
// separated collision against the floor field (round() = occupied tile) so the
// player slides along walls (and, in zero-g, glides along them). Returns the new
// {px,py,vx,vy}; the caller maps round(px),round(py) back to the forum tile.
export function stepMotion(P, input, regime, isFloor, dt = 1) {
  let { px, py, vx, vy } = P;
  let { ix, iy, arriving } = input;
  const L = Math.hypot(ix, iy) || 1; ix /= L; iy /= L;
  if (regime === 'none') { vx += ix * 0.016 * dt; vy += iy * 0.016 * dt; vx *= 0.99; vy *= 0.99; }          // glide
  else if (regime === 'spin') { vx += ix * 0.05 * dt; vy += iy * 0.05 * dt; vx += 0.010 * dt; vy += 0.005 * dt; vx *= 0.85; vy *= 0.85; } // tilt-drift
  else if (regime === 'mag') { vx += ix * 0.075 * dt; vy += iy * 0.075 * dt; vx *= 0.64; vy *= 0.64; }       // grounded, crisp
  else { vx += ix * 0.06 * dt; vy += iy * 0.06 * dt; vx *= 0.78; vy *= 0.78; }                               // normal
  if (arriving) { vx *= 0.6; vy *= 0.6; }                                                                    // damp final approach (taps don't overshoot)
  const sp = Math.hypot(vx, vy), CAP = 0.2; if (sp > CAP) { vx *= CAP / sp; vy *= CAP / sp; }
  const nx = px + vx * dt;
  if (isFloor(Math.round(nx), Math.round(py))) px = nx; else vx = regime === 'none' ? -vx * 0.25 : 0;        // bounce in zero-g, else stop
  const ny = py + vy * dt;
  if (isFloor(Math.round(px), Math.round(ny))) py = ny; else vy = regime === 'none' ? -vy * 0.25 : 0;
  return { px, py, vx, vy };
}

export class World {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.h = handlers;
    this.field = new ChunkField(Ship.FLAGSHIP_SEED, null);
    this.places = [];
    this.placeAt = new Map();
    // x/y = integer tile occupied (the forum address); px/py/vx/vy = continuous physics.
    this.player = { x: SPAWN.x, y: SPAWN.y, px: SPAWN.x, py: SPAWN.y, vx: 0, vy: 0 };
    this.peers = new Map();
    this.selectedId = null;
    this.tile = 26;
    this.keys = {};            // held movement keys
    this.path = [];            // tap/click route waypoints (steered through continuously)
    this._t0 = performance.now();
    this._last = this._t0;
    this._raf = null;
    this._hover = null;
    this._lbuf = null; this._lbw = 0; this._lbh = 0; // light buffer + dims
    this._bind();
    this.resize();
  }

  // ── public API (unchanged for app.js) ────────────────────────────────────
  setPlaces(places) {
    this.places = places;
    this.placeAt = new Map(places.map((p) => [`${p.x}-${p.y}`, p]));
    for (const p of places) this.field.addPlaceTile(p.x, p.y); // places are always walkable
  }
  select(id) {
    this.selectedId = id;
    const p = this.places.find((q) => q.id === id);
    if (p) this._pathTo(p.x, p.y, true);
  }
  setPeer(did, handle, x, y) {
    let p = this.peers.get(did);
    if (!p) {
      let h = 0; for (const ch of did) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      p = { handle, x, y, px: x, py: y, hue: h % 360 };
      this.peers.set(did, p);
    } else { p.handle = handle; p.x = x; p.y = y; }
  }
  removePeer(did) { this.peers.delete(did); }
  clearPeers() { this.peers.clear(); }
  start() { if (!this._raf) { this._last = performance.now(); this._loop(); } }
  destroy() { cancelAnimationFrame(this._raf); this._raf = null; window.removeEventListener('resize', this._onResize); }
  isFloor(x, y) { return this.field.isFloor(x, y); }
  placeKey(x, y) { return this.placeAt.get(`${x}-${y}`); }

  // ── input ─────────────────────────────────────────────────────────────────
  _bind() {
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.canvas.tabIndex = 0;
    const MV = new Set(['arrowup', 'w', 'arrowdown', 's', 'arrowleft', 'a', 'arrowright', 'd']);
    this.canvas.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (MV.has(k)) { e.preventDefault(); this.keys[k] = true; this.path = []; }      // manual input cancels auto-walk
      else if (k === 'n') { e.preventDefault(); this.h.onDropHere && this.h.onDropHere(this.player.x, this.player.y); }
    });
    this.canvas.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    this.canvas.addEventListener('blur', () => { this.keys = {}; });
    this.canvas.addEventListener('mousemove', (e) => { this._hover = this._tileFromEvent(e); });
    this.canvas.addEventListener('mouseleave', () => { this._hover = null; });
    this.canvas.addEventListener('click', (e) => this._onClick(e));
  }
  _tileFromEvent(e) {
    const r = this.canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left), cy = (e.clientY - r.top);
    const { ox, oy } = this._camera();
    return { x: Math.round((cx - ox) / this.tile - 0.5), y: Math.round((cy - oy) / this.tile - 0.5) };
  }
  _onClick(e) {
    this.canvas.focus();
    const t = this._tileFromEvent(e);
    const pl = this.placeKey(t.x, t.y);
    if (pl) { this._pathTo(t.x, t.y, true); this._announce(pl); }
    else if (this.isFloor(t.x, t.y)) this._pathTo(t.x, t.y, false);
  }

  // ── movement ────────────────────────────────────────────────────────────
  _announce(place) {
    if (this.selectedId !== place.id && this.h.onSelectPlace) this.h.onSelectPlace(place);
    this.selectedId = place.id;
  }
  // input vector this frame: held keys take priority; else steer toward the path.
  _inputVector() {
    let ix = 0, iy = 0;
    if (this.keys.w || this.keys.arrowup) iy -= 1;
    if (this.keys.s || this.keys.arrowdown) iy += 1;
    if (this.keys.a || this.keys.arrowleft) ix -= 1;
    if (this.keys.d || this.keys.arrowright) ix += 1;
    let arriving = false;
    if (!ix && !iy && this.path.length) {
      const [wx, wy] = this.path[0];
      const dx = wx - this.player.px, dy = wy - this.player.py, d = Math.hypot(dx, dy);
      if (d < 0.32) this.path.shift();
      else { ix = dx; iy = dy; if (this.path.length === 1 && d < 1.3) arriving = true; }
    }
    return { ix, iy, arriving };
  }
  // BFS bounded to a window around the player (the world is infinite).
  _pathTo(tx, ty, adjacentOk) {
    if (!this.isFloor(tx, ty) && !adjacentOk) return;
    if (Math.abs(tx - this.player.x) > 48 || Math.abs(ty - this.player.y) > 48) return;
    const start = `${this.player.x}-${this.player.y}`, goal = `${tx}-${ty}`;
    const q = [[this.player.x, this.player.y]];
    const prev = new Map([[start, null]]);
    let found = false, steps = 0;
    while (q.length && steps++ < 6000) {
      const [x, y] = q.shift();
      if (`${x}-${y}` === goal) { found = true; break; }
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = x + dx, ny = y + dy, key = `${nx}-${ny}`;
        if (prev.has(key)) continue;
        if (Math.abs(nx - this.player.x) > 50 || Math.abs(ny - this.player.y) > 50) continue;
        if (this.isFloor(nx, ny) || key === goal) { prev.set(key, `${x}-${y}`); q.push([nx, ny]); }
      }
    }
    if (!found) return;
    const path = [];
    let cur = goal;
    while (cur && cur !== start) { const [x, y] = cur.split('-').map(Number); path.push([x, y]); cur = prev.get(cur); }
    path.reverse();
    this.path = path;
  }

  // ── render loop ───────────────────────────────────────────────────────────
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(r.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._vw = r.width; this._vh = r.height;
    this.tile = Math.max(18, Math.min(30, Math.floor(Math.min(r.width, r.height) / 18)));
  }
  _camera() {
    const ox = this._vw / 2 - (this.player.px + 0.5) * this.tile;
    const oy = this._vh / 2 - (this.player.py + 0.5) * this.tile;
    return { ox, oy };
  }
  _loop() {
    this._raf = requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt = Math.min(2.2, Math.max(0.4, (now - this._last) / 16)); this._last = now;
    // continuous physics, gravity-aware
    const P = this.player;
    const reg = this.field.regime(P.x, P.y);
    const next = stepMotion(P, this._inputVector(), reg, (x, y) => this.field.isFloor(x, y), dt);
    P.px = next.px; P.py = next.py; P.vx = next.vx; P.vy = next.vy;
    // map the continuous position back to the forum tile; fire handlers on change
    const tx = Math.round(P.px), ty = Math.round(P.py);
    if (tx !== P.x || ty !== P.y) {
      P.x = tx; P.y = ty;
      if (this.h.onMove) this.h.onMove(tx, ty);
      const pl = this.placeKey(tx, ty);
      if (pl) this._announce(pl);
      else if (this.h.onStatus) this.h.onStatus(`(${tx}, ${ty}) · ${this.field.regime(tx, ty)} gravity — N to drop a node`);
    }
    for (const p of this.peers.values()) { p.px += (p.x - p.px) * 0.22; p.py += (p.y - p.py) * 0.22; }
    this._draw(now);
  }

  // Splat every visible emitter into an additive RGB light buffer covering the
  // view. No shadows yet — that's the WebGPU radiance-cascade pass (Phase 6);
  // this CPU fallback is the same shape (consume emitters → light buffer).
  _buildLight(x0, y0, x1, y1, now) {
    const W = x1 - x0, H = y1 - y0;
    if (!this._lbuf || this._lbw !== W || this._lbh !== H) { this._lbuf = new Float32Array(W * H * 3); this._lbw = W; this._lbh = H; }
    const buf = this._lbuf; buf.fill(0.04); // faint ambient — the ship is dark
    const cx0 = Math.floor(x0 / C), cy0 = Math.floor(y0 / C), cx1 = Math.floor((x1 - 1) / C), cy1 = Math.floor((y1 - 1) / C);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const ch = this.field.chunk(cx, cy), bx = cx * C, by = cy * C;
      for (const room of ch.rooms) for (const L of room.lights) {
        const ex = bx + L.x, ey = by + L.y;
        const flick = L.flicker ? (1 - L.flicker * 0.5 + L.flicker * 0.5 * Math.sin(now / 130 + ex * 1.7 + ey)) : 1;
        const I = L.intensity * flick, R = L.radius;
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          const wx = ex + dx, wy = ey + dy;
          if (wx < x0 || wx >= x1 || wy < y0 || wy >= y1) continue;
          const d = Math.hypot(dx, dy); if (d > R) continue;
          const f = I * (1 - d / R) * (1 - d / R);
          const bi = ((wy - y0) * W + (wx - x0)) * 3;
          buf[bi] += L.rgb[0] / 255 * f; buf[bi + 1] += L.rgb[1] / 255 * f; buf[bi + 2] += L.rgb[2] / 255 * f;
        }
      }
    }
    return buf;
  }
  _lightAt(buf, x0, y0, x1, y1, W, wx, wy) {
    const cx = Math.min(x1 - 1, Math.max(x0, wx)), cy = Math.min(y1 - 1, Math.max(y0, wy));
    const bi = ((cy - y0) * W + (cx - x0)) * 3;
    return [buf[bi], buf[bi + 1], buf[bi + 2]];
  }

  _draw(now) {
    const ctx = this.ctx, t = this.tile;
    const pulse = 0.5 + 0.5 * Math.sin((now - this._t0) / 600);
    ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, this._vw, this._vh);
    const { ox, oy } = this._camera();
    const x0 = Math.floor(-ox / t) - 1, y0 = Math.floor(-oy / t) - 1;
    const x1 = Math.ceil((this._vw - ox) / t) + 1, y1 = Math.ceil((this._vh - oy) / t) + 1;
    const W = x1 - x0;
    const buf = this._buildLight(x0, y0, x1, y1, now);
    const SX = (wx) => ox + wx * t, SY = (wy) => oy + wy * t;
    const cx0 = Math.floor(x0 / C), cy0 = Math.floor(y0 / C), cx1 = Math.floor((x1 - 1) / C), cy1 = Math.floor((y1 - 1) / C);

    // ── deck: adaptive voronoi plates, gravity-tinted, lit (light per cell = probe) ──
    for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
      const m = this.field.mesh(cx, cy);
      if (!m.ok || !m.cells.length) { this._flatFill(ctx, cx, cy, x0, y0, x1, y1, W, buf, ox, oy, t); continue; }
      for (const cell of m.cells) {
        const A = cell.A;
        if (A.x < x0 - CLIP_R || A.x > x1 + CLIP_R || A.y < y0 - CLIP_R || A.y > y1 + CLIP_R) continue;
        const lit = this._lightAt(buf, x0, y0, x1, y1, W, Math.round(A.x), Math.round(A.y));
        const g = GRAV_HUE[cell.regime] || GRAV_HUE.normal, amb = 0.22, a = cell.albedo;
        ctx.fillStyle = `rgb(${Math.min(255, a[0] * amb * 0.5 + g[0] * 0.16 + lit[0] * 205) | 0},${Math.min(255, a[1] * amb * 0.5 + g[1] * 0.16 + lit[1] * 205) | 0},${Math.min(255, a[2] * amb * 0.5 + g[2] * 0.16 + lit[2] * 205) | 0})`;
        ctx.beginPath(); ctx.moveTo(SX(cell.poly[0][0]), SY(cell.poly[0][1]));
        for (let i = 1; i < cell.poly.length; i++) ctx.lineTo(SX(cell.poly[i][0]), SY(cell.poly[i][1]));
        ctx.closePath(); ctx.fill();
      }
    }
    // ── seams: panel (plate│plate, faint) then hull (plate│void, heavy ink) ──
    // Seams are pre-baked per chunk and stroked as ONE batched path each, so 10×ing
    // the plate count costs ~2 strokes per visible chunk instead of thousands.
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const strokeSegs = (segs, width, style) => {
      if (!segs.length) return;
      ctx.beginPath();
      for (const pl of segs) { ctx.moveTo(SX(pl[0]), SY(pl[1])); for (let i = 2; i < pl.length; i += 2) ctx.lineTo(SX(pl[i]), SY(pl[i + 1])); }
      ctx.lineWidth = width; ctx.strokeStyle = style; ctx.stroke();
    };
    for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
      const m = this.field.mesh(cx, cy); if (!m.ok) continue;
      strokeSegs(m.panelSeg, Math.max(0.5, t * 0.04), 'rgba(120,134,138,0.34)');
      strokeSegs(m.hullSeg, Math.max(1.4, t * 0.09), 'rgba(14,19,23,0.94)');
    }
    // ── fixtures: garden milfoil (reuses the /yarrow drawStalk) ──
    for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
      for (const f of this.field.mesh(cx, cy).fixtures) {
        if (f.kind !== 'stalk' || f.wx < x0 - 1 || f.wx >= x1 + 1 || f.wy < y0 - 1 || f.wy >= y1 + 1) continue;
        const lit = this._lightAt(buf, x0, y0, x1, y1, W, Math.floor(f.wx), Math.floor(f.wy));
        const lL = Math.min(1.15, 0.28 + (lit[0] + lit[1] + lit[2]) / 1.2), m = f.model;
        drawStalk(ctx, {
          lenPx: m.lenTiles * t, diaPx: m.diaFrac * t,
          col: { h: m.col.h, s: m.col.s, l: m.col.l * lL },
          warp: m.warp, warpDir: m.warpDir, nodes: m.nodes, check: 0, grainSeed: m.grainSeed, taper: m.taper,
        }, { x: SX(f.wx), y: SY(f.wy), ang: f.ang, detail: Math.min(1, t / 26), fuzz: false, ends: false });
      }
    }

    // ambient room-type glyphs at each visible room centre (faint, generated)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(t * 0.6)}px "JetBrains Mono", ui-monospace, monospace`;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const ch = this.field.chunk(cx, cy), bx = cx * C, by = cy * C;
      for (const room of ch.rooms) {
        const wx = bx + room.cx, wy = by + room.cy;
        if (wx < x0 || wx >= x1 || wy < y0 || wy >= y1) continue;
        const lit = this._lightAt(buf, x0, y0, x1, y1, W, wx, wy);
        const a = Math.min(0.5, 0.12 + (lit[0] + lit[1] + lit[2]) / 4);
        ctx.fillStyle = room.accent + Math.round(a * 255).toString(16).padStart(2, '0');
        ctx.fillText(room.glyph, SX(wx) + t / 2, SY(wy) + t / 2);
      }
    }

    // places (forum threads)
    ctx.font = `${Math.floor(t * 0.82)}px "JetBrains Mono", ui-monospace, monospace`;
    for (const p of this.places) {
      if (p.x < x0 || p.x >= x1 || p.y < y0 || p.y >= y1) continue;
      const sx = SX(p.x) + t / 2, sy = SY(p.y) + t / 2;
      const dist = Math.hypot(p.x - this.player.px, p.y - this.player.py);
      const sel = p.id === this.selectedId;
      if (sel) {
        ctx.strokeStyle = `rgba(244,191,98,${0.5 + 0.4 * pulse})`; ctx.lineWidth = 2;
        ctx.strokeRect(sx - t / 2 + 2, sy - t / 2 + 2, t - 4, t - 4);
      }
      ctx.save();
      ctx.shadowColor = 'rgba(244,191,98,0.8)'; ctx.shadowBlur = sel ? 18 : 10;
      ctx.fillStyle = 'rgba(245,200,110,0.95)';
      ctx.fillText(p.glyph || '◆', sx, sy);
      ctx.restore();
      if (dist < 7 || sel) {
        ctx.font = `${Math.max(10, Math.floor(t * 0.42))}px ui-sans-serif, system-ui`;
        ctx.fillStyle = 'rgba(224,232,228,0.92)';
        ctx.fillText(p.title, sx, sy - t * 0.72);
        ctx.font = `${Math.floor(t * 0.82)}px "JetBrains Mono", ui-monospace, monospace`;
      }
    }

    if (this._hover && this.isFloor(this._hover.x, this._hover.y)) {
      const sx = SX(this._hover.x), sy = SY(this._hover.y);
      ctx.strokeStyle = 'rgba(120,200,160,0.35)'; ctx.lineWidth = 1;
      ctx.strokeRect(sx + 1, sy + 1, t - 2, t - 2);
    }

    for (const p of this.peers.values()) {
      const sx = SX(p.px) + t / 2, sy = SY(p.py) + t / 2;
      ctx.save();
      ctx.shadowColor = `hsl(${p.hue} 80% 60%)`; ctx.shadowBlur = 10;
      ctx.fillStyle = `hsl(${p.hue} 85% 66%)`;
      ctx.fillText('@', sx, sy);
      ctx.restore();
      ctx.font = `${Math.max(9, Math.floor(t * 0.4))}px ui-sans-serif, system-ui`;
      ctx.fillStyle = `hsl(${p.hue} 60% 78%)`;
      ctx.fillText('@' + p.handle, sx, sy - t * 0.66);
      ctx.font = `${Math.floor(t * 0.82)}px "JetBrains Mono", ui-monospace, monospace`;
    }

    const px = SX(this.player.px) + t / 2, py = SY(this.player.py) + t / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(255,206,120,0.9)'; ctx.shadowBlur = 12 + 8 * pulse;
    ctx.fillStyle = '#ffce78';
    ctx.fillText('@', px, py);
    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0; y < this._vh; y += 3) ctx.fillRect(0, y, this._vw, 1);
  }

  // Fallback deck for a chunk whose mesh failed to build: flat-lit floor tiles, so
  // the world is never a black hole even if the voronoi pass throws.
  _flatFill(ctx, cx, cy, x0, y0, x1, y1, W, buf, ox, oy, t) {
    const bx = cx * C, by = cy * C;
    for (let ly = 0; ly < C; ly++) for (let lx = 0; lx < C; lx++) {
      const wx = bx + lx, wy = by + ly;
      if (wx < x0 || wx >= x1 || wy < y0 || wy >= y1 || !this.field.isFloor(wx, wy)) continue;
      const g = GRAV_HUE[this.field.regime(wx, wy)] || GRAV_HUE.normal;
      const lit = this._lightAt(buf, x0, y0, x1, y1, W, wx, wy);
      ctx.fillStyle = `rgb(${Math.min(255, 70 + g[0] * 0.16 + lit[0] * 205) | 0},${Math.min(255, 78 + g[1] * 0.16 + lit[1] * 205) | 0},${Math.min(255, 84 + g[2] * 0.16 + lit[2] * 205) | 0})`;
      ctx.fillRect(ox + wx * t, oy + wy * t, t + 1, t + 1);
    }
  }
}
