// the quarter — a walkable city-map of the Bluesky tools.
// v2 "the polis pass": daylight city rendering (2.5D facades, parks, a canal),
// and a passport — the map remembers which buildings you've found and which
// tools you've launched; windows light up as you use the city.
// Deterministic world: seeded rng only, no Date.now()/Math.random() in layout.
import { DISTRICTS, TOOLS, TIER_NAMES, CHECKED } from './tools.js';

// ── seeded rng (mulberry32 + fnv-ish hash, per hoop/js/ship.js) ────────────
function hashInts(...ns) {
  let h = 0x811c9dc5;
  for (const n of ns) { h ^= n + 0x9e3779b9; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 20260701;
const rngAt = (x, y, salt) => mulberry32(hashInts(SEED, salt, x, y))();

// ── world build (pure — node-testable) ─────────────────────────────────────
export const W = 78, H = 52;
const ROAD_Y = 28;      // the avenue: rows 28–29, west gate → east citadel
const CANAL_Y = 43;     // rows 43–44: the canal in front of the underworks

const SPURS = [
  [14, 14, 27],  // commons ↓ to the avenue
  [14, 30, 30],  // avenue ↓ graph
  [34, 11, 27],  // threads ↓ to the avenue (past the scriptorium)
  [34, 30, 30],  // avenue ↓ gallery
  [50, 30, 30],  // avenue ↓ watch
  [60, 19, 27],  // citadel ↓ to the avenue
  [66, 30, 30],  // avenue ↓ hamlet
  [14, 39, 44],  // graph ↓ over the canal (bridge) to the underworks
  [50, 37, 44],  // watch ↓ over the canal (bridge) to the underworks
];

export function buildWorld() {
  const floor = new Uint8Array(W * H);       // 0 park · 1 district · 2 road
  const distIdx = new Int8Array(W * H).fill(-1);
  const at = (x, y) => y * W + x;

  DISTRICTS.forEach((d, i) => {
    const [rx, ry, rw, rh] = d.rect;
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
      floor[at(x, y)] = 1; distIdx[at(x, y)] = i;
    }
  });
  for (let x = 2; x <= 73; x++) for (let y = ROAD_Y; y <= ROAD_Y + 1; y++) {
    if (!floor[at(x, y)]) floor[at(x, y)] = 2;
  }
  for (const [x, y0, y1] of SPURS) for (let y = y0; y <= y1; y++) {
    if (!floor[at(x, y)]) floor[at(x, y)] = 2;
  }

  // place tools inside their district, tier-ascending so the progression
  // also reads left→right within each block
  const pois = [];
  DISTRICTS.forEach((d) => {
    const [rx, ry, rw] = d.rect;
    const mine = TOOLS.filter((t) => t.district === d.id)
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
    const sx = d.id === 'undercroft' ? 7 : 3;
    const cols = Math.max(1, Math.floor((rw - 3) / sx) + 1);
    mine.forEach((tool, i) => {
      const x = rx + 2 + (i % cols) * sx;
      const y = ry + 3 + Math.floor(i / cols) * 3; // +3 leaves headroom for tall signs under the district name
      pois.push({ ...tool, x, y, districtDef: d });
    });
  });
  const poiAt = new Map(pois.map((p) => [`${p.x}-${p.y}`, p]));

  // tier milestones along the avenue
  const milestones = [
    { x: 8, tier: 1 }, { x: 27, tier: 2 }, { x: 46, tier: 3 }, { x: 64, tier: 4 },
  ];

  return {
    W, H, floor, distIdx, pois, poiAt, milestones,
    isFloor: (x, y) => x >= 0 && y >= 0 && x < W && y < H && floor[at(x, y)] > 0,
    kind: (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? floor[at(x, y)] : 0),
    district: (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? distIdx[at(x, y)] : -1),
  };
}

export function bfsPath(world, sx, sy, tx, ty) {
  if (!world.isFloor(tx, ty)) return null;
  const key = (x, y) => y * W + x;
  const prev = new Map([[key(sx, sy), null]]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === tx && y === ty) {
      const path = [];
      for (let k = key(tx, ty); k !== null; k = prev.get(k)) {
        path.push({ x: k % W, y: Math.floor(k / W) });
        if (prev.get(k) === null) break;
      }
      return path.reverse().slice(1);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (world.isFloor(nx, ny) && !prev.has(key(nx, ny))) {
        prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]);
      }
    }
  }
  return null;
}

