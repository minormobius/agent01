// hoop — the canvas adventure world.
//
// A glyph-grid overworld (Caves-of-Qud flavour) where each *place* is a node of
// "the infinite game" that anchors a forum thread. You walk the @ around; step
// onto a place to open its conversation; drop a new node at your feet to start a
// new thread. The map is generated from a FIXED seed so every player sees the
// same world and tile coordinates mean the same thing across atproto repos.

const TILE = { VOID: 0, FLOOR: 1 };
export const WORLD_W = 48;
export const WORLD_H = 28;
const SEED = 0x10070ace; // fixed → deterministic world

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Rooms centred on the seed-place coordinates (so those tiles are always floor),
// plus a few filler chambers for the world to breathe. Connected with corridors.
const ROOMS = [
  [24, 14, 9, 7], [14, 9, 9, 6], [35, 8, 9, 6], [33, 20, 9, 6], [12, 20, 9, 6],
  [24, 6, 7, 5], [42, 14, 6, 6], [6, 14, 6, 6], [24, 22, 7, 5],
];

function buildMap() {
  const grid = new Uint8Array(WORLD_W * WORLD_H); // VOID
  const at = (x, y) => y * WORLD_W + x;
  const carve = (x, y) => {
    if (x >= 0 && x < WORLD_W && y >= 0 && y < WORLD_H) grid[at(x, y)] = TILE.FLOOR;
  };
  for (const [cx, cy, w, h] of ROOMS) {
    for (let y = cy - (h >> 1); y <= cy + (h >> 1); y++)
      for (let x = cx - (w >> 1); x <= cx + (w >> 1); x++) carve(x, y);
  }
  // L-shaped corridors connecting each room centre to the next.
  for (let i = 1; i < ROOMS.length; i++) {
    let [ax, ay] = ROOMS[i - 1], [bx, by] = ROOMS[i];
    const sx = Math.sign(bx - ax) || 1, sy = Math.sign(by - ay) || 1;
    for (let x = ax; x !== bx; x += sx) carve(x, ay);
    for (let y = ay; y !== by; y += sy) carve(bx, y);
  }
  return grid;
}

