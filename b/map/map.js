// the quarter — a walkable glyph-map of the Bluesky tools.
// Rendering in the hoop house style: canvas 2D, JetBrains Mono glyphs with
// shadowBlur glow, CRT scanlines, phosphor-on-ink palette. Deterministic:
// seeded rng only, no Date.now()/Math.random() in world generation.
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
const ROAD_Y = 28; // main road rows 28–29, west gate → east citadel

const SPURS = [
  [14, 14, 27],  // commons ↓ to road
  [14, 30, 30],  // road ↓ graph
  [34, 11, 27],  // threads ↓ to road (through scriptorium's west flank)
  [34, 30, 30],  // road ↓ gallery
  [50, 30, 30],  // road ↓ watch
  [60, 19, 27],  // citadel ↓ to road
  [66, 30, 30],  // road ↓ hamlet
  [14, 39, 44],  // graph ↓ undercroft
  [50, 37, 44],  // watch ↓ undercroft
];

export function buildWorld() {
  const floor = new Uint8Array(W * H);       // 0 void · 1 district · 2 road
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
      const y = ry + 2 + Math.floor(i / cols) * 3;
      pois.push({ ...tool, x, y, districtDef: d });
    });
  });
  const poiAt = new Map(pois.map((p) => [`${p.x}-${p.y}`, p]));

  // tier milestones along the main road
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