// ── color helpers ───────────────────────────────────────────────────────────
function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function mix(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t));
}
const css = (rgb, j = 1) => `rgb(${(rgb[0] * j) | 0},${(rgb[1] * j) | 0},${(rgb[2] * j) | 0})`;

// daylight palette — warm paper-and-stone
const PAL = {
  park: '#ccd3b8', pave: '#e6dfcf', road: '#b6b0a2', dash: '#e3dccb',
  water: '#a9c4cc', wave: '#7fa3ad', tree: '#7a8f66', bloom: '#b98aa0',
  wall: '#f4eee0', roofBase: '#c9c2b0', door: '#4a4238',
  winDark: '#6b6354', winLit: '#e8b95c',
  ink: '#2a2620', label: '#5a5344', halo: 'rgba(250,246,236,0.75)',
  select: '#8b6d2f', warn: '#c08a2e',
};

// ── passport (localStorage) ─────────────────────────────────────────────────
const PASS_KEY = 'quarter.passport.v1';
const RANKS = [
  [0, 'stranger'], [1, 'tourist'], [8, 'wanderer'], [20, 'regular'],
  [40, 'citizen'], [70, 'alderman'], [110, 'keeper of the quarter'],
];
function loadPass() {
  try { const p = JSON.parse(localStorage.getItem(PASS_KEY)); if (p && p.seen && p.visited) return p; } catch (_) {}
  return { seen: {}, visited: {} };
}
function savePass(p) { try { localStorage.setItem(PASS_KEY, JSON.stringify(p)); } catch (_) {} }
export function passScore(pass) {
  let s = 0;
  for (const id in pass.visited) { const t = TOOLS.find((t) => t.id === id); if (t) s += t.tier; }
  return s;
}
export function passRank(score) {
  let r = RANKS[0][1];
  for (const [min, name] of RANKS) if (score >= min) r = name;
  return r;
}