export class World {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.h = handlers; // { onSelectPlace(place), onMoveToEmpty(x,y), onStatus(text) }
    this.grid = buildMap();
    this.places = [];          // [{id,x,y,glyph,title,...}]
    this.placeAt = new Map();  // "x-y" -> place
    this.player = { x: 24, y: 14, px: 24, py: 14 }; // px/py = smoothed render pos
    this.selectedId = null;
    this.tile = 26;
    this.path = [];
    this._stepCooldown = 0;
    this._t0 = performance.now();
    this._raf = null;
    this._hover = null;
    this._bind();
    this.resize();
  }

  // ── public API ──────────────────────────────────────────────────────────
  setPlaces(places) {
    this.places = places;
    this.placeAt = new Map(places.map((p) => [`${p.x}-${p.y}`, p]));
  }
  select(id) {
    this.selectedId = id;
    const p = this.places.find((q) => q.id === id);
    if (p) this._pathTo(p.x, p.y, true);
  }
  start() { if (!this._raf) this._loop(); }
  destroy() { cancelAnimationFrame(this._raf); this._raf = null; window.removeEventListener('resize', this._onResize); }

  isFloor(x, y) {
    return x >= 0 && x < WORLD_W && y >= 0 && y < WORLD_H && this.grid[y * WORLD_W + x] === TILE.FLOOR;
  }
  placeKey(x, y) { return this.placeAt.get(`${x}-${y}`); }

  // ── input ───────────────────────────────────────────────────────────────
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
    const pl = this.placeKey(nx, ny);
    if (pl) this._announce(pl);
    else if (this.h.onStatus) this.h.onStatus(`(${nx}, ${ny}) — empty floor. Press N to drop a node here.`);
    return true;
  }

  _announce(place) {
    if (this.selectedId !== place.id && this.h.onSelectPlace) this.h.onSelectPlace(place);
    this.selectedId = place.id;
  }

  // BFS over floor tiles; sets this.path (excluding the start tile).
  _pathTo(tx, ty, adjacentOk) {
    if (!this.isFloor(tx, ty) && !adjacentOk) return;
    const start = `${this.player.x}-${this.player.y}`;
    const goal = `${tx}-${ty}`;
    const q = [[this.player.x, this.player.y]];
    const prev = new Map([[start, null]]);
    let found = false;
    while (q.length) {
      const [x, y] = q.shift();
      if (`${x}-${y}` === goal) { found = true; break; }
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = x + dx, ny = y + dy, key = `${nx}-${ny}`;
        if (prev.has(key)) continue;
        // allow stepping onto the goal tile even if it's a place; floors otherwise
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

  // ── render loop ─────────────────────────────────────────────────────────
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(r.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._vw = r.width; this._vh = r.height;
    // tile size scales a little with viewport, clamped for legibility
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
    // follow a queued path one tile at a time
    this._stepCooldown -= 16;
    if (this.path.length && this._stepCooldown <= 0) {
      const [nx, ny] = this.path.shift();
      const dx = Math.sign(nx - this.player.x), dy = Math.sign(ny - this.player.y);
      if (!this._tryStep(dx, dy)) this.path = [];
      this._stepCooldown = 90;
    }
    // smooth camera toward player tile
    this.player.px += (this.player.x - this.player.px) * 0.25;
    this.player.py += (this.player.y - this.player.py) * 0.25;
    this._draw(now);
  }

  _draw(now) {
    const ctx = this.ctx, t = this.tile;
    const pulse = 0.5 + 0.5 * Math.sin((now - this._t0) / 600);
    ctx.fillStyle = '#07090c';
    ctx.fillRect(0, 0, this._vw, this._vh);
    const { ox, oy } = this._camera();
    const x0 = Math.max(0, Math.floor(-ox / t) - 1);
    const y0 = Math.max(0, Math.floor(-oy / t) - 1);
    const x1 = Math.min(WORLD_W, Math.ceil((this._vw - ox) / t) + 1);
    const y1 = Math.min(WORLD_H, Math.ceil((this._vh - oy) / t) + 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(t * 0.74)}px "JetBrains Mono", ui-monospace, monospace`;

    const maxD = 11; // field-of-view dim radius
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const sx = ox + x * t + t / 2, sy = oy + y * t + t / 2;
        const dist = Math.hypot(x - this.player.x, y - this.player.y);
        const dim = Math.max(0.16, 1 - dist / maxD);
        if (this.isFloor(x, y)) {
          // wall = floor tile bordering void (drawn where neighbour is void)
          ctx.fillStyle = `rgba(70,90,80,${0.22 * dim})`;
          ctx.fillText('·', sx, sy);
        } else if (this._bordersFloor(x, y)) {
          ctx.fillStyle = `rgba(86,128,104,${0.85 * dim})`;
          ctx.fillText('#', sx, sy);
        }
      }
    }

    // places
    for (const p of this.places) {
      if (p.x < x0 || p.x >= x1 || p.y < y0 || p.y >= y1) continue;
      const sx = ox + p.x * t + t / 2, sy = oy + p.y * t + t / 2;
      const dist = Math.hypot(p.x - this.player.x, p.y - this.player.y);
      const dim = Math.max(0.3, 1 - dist / (maxD + 4));
      const sel = p.id === this.selectedId;
      if (sel) {
        ctx.strokeStyle = `rgba(244,191,98,${0.5 + 0.4 * pulse})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx - t / 2 + 2, sy - t / 2 + 2, t - 4, t - 4);
      }
      ctx.save();
      ctx.shadowColor = 'rgba(244,191,98,0.8)';
      ctx.shadowBlur = sel ? 18 : 10;
      ctx.fillStyle = `rgba(245,200,110,${dim})`;
      ctx.font = `${Math.floor(t * 0.82)}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.fillText(p.glyph || '◆', sx, sy);
      ctx.restore();
      // label near player / selected
      if (dist < 6 || sel) {
        ctx.font = `${Math.max(10, Math.floor(t * 0.42))}px ui-sans-serif, system-ui`;
        ctx.fillStyle = `rgba(224,232,228,${Math.min(1, dim + 0.2)})`;
        ctx.fillText(p.title, sx, sy - t * 0.72);
      }
    }

    // hover highlight
    if (this._hover && this.isFloor(this._hover.x, this._hover.y)) {
      const sx = ox + this._hover.x * t, sy = oy + this._hover.y * t;
      ctx.strokeStyle = 'rgba(120,200,160,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 1, sy + 1, t - 2, t - 2);
    }

    // player
    const px = ox + this.player.px * t + t / 2, py = oy + this.player.py * t + t / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(255,206,120,0.9)';
    ctx.shadowBlur = 12 + 8 * pulse;
    ctx.fillStyle = '#ffce78';
    ctx.font = `${Math.floor(t * 0.8)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.fillText('@', px, py);
    ctx.restore();

    // scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0; y < this._vh; y += 3) ctx.fillRect(0, y, this._vw, 1);
  }

  _bordersFloor(x, y) {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (this.isFloor(x + dx, y + dy)) return true;
    return false;
  }
}