// ── browser game ────────────────────────────────────────────────────────────
function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function initGame() {
  const world = buildWorld();
  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d');
  const card = document.getElementById('card');
  const hint = document.getElementById('hint');

  const player = { x: 3, y: ROAD_Y, px: 3, py: ROAD_Y, vx: 0, vy: 0 };
  let tile = 22, dpr = 1, vw = 0, vh = 0;
  let path = [], keys = {}, selected = null, hovered = null, moved = false;
  let t0 = performance.now();

  const distRgb = DISTRICTS.map((d) => hexRgb(d.accent));

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

  // ── input ────────────────────────────────────────────────────────────────
  const KEYMAP = {
    arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
    arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
  };
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (KEYMAP[k]) { keys[k] = true; path = []; moved = true; e.preventDefault(); }
    if (k === 'enter' && selected && nearPoi(selected)) window.open(selected.url, '_blank', 'noopener');
    if (k === 'escape') { selected = null; renderCard(); }
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
    if (poi && selected === poi && nearPoi(poi)) { window.open(poi.url, '_blank', 'noopener'); return; }
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
    if (best) { selected = best; renderCard(); }
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
    const near = nearPoi(p);
    card.innerHTML = `
      <div class="kicker"><span class="district">${esc(p.districtDef.name)}</span><span>${esc(p.data)}</span></div>
      <h2><span class="glyph">${p.glyph}</span>${esc(p.name)}</h2>
      <div class="desc">${esc(p.desc)}</div>
      <div class="chips">${chips}</div>
      <div class="tier-row"><span class="tier-label">tier ${p.tier} · ${TIER_NAMES[p.tier - 1]}</span><span class="pips">${pips}</span></div>
      <div class="status">${dot} · checked ${CHECKED}${p.note ? ' — ' + esc(p.note) : ''}</div>
      <a class="visit" href="${p.url}" target="_blank" rel="noopener">visit ↗</a>
      ${near ? '<span class="visit-hint">or press Enter</span>' : '<span class="visit-hint">walk closer to enter</span>'}`;
    card.classList.add('open');
  }

  // ── draw ─────────────────────────────────────────────────────────────────
  function draw(now) {
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    stepMotion(dt);

    ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, vw, vh);
    const { ox, oy } = camera();
    const x0 = Math.max(0, Math.floor(-ox / tile) - 1), x1 = Math.min(W, Math.ceil((vw - ox) / tile) + 1);
    const y0 = Math.max(0, Math.floor(-oy / tile) - 1), y1 = Math.min(H, Math.ceil((vh - oy) / tile) + 1);
    const SX = (x) => ox + x * tile, SY = (y) => oy + y * tile;

    // void stars + floor tiles
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const k = world.kind(x, y);
      if (k === 0) {
        if (rngAt(x, y, 7) < 0.02) {
          ctx.fillStyle = `rgba(180,200,220,${0.10 + 0.14 * rngAt(x, y, 8)})`;
          ctx.fillRect(SX(x) + tile * rngAt(x, y, 9), SY(y) + tile * rngAt(x, y, 10), 1.4, 1.4);
        }
        continue;
      }
      const j = 0.9 + 0.2 * rngAt(x, y, 3); // per-tile brightness jitter → texture
      let r = 13, g = 19, b = 26;
      if (k === 2) { r = 21; g = 28; b = 38; }
      const di = world.district(x, y);
      if (di >= 0) {
        const [ar, ag, ab] = distRgb[di];
        r += ar * 0.075; g += ag * 0.075; b += ab * 0.075;
      }
      ctx.fillStyle = `rgb(${(r * j) | 0},${(g * j) | 0},${(b * j) | 0})`;
      ctx.fillRect(SX(x), SY(y), tile + 0.5, tile + 0.5);
    }

    // district borders + labels
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    DISTRICTS.forEach((d, i) => {
      const [rx, ry, rw, rh] = d.rect;
      if (SX(rx + rw) < 0 || SX(rx) > vw || SY(ry + rh) < 0 || SY(ry) > vh) return;
      ctx.strokeStyle = d.accent + '33'; ctx.lineWidth = 1;
      ctx.strokeRect(SX(rx) + 0.5, SY(ry) + 0.5, rw * tile - 1, rh * tile - 1);
      ctx.fillStyle = d.accent + '99';
      ctx.font = `600 ${tile * 0.42}px "JetBrains Mono", monospace`;
      ctx.fillText(d.name.toUpperCase(), SX(rx + rw / 2), SY(ry) + tile * 0.72);
      ctx.fillStyle = '#8a978f66';
      ctx.font = `${tile * 0.27}px "JetBrains Mono", monospace`;
      ctx.fillText(d.blurb, SX(rx + rw / 2), SY(ry) + tile * 1.35);
    });

    // tier milestones on the road
    for (const m of world.milestones) {
      const mx = SX(m.x + 0.5), my = SY(ROAD_Y - 0.55);
      ctx.fillStyle = 'rgba(110,193,228,0.55)';
      ctx.font = `700 ${tile * 0.62}px "JetBrains Mono", monospace`;
      ctx.fillText(['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'][m.tier - 1], mx, my);
      ctx.fillStyle = 'rgba(110,193,228,0.34)';
      ctx.font = `${tile * 0.24}px "JetBrains Mono", monospace`;
      ctx.fillText(TIER_NAMES[m.tier - 1], mx, my + tile * 0.5);
    }

    // path
    if (path.length) {
      ctx.strokeStyle = 'rgba(244,191,98,0.25)'; ctx.lineWidth = tile * 0.22; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(SX(player.px + 0.5), SY(player.py + 0.5));
      for (const p of path) ctx.lineTo(SX(p.x + 0.5), SY(p.y + 0.5));
      ctx.stroke();
    }

    // hovered tile
    if (hovered && world.isFloor(hovered.x, hovered.y)) {
      ctx.strokeStyle = 'rgba(111,208,160,0.28)'; ctx.lineWidth = 1;
      ctx.strokeRect(SX(hovered.x) + 1, SY(hovered.y) + 1, tile - 2, tile - 2);
    }

    // POIs — gold glyphs, glow scaled by tier
    for (const p of world.pois) {
      const px = SX(p.x + 0.5), py = SY(p.y + 0.5);
      if (px < -tile || px > vw + tile || py < -tile || py > vh + tile) continue;
      const isSel = selected === p;
      ctx.save();
      ctx.shadowColor = p.status === 'warn' ? 'rgba(224,168,74,0.85)' : 'rgba(244,191,98,0.8)';
      ctx.shadowBlur = 8 + 3.5 * p.tier + (isSel ? 8 : 0);
      ctx.fillStyle = p.status === 'warn' ? 'rgba(224,168,74,0.95)' : 'rgba(245,200,110,0.95)';
      ctx.font = `${tile * (0.5 + 0.12 * p.tier)}px "JetBrains Mono", monospace`;
      ctx.fillText(p.glyph, px, py);
      ctx.restore();
      const d = Math.hypot(p.x - player.px, p.y - player.py);
      if (d < 6.5 || isSel) {
        ctx.fillStyle = `rgba(207,232,242,${isSel ? 0.95 : Math.max(0.25, 1 - d / 7)})`;
        ctx.font = `${tile * 0.31}px "JetBrains Mono", monospace`;
        ctx.fillText(p.name, px, py + tile * 0.72);
      }
      if (isSel) {
        const pu = 0.5 + 0.5 * Math.sin(now / 300);
        ctx.strokeStyle = `rgba(244,191,98,${0.35 + 0.4 * pu})`; ctx.lineWidth = 1.5;
        ctx.strokeRect(SX(p.x) + 1.5, SY(p.y) + 1.5, tile - 3, tile - 3);
      }
    }

    // player @
    const pu = 0.5 + 0.5 * Math.sin(now / 600 * Math.PI * 2);
    ctx.save();
    ctx.shadowColor = 'rgba(255,206,120,0.9)'; ctx.shadowBlur = 12 + 8 * pu;
    ctx.fillStyle = '#ffce78';
    ctx.font = `700 ${tile * 0.78}px "JetBrains Mono", monospace`;
    ctx.fillText('@', SX(player.px + 0.5), SY(player.py + 0.52));
    ctx.restore();

    // CRT scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let sy = 0; sy < vh; sy += 3) ctx.fillRect(0, sy, vw, 1);

    drawMinimap();
    requestAnimationFrame(draw);
  }

  function drawMinimap() {
    const s = 2, mw = W * s, mh = H * s, mx = vw - mw - 12, my = 52;
    if (vw < 560) return; // skip on small screens
    ctx.fillStyle = 'rgba(7,9,12,0.72)';
    ctx.fillRect(mx - 6, my - 6, mw + 12, mh + 12);
    ctx.strokeStyle = 'rgba(127,216,208,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(mx - 6.5, my - 6.5, mw + 13, mh + 13);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = world.kind(x, y);
      if (!k) continue;
      const di = world.district(x, y);
      ctx.fillStyle = di >= 0 ? DISTRICTS[di].accent + '55' : 'rgba(120,140,160,0.45)';
      ctx.fillRect(mx + x * s, my + y * s, s, s);
    }
    for (const p of world.pois) {
      ctx.fillStyle = p.status === 'warn' ? '#e0a84a' : '#f4bf62';
      ctx.fillRect(mx + p.x * s - 0.5, my + p.y * s - 0.5, s + 1, s + 1);
    }
    ctx.fillStyle = '#ffce78';
    ctx.beginPath(); ctx.arc(mx + player.px * s + 1, my + player.py * s + 1, 2.6, 0, 7); ctx.fill();
    const { ox, oy } = camera();
    ctx.strokeStyle = 'rgba(226,232,228,0.3)';
    ctx.strokeRect(mx + (-ox / tile) * s, my + (-oy / tile) * s, (vw / tile) * s, (vh / tile) * s);
  }

  requestAnimationFrame(draw);

  // debug/test handle — lets a headless test read state and jump the player
  window.__QUARTER = {
    world, player,
    goto(x, y) { player.px = player.x = x; player.py = player.y = y; onTile(); },
  };
}

if (typeof document !== 'undefined' && document.getElementById('world')) initGame();