// ── browser game ────────────────────────────────────────────────────────────
function initGame() {
  const world = buildWorld();
  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d');
  const card = document.getElementById('card');
  const hint = document.getElementById('hint');
  const passEl = document.getElementById('passport');
  const passChip = document.getElementById('passchip');

  const player = { x: 3, y: ROAD_Y, px: 3, py: ROAD_Y, vx: 0, vy: 0 };
  let tile = 22, dpr = 1, vw = 0, vh = 0;
  let path = [], keys = {}, selected = null, hovered = null, moved = false;
  let t0 = performance.now();
  const pass = loadPass();

  const distRgb = DISTRICTS.map((d) => hexRgb(d.accent));
  const roofRgb = DISTRICTS.map((d) => mix(PAL.roofBase, d.accent, 0.55));
  const paveRgb = DISTRICTS.map((d) => mix(PAL.pave, d.accent, 0.10));
  const wallRgb = DISTRICTS.map((d) => mix(PAL.wall, d.accent, 0.16));
  const inkAccent = DISTRICTS.map((d) => css(mix(d.accent, PAL.ink, 0.55)));
  const parkRgb = hexRgb(PAL.park), roadRgb = hexRgb(PAL.road), waterRgb = hexRgb(PAL.water);

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = window.innerWidth; vh = window.innerHeight;
    canvas.width = vw * dpr; canvas.height = vh * dpr;
    canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tile = Math.max(15, Math.min(28, Math.min(vw, vh) / 19));
  }
  window.addEventListener('resize', resize); resize();

  function camera() {
    let ox = vw / 2 - (player.px + 0.5) * tile;
    let oy = vh / 2 - (player.py + 0.5) * tile;
    const wpx = W * tile, wpy = H * tile;
    if (wpx > vw) ox = Math.min(tile, Math.max(vw - wpx - tile, ox)); else ox = (vw - wpx) / 2;
    if (wpy > vh) oy = Math.min(tile, Math.max(vh - wpy - tile, oy)); else oy = (vh - wpy) / 2;
    return { ox, oy };
  }

  // ── passport actions ─────────────────────────────────────────────────────
  function markSeen(id) {
    if (!pass.seen[id]) { pass.seen[id] = Date.now(); savePass(pass); updateChip(); }
  }
  function markVisited(id) {
    const v = pass.visited[id] || { n: 0 };
    v.n += 1; v.last = Date.now();
    pass.visited[id] = v; savePass(pass); updateChip();
    if (passEl.classList.contains('open')) renderPassport();
  }
  function updateChip() {
    if (!passChip) return;
    const found = Object.keys(pass.seen).length, used = Object.keys(pass.visited).length;
    passChip.textContent = `⌘ ${found}/${TOOLS.length} found · ${used} visited · ${passRank(passScore(pass))}`;
  }
  updateChip();

  function renderPassport() {
    const score = passScore(pass);
    const found = Object.keys(pass.seen).length, used = Object.keys(pass.visited).length;
    const rows = DISTRICTS.map((d, i) => {
      const mine = TOOLS.filter((t) => t.district === d.id);
      const f = mine.filter((t) => pass.seen[t.id]).length;
      const u = mine.filter((t) => pass.visited[t.id]).length;
      const stamps = mine.map((t) =>
        `<span class="stamp${pass.visited[t.id] ? ' used' : pass.seen[t.id] ? ' found' : ''}" title="${t.name}">${t.glyph}</span>`).join('');
      return `<div class="prow">
        <div class="phead"><span style="color:${inkAccent[i]}">${d.name}</span><span>${f}/${mine.length} found · ${u} visited</span></div>
        <div class="stamps">${stamps}</div></div>`;
    }).join('');
    passEl.innerHTML = `
      <div class="ptitle"><span>passport</span><button class="pclose" title="close (P)">×</button></div>
      <div class="prank">${passRank(score)}</div>
      <div class="pscore">${found}/${TOOLS.length} found · ${used} visited · civic score ${score}
        <span class="pnote">score = sum of tiers of tools you've launched. windows light up where you've been.</span></div>
      ${rows}`;
    passEl.querySelector('.pclose').addEventListener('click', () => togglePassport(false));
  }
  function togglePassport(force) {
    const open = force !== undefined ? force : !passEl.classList.contains('open');
    passEl.classList.toggle('open', open);
    if (open) renderPassport();
  }
  document.getElementById('passbtn')?.addEventListener('click', () => togglePassport());

  function openTool(p) {
    markVisited(p.id);
    window.open(p.url, '_blank', 'noopener');
  }

  // ── input ────────────────────────────────────────────────────────────────
  const KEYMAP = {
    arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
    arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
  };
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (KEYMAP[k]) { keys[k] = true; path = []; moved = true; e.preventDefault(); }
    if (k === 'enter' && selected && nearPoi(selected)) openTool(selected);
    if (k === 'p') togglePassport();
    if (k === 'escape') { selected = null; renderCard(); togglePassport(false); }
  });
  window.addEventListener('keyup', (e) => { delete keys[e.key.toLowerCase()]; });

  canvas.addEventListener('pointermove', (e) => {
    const { ox, oy } = camera();
    hovered = { x: Math.floor((e.clientX - ox) / tile), y: Math.floor((e.clientY - oy) / tile) };
  });
  canvas.addEventListener('pointerdown', (e) => {
    const { ox, oy } = camera();
    let tx = Math.floor((e.clientX - ox) / tile), ty = Math.floor((e.clientY - oy) / tile);
    const poi = world.poiAt.get(`${tx}-${ty}`);
    if (poi && selected === poi && nearPoi(poi)) { openTool(poi); return; }
    if (poi) { selected = poi; renderCard(); }
    if (!world.isFloor(tx, ty)) {
      let best = null, bd = 99;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.hypot(dx, dy);
        if (d < bd && world.isFloor(tx + dx, ty + dy)) { bd = d; best = [tx + dx, ty + dy]; }
      }
      if (!best) return; [tx, ty] = best;
    }
    const p = bfsPath(world, player.x, player.y, tx, ty);
    if (p) { path = p; moved = true; }
  });

  // record visits launched from the card's link too
  card.addEventListener('click', (e) => {
    const a = e.target.closest('a.visit');
    if (a && selected) markVisited(selected.id);
  });

  // ── motion (continuous, hoop stepMotion style) ───────────────────────────
  function inputVector() {
    let ax = 0, ay = 0;
    for (const k in keys) { const v = KEYMAP[k]; if (v) { ax += v[0]; ay += v[1]; } }
    if (!ax && !ay && path.length) {
      const wp = path[0];
      const dx = wp.x - player.px, dy = wp.y - player.py;
      const d = Math.hypot(dx, dy);
      if (d < 0.45) { path.shift(); return inputVector(); }
      ax = dx / d; ay = dy / d;
    }
    const m = Math.hypot(ax, ay);
    return m ? [ax / m, ay / m] : [0, 0];
  }

  function stepMotion(dt) {
    const [ax, ay] = inputVector();
    const ACC = 46, FRI = 10.5, MAX = 7.2;
    player.vx += ax * ACC * dt; player.vy += ay * ACC * dt;
    player.vx -= player.vx * FRI * dt; player.vy -= player.vy * FRI * dt;
    const sp = Math.hypot(player.vx, player.vy);
    if (sp > MAX) { player.vx *= MAX / sp; player.vy *= MAX / sp; }
    let nx = player.px + player.vx * dt;
    if (world.isFloor(Math.round(nx), Math.round(player.py))) player.px = nx; else player.vx = 0;
    let ny = player.py + player.vy * dt;
    if (world.isFloor(Math.round(player.px), Math.round(ny))) player.py = ny; else player.vy = 0;
    const txi = Math.round(player.px), tyi = Math.round(player.py);
    if (txi !== player.x || tyi !== player.y) { player.x = txi; player.y = tyi; onTile(); }
    if (moved && !hint.classList.contains('faded')) setTimeout(() => hint.classList.add('faded'), 4000);
  }

  const nearPoi = (p) => Math.hypot(p.x - player.px, p.y - player.py) < 1.6;

  function onTile() {
    let best = null, bd = 1.6;
    for (const p of world.pois) {
      const d = Math.hypot(p.x - player.x, p.y - player.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) { selected = best; markSeen(best.id); renderCard(); }
    else if (selected && !nearPoi(selected)) { selected = null; renderCard(); }
  }

  // ── the card ─────────────────────────────────────────────────────────────
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function renderCard() {
    if (!selected) { card.classList.remove('open'); return; }
    const p = selected;
    const pips = [1, 2, 3, 4].map((i) => `<span class="pip${i <= p.tier ? ' on' : ''}"></span>`).join('');
    const chips = p.chips.map((c) =>
      `<span class="chip${c === 'writes' ? ' write' : ''}">${esc(c)}</span>`).join('');
    const dot = p.status === 'up' ? '<span class="dot"></span> live' : '<span class="dot warn"></span> caution';
    const v = pass.visited[p.id];
    const stamp = v ? ` · <span class="stamped">stamped ×${v.n}</span>` : '';
    const near = nearPoi(p);
    card.innerHTML = `
      <div class="kicker"><span class="district">${esc(p.districtDef.name)}</span><span>${esc(p.data)}</span></div>
      <h2><span class="glyph">${p.glyph}</span>${esc(p.name)}</h2>
      <div class="desc">${esc(p.desc)}</div>
      <div class="chips">${chips}</div>
      <div class="tier-row"><span class="tier-label">tier ${p.tier} · ${TIER_NAMES[p.tier - 1]}</span><span class="pips">${pips}</span></div>
      <div class="status">${dot} · checked ${CHECKED}${stamp}${p.note ? ' — ' + esc(p.note) : ''}</div>
      <a class="visit" href="${p.url}" target="_blank" rel="noopener">visit ↗</a>
      ${near ? '<span class="visit-hint">or press Enter</span>' : '<span class="visit-hint">walk closer to enter</span>'}`;
    card.classList.add('open');
  }

  // ── drawing ──────────────────────────────────────────────────────────────
  function drawBuilding(p, SX, SY, now) {
    const bx = SX(p.x), by = SY(p.y);
    const isSel = selected === p;
    const visited = !!pass.visited[p.id];
    const di = DISTRICTS.indexOf(p.districtDef);
    const fw = tile * 0.84, fx = bx + tile * 0.08;
    const fh = tile * (0.62 + 0.3 * p.tier);          // facade height — tiers read as storeys
    const base = by + tile * 0.92;                     // ground line inside the tile
    const y0 = base - fh;

    // shadow to the south-east
    ctx.fillStyle = 'rgba(60,52,40,0.16)';
    ctx.fillRect(fx + tile * 0.10, base - tile * 0.05, fw, tile * 0.13);

    // facade
    ctx.fillStyle = css(wallRgb[di], 0.97 + 0.06 * rngAt(p.x, p.y, 21));
    ctx.fillRect(fx, y0, fw, fh);
    ctx.strokeStyle = 'rgba(74,66,56,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(fx + 0.5, y0 + 0.5, fw - 1, fh - 1);

    // roof (slight overhang), warn = amber pennant
    ctx.fillStyle = css(roofRgb[di]);
    ctx.fillRect(fx - tile * 0.05, y0 - tile * 0.13, fw + tile * 0.10, tile * 0.15);
    if (p.status === 'warn') {
      ctx.fillStyle = PAL.warn;
      ctx.beginPath();
      ctx.moveTo(fx + fw - tile * 0.06, y0 - tile * 0.13);
      ctx.lineTo(fx + fw - tile * 0.06, y0 - tile * 0.44);
      ctx.lineTo(fx + fw + tile * 0.16, y0 - tile * 0.34);
      ctx.closePath(); ctx.fill();
    }

    // windows — one row per tier; lit amber once you've launched the tool
    const rows = p.tier;
    for (let r = 0; r < rows; r++) {
      const wy = y0 + fh * (r + 0.42) / (rows + 0.75) - tile * 0.07;
      for (const wxo of [0.16, 0.56]) {
        ctx.fillStyle = visited ? PAL.winLit : PAL.winDark;
        if (visited) { ctx.save(); ctx.shadowColor = 'rgba(232,185,92,0.8)'; ctx.shadowBlur = 6; }
        ctx.fillRect(fx + fw * wxo, wy, fw * 0.20, tile * 0.13);
        if (visited) ctx.restore();
      }
    }

    // door
    ctx.fillStyle = PAL.door;
    ctx.fillRect(fx + fw * 0.40, base - tile * 0.26, fw * 0.20, tile * 0.26);

    // hanging sign: the tool's glyph above the roof
    const gx = bx + tile * 0.5, gy = y0 - tile * 0.34;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (isSel) { ctx.save(); ctx.shadowColor = 'rgba(139,109,47,0.7)'; ctx.shadowBlur = 10; }
    ctx.fillStyle = inkAccent[di];
    ctx.font = `600 ${tile * 0.44}px "JetBrains Mono", monospace`;
    ctx.fillText(p.glyph, gx, gy);
    if (isSel) ctx.restore();

    // label when near or selected
    const d = Math.hypot(p.x - player.px, p.y - player.py);
    if (d < 6.5 || isSel) {
      ctx.fillStyle = `rgba(42,38,32,${isSel ? 0.95 : Math.max(0.3, 1 - d / 7)})`;
      ctx.font = `${tile * 0.3}px "JetBrains Mono", monospace`;
      ctx.fillText(p.name, gx, base + tile * 0.22);
    }
    if (isSel) {
      const pu = 0.5 + 0.5 * Math.sin(now / 300);
      ctx.strokeStyle = `rgba(139,109,47,${0.45 + 0.4 * pu})`; ctx.lineWidth = 1.6;
      ctx.strokeRect(bx + 1.5, SY(p.y) + 1.5, tile - 3, tile - 3);
    }
  }

  function draw(now) {
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    stepMotion(dt);

    ctx.fillStyle = PAL.park; ctx.fillRect(0, 0, vw, vh);
    const { ox, oy } = camera();
    const x0 = Math.max(0, Math.floor(-ox / tile) - 1), x1 = Math.min(W, Math.ceil((vw - ox) / tile) + 1);
    const y0 = Math.max(0, Math.floor(-oy / tile) - 2), y1 = Math.min(H, Math.ceil((vh - oy) / tile) + 1);
    const SX = (x) => ox + x * tile, SY = (y) => oy + y * tile;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // ground: park / canal / pavement / road, with per-tile grain
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const k = world.kind(x, y);
      const j = 0.965 + 0.07 * rngAt(x, y, 3);
      if (k === 0) {
        if (y === CANAL_Y || y === CANAL_Y + 1) {         // the canal
          ctx.fillStyle = css(waterRgb, j);
          ctx.fillRect(SX(x), SY(y), tile + 0.5, tile + 0.5);
          if (rngAt(x, y, 11) < 0.3) {
            ctx.fillStyle = PAL.wave;
            ctx.font = `${tile * 0.3}px "JetBrains Mono", monospace`;
            ctx.fillText('≈', SX(x) + tile * (0.3 + 0.4 * rngAt(x, y, 12)), SY(y) + tile * 0.5);
          }
        } else {                                           // parkland
          ctx.fillStyle = css(parkRgb, j);
          ctx.fillRect(SX(x), SY(y), tile + 0.5, tile + 0.5);
          const r = rngAt(x, y, 7);
          if (r < 0.10) {                                  // trees, the odd bloom
            const bloom = rngAt(x, y, 8) < 0.12;
            ctx.fillStyle = bloom ? PAL.bloom : PAL.tree;
            ctx.font = `${tile * (0.42 + 0.3 * rngAt(x, y, 9))}px "JetBrains Mono", monospace`;
            ctx.fillText(bloom ? '❀' : '♣', SX(x) + tile * (0.25 + 0.5 * rngAt(x, y, 10)), SY(y) + tile * (0.3 + 0.4 * rngAt(x, y, 13)));
          }
        }
        continue;
      }
      if (k === 2) {
        ctx.fillStyle = css(roadRgb, j);
        ctx.fillRect(SX(x), SY(y), tile + 0.5, tile + 0.5);
        // bridge rails where the road crosses the canal
        if (y === CANAL_Y || y === CANAL_Y + 1) {
          ctx.fillStyle = 'rgba(74,66,56,0.55)';
          ctx.fillRect(SX(x), SY(y) + 1, 2, tile - 2);
          ctx.fillRect(SX(x) + tile - 2, SY(y) + 1, 2, tile - 2);
        }
        // dashed centreline on the avenue
        if (y === ROAD_Y && x % 2 === 0) {
          ctx.fillStyle = PAL.dash;
          ctx.fillRect(SX(x) + tile * 0.2, SY(y) + tile * 0.96, tile * 0.6, 2);
        }
        continue;
      }
      const di = world.district(x, y);
      ctx.fillStyle = css(paveRgb[di], j);
      ctx.fillRect(SX(x), SY(y), tile + 0.5, tile + 0.5);
      if (rngAt(x, y, 5) < 0.5) {                          // cobble seams
        ctx.strokeStyle = 'rgba(90,83,68,0.08)'; ctx.lineWidth = 1;
        ctx.strokeRect(SX(x) + 0.5, SY(y) + 0.5, tile, tile);
      }
    }

    // district curbs + names
    DISTRICTS.forEach((d, i) => {
      const [rx, ry, rw, rh] = d.rect;
      if (SX(rx + rw) < 0 || SX(rx) > vw || SY(ry + rh) < 0 || SY(ry) > vh) return;
      ctx.strokeStyle = d.accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
      ctx.strokeRect(SX(rx) + 1, SY(ry) + 1, rw * tile - 2, rh * tile - 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = inkAccent[i];
      ctx.font = `600 ${tile * 0.42}px "JetBrains Mono", monospace`;
      ctx.fillText(d.name.toUpperCase(), SX(rx + rw / 2), SY(ry) + tile * 0.72);
      ctx.fillStyle = PAL.label;
      ctx.font = `${tile * 0.27}px "JetBrains Mono", monospace`;
      // blurb sits at the block's foot, except in shallow strips where the foot is occupied
      const by = rh <= 5 ? SY(ry) + tile * 1.35 : SY(ry + rh) - tile * 0.42;
      ctx.fillText(d.blurb, SX(rx + rw / 2), by);
    });

    // tier milestones — little roadside obelisks
    for (const m of world.milestones) {
      const mx = SX(m.x + 0.5), my = SY(ROAD_Y - 0.5);
      ctx.fillStyle = '#8f8878';
      ctx.fillRect(mx - 2, my - tile * 0.55, 4, tile * 0.55);
      ctx.fillStyle = '#f0e9d8';
      ctx.fillRect(mx - tile * 0.32, my - tile * 1.0, tile * 0.64, tile * 0.48);
      ctx.strokeStyle = 'rgba(74,66,56,0.45)'; ctx.lineWidth = 1;
      ctx.strokeRect(mx - tile * 0.32 + 0.5, my - tile * 1.0 + 0.5, tile * 0.64 - 1, tile * 0.48 - 1);
      ctx.fillStyle = PAL.ink;
      ctx.font = `700 ${tile * 0.34}px "JetBrains Mono", monospace`;
      ctx.fillText(['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'][m.tier - 1], mx, my - tile * 0.76);
      ctx.fillStyle = PAL.label;
      ctx.font = `${tile * 0.22}px "JetBrains Mono", monospace`;
      ctx.fillText(TIER_NAMES[m.tier - 1], mx, my + tile * 0.22);
    }

    // travel path
    if (path.length) {
      ctx.strokeStyle = 'rgba(139,109,47,0.35)'; ctx.lineWidth = tile * 0.2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(SX(player.px + 0.5), SY(player.py + 0.5));
      for (const p of path) ctx.lineTo(SX(p.x + 0.5), SY(p.y + 0.5));
      ctx.stroke();
    }

    // hovered tile
    if (hovered && world.isFloor(hovered.x, hovered.y)) {
      ctx.strokeStyle = 'rgba(139,109,47,0.4)'; ctx.lineWidth = 1;
      ctx.strokeRect(SX(hovered.x) + 1, SY(hovered.y) + 1, tile - 2, tile - 2);
    }

    // buildings + player, painter's order so facades occlude correctly
    const sorted = [...world.pois].sort((a, b) => a.y - b.y || a.x - b.x);
    const prow = player.py;
    for (const p of sorted) if (p.y <= prow) drawBuilding(p, SX, SY, now);
    // player @ — ink with a paper halo
    const px = SX(player.px + 0.5), py = SY(player.py + 0.52);
    ctx.fillStyle = PAL.halo;
    ctx.beginPath(); ctx.arc(px, py, tile * 0.42, 0, 7); ctx.fill();
    ctx.fillStyle = PAL.ink;
    ctx.font = `700 ${tile * 0.72}px "JetBrains Mono", monospace`;
    ctx.fillText('@', px, py);
    for (const p of sorted) if (p.y > prow) drawBuilding(p, SX, SY, now);

    drawMinimap();
    requestAnimationFrame(draw);
  }

  function drawMinimap() {
    const s = 2, mw = W * s, mh = H * s, mx = vw - mw - 12, my = 52;
    if (vw < 560) return;
    ctx.fillStyle = 'rgba(246,240,225,0.9)';
    ctx.fillRect(mx - 6, my - 6, mw + 12, mh + 12);
    ctx.strokeStyle = 'rgba(139,109,47,0.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(mx - 6.5, my - 6.5, mw + 13, mh + 13);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = world.kind(x, y);
      if (!k) {
        if (y === CANAL_Y || y === CANAL_Y + 1) { ctx.fillStyle = PAL.water; ctx.fillRect(mx + x * s, my + y * s, s, s); }
        continue;
      }
      const di = world.district(x, y);
      ctx.fillStyle = di >= 0 ? DISTRICTS[di].accent + '88' : 'rgba(120,112,98,0.5)';
      ctx.fillRect(mx + x * s, my + y * s, s, s);
    }
    for (const p of world.pois) {
      ctx.fillStyle = pass.visited[p.id] ? '#c08a2e' : PAL.ink;
      ctx.fillRect(mx + p.x * s - 0.5, my + p.y * s - 0.5, s + 1, s + 1);
    }
    ctx.fillStyle = '#8b2f2f';
    ctx.beginPath(); ctx.arc(mx + player.px * s + 1, my + player.py * s + 1, 2.6, 0, 7); ctx.fill();
    const { ox, oy } = camera();
    ctx.strokeStyle = 'rgba(42,38,32,0.35)';
    ctx.strokeRect(mx + (-ox / tile) * s, my + (-oy / tile) * s, (vw / tile) * s, (vh / tile) * s);
  }

  requestAnimationFrame(draw);

  // debug/test handle — lets a headless test read state and jump the player
  window.__QUARTER = {
    world, player, pass,
    goto(x, y) { player.px = player.x = x; player.py = player.y = y; onTile(); },
  };
}

if (typeof document !== 'undefined' && document.getElementById('world')) initGame();
