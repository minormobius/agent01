// hoop — the canvas world. (Phase 2: infinite.)
//
// The fixed 48×28 room is gone. The map is now an ENDLESS ship, stitched from
// ship.js chunks generated on demand around the camera (see ChunkField). You can
// walk forever; the frontier generates ahead of you, its character bent by the
// ship genome. Coordinates are unbounded world tiles — a place at (x,y) means the
// same tile on every machine for a given voyage seed.
//
// Three layers stack here, deepest first:
//   1. the deterministic ship   — floors / doors / walls + per-tile gravity
//   2. a CPU light pass         — emitters splatted into a light buffer (the
//                                 placeholder the WebGPU radiance-cascade pass
//                                 will replace; same input: ship.js light data)
//   3. the forum layer          — places (threads) + live peers + the player
//
// ship.js is a global script (loaded before this module), so we read it off the
// global rather than importing it.

const Ship = globalThis.HoopShip;
const C = Ship.CHUNK;
const FLOOR = Ship.TILE.FLOOR, DOOR = Ship.TILE.DOOR;
// gravity regime → a faint floor hue, so sectors read at a glance.
const GRAV_HUE = { normal: [70, 90, 80], spin: [96, 78, 120], none: [70, 120, 128], mag: [120, 96, 60] };
const SPAWN = { x: 24, y: 14 }; // the flagship landing — keeps the Hub thread reachable

// ── the infinite map ─────────────────────────────────────────────────────────
// Lazily generates + caches chunks; evicts the ones far from the camera. A thin
// "forced floor" overlay guarantees the flagship spawn room + every place tile is
// always walkable, independent of what the generator rolled there.
class ChunkField {
  constructor(seed, genome) {
    this.seed = Ship.voyageSeed(seed);
    this.genome = genome || null;
    this.cache = new Map();
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
    for (const k of this.cache.keys()) {
      const [x, y] = k.split(',').map(Number);
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) > 6) this.cache.delete(k);
    }
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
  addPlaceTile(wx, wy) { this.overlay.add(wx + ',' + wy); }

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

export class World {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.h = handlers;
    this.field = new ChunkField(Ship.FLAGSHIP_SEED, null);
    this.places = [];
    this.placeAt = new Map();
    this.player = { x: SPAWN.x, y: SPAWN.y, px: SPAWN.x, py: SPAWN.y };
    this.peers = new Map();
    this.selectedId = null;
    this.tile = 26;
    this.path = [];
    this._stepCooldown = 0;
    this._t0 = performance.now();
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
  start() { if (!this._raf) this._loop(); }
  destroy() { cancelAnimationFrame(this._raf); this._raf = null; window.removeEventListener('resize', this._onResize); }
  isFloor(x, y) { return this.field.isFloor(x, y); }
  placeKey(x, y) { return this.placeAt.get(`${x}-${y}`); }

  // ── input ─────────────────────────────────────────────────────────────────
  _bind() {
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.canvas.tabIndex = 0;
    this.canvas.addEventListener('keydown', (e) => this._onKey(e));
    this.canvas.addEventListener('mousemove', (e) => { this._hover = this._tileFromEvent(e); });
    this.canvas.addEventListener('mouseleave', () => { this._hover = null; });
    this.canvas.addEventListener('click', (e) => this._onClick(e));
  }
  _onKey(e) {
    const k = e.key.toLowerCase();
    const moves = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
    if (moves[k]) { e.preventDefault(); this.path = []; this._tryStep(...moves[k]); }
    else if (k === 'n') { e.preventDefault(); this.h.onDropHere && this.h.onDropHere(this.player.x, this.player.y); }
  }
  _tileFromEvent(e) {
    const r = this.canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left), cy = (e.clientY - r.top);
    const { ox, oy } = this._camera();
    return { x: Math.floor((cx - ox) / this.tile), y: Math.floor((cy - oy) / this.tile) };
  }
  _onClick(e) {
    this.canvas.focus();
    const t = this._tileFromEvent(e);
    const pl = this.placeKey(t.x, t.y);
    if (pl) { this._pathTo(t.x, t.y, true); this._announce(pl); }
    else if (this.isFloor(t.x, t.y)) this._pathTo(t.x, t.y, false);
  }

  // ── movement ────────────────────────────────────────────────────────────
  _tryStep(dx, dy) {
    const nx = this.player.x + dx, ny = this.player.y + dy;
    if (!this.isFloor(nx, ny)) return false;
    this.player.x = nx; this.player.y = ny;
    if (this.h.onMove) this.h.onMove(nx, ny);
    const pl = this.placeKey(nx, ny);
    if (pl) this._announce(pl);
    else if (this.h.onStatus) this.h.onStatus(`(${nx}, ${ny}) · ${this.field.regime(nx, ny)} gravity — N to drop a node`);
    return true;
  }
  _announce(place) {
    if (this.selectedId !== place.id && this.h.onSelectPlace) this.h.onSelectPlace(place);
    this.selectedId = place.id;
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
    this._stepCooldown -= 16;
    if (this.path.length && this._stepCooldown <= 0) {
      const [nx, ny] = this.path.shift();
      const dx = Math.sign(nx - this.player.x), dy = Math.sign(ny - this.player.y);
      if (!this._tryStep(dx, dy)) this.path = [];
      this._stepCooldown = 90;
    }
    this.player.px += (this.player.x - this.player.px) * 0.25;
    this.player.py += (this.player.y - this.player.py) * 0.25;
    for (const p of this.peers.values()) { p.px += (p.x - p.px) * 0.22; p.py += (p.y - p.py) * 0.22; }
    this._draw(performance.now());
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
  _lightAt(buf, x0, y0, W, wx, wy) {
    const bi = ((wy - y0) * W + (wx - x0)) * 3;
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
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(t * 0.74)}px "JetBrains Mono", ui-monospace, monospace`;

    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const sx = ox + x * t + t / 2, sy = oy + y * t + t / 2;
      const lit = this._lightAt(buf, x0, y0, W, x, y);
      const L = Math.min(1, (lit[0] + lit[1] + lit[2]) / 1.6);
      if (this.field.isFloor(x, y)) {
        const g = GRAV_HUE[this.field.regime(x, y)] || GRAV_HUE.normal;
        ctx.fillStyle = `rgb(${Math.round((g[0] * 0.5 + lit[0] * 180))},${Math.round((g[1] * 0.5 + lit[1] * 180))},${Math.round((g[2] * 0.5 + lit[2] * 180))})`;
        ctx.fillText('·', sx, sy);
      } else if (this._bordersFloor(x, y)) {
        const b = 60 + L * 120;
        ctx.fillStyle = `rgb(${Math.round(b * 0.7 + lit[0] * 120)},${Math.round(b + lit[1] * 120)},${Math.round(b * 0.85 + lit[2] * 120)})`;
        ctx.fillText('#', sx, sy);
      }
    }

    // ambient room-type glyphs at each visible room centre (faint, generated)
    const cx0 = Math.floor(x0 / C), cy0 = Math.floor(y0 / C), cx1 = Math.floor((x1 - 1) / C), cy1 = Math.floor((y1 - 1) / C);
    ctx.font = `${Math.floor(t * 0.6)}px "JetBrains Mono", ui-monospace, monospace`;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const ch = this.field.chunk(cx, cy), bx = cx * C, by = cy * C;
      for (const room of ch.rooms) {
        const wx = bx + room.cx, wy = by + room.cy;
        if (wx < x0 || wx >= x1 || wy < y0 || wy >= y1) continue;
        const lit = this._lightAt(buf, x0, y0, W, wx, wy);
        const a = Math.min(0.5, 0.12 + (lit[0] + lit[1] + lit[2]) / 4);
        ctx.fillStyle = room.accent + Math.round(a * 255).toString(16).padStart(2, '0');
        ctx.fillText(room.glyph, ox + wx * t + t / 2, oy + wy * t + t / 2);
      }
    }

    // places (forum threads)
    ctx.font = `${Math.floor(t * 0.82)}px "JetBrains Mono", ui-monospace, monospace`;
    for (const p of this.places) {
      if (p.x < x0 || p.x >= x1 || p.y < y0 || p.y >= y1) continue;
      const sx = ox + p.x * t + t / 2, sy = oy + p.y * t + t / 2;
      const dist = Math.hypot(p.x - this.player.x, p.y - this.player.y);
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
      const sx = ox + this._hover.x * t, sy = oy + this._hover.y * t;
      ctx.strokeStyle = 'rgba(120,200,160,0.35)'; ctx.lineWidth = 1;
      ctx.strokeRect(sx + 1, sy + 1, t - 2, t - 2);
    }

    for (const p of this.peers.values()) {
      const sx = ox + p.px * t + t / 2, sy = oy + p.py * t + t / 2;
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

    const px = ox + this.player.px * t + t / 2, py = oy + this.player.py * t + t / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(255,206,120,0.9)'; ctx.shadowBlur = 12 + 8 * pulse;
    ctx.fillStyle = '#ffce78';
    ctx.fillText('@', px, py);
    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0; y < this._vh; y += 3) ctx.fillRect(0, y, this._vw, 1);
  }

  _bordersFloor(x, y) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      if (this.field.isFloor(x + dx, y + dy)) return true;
    return false;
  }
}
