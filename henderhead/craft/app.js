// app.js — the grid, the histogram, the recipe book and the controls.
//
// The engine owns the rule; this file owns pixels. The one thing to know while
// reading it: every typed array the engine hands back points straight into
// WebAssembly memory and is only valid until the next call into the engine, so
// nothing here holds one across a frame.

import { loadEngine } from './engine.js';
import { ART, label, tile, drawItem } from './items.js';

const $ = (id) => document.getElementById(id);

/**
 * Recipes you can watch fire, or see the product of, in his 40 seconds. The
 * rest of the table is reconstruction, and the book marks the difference
 * rather than presenting all of it with equal confidence.
 */
const SEEN_IN_VIDEO = new Set([
  'oak_planks', 'stick', 'oak_slab', 'cobblestone_slab', 'crafting_table', 'bowl',
  'oak_boat', 'oak_door', 'oak_trapdoor', 'lever', 'oak_button',
  'wooden_sword', 'wooden_axe', 'wooden_shovel', 'stone_sword', 'stone_axe', 'stone_shovel',
]);

const S = {
  cols: 32, rows: 0,
  seed: (Math.random() * 1e9) | 0,
  playing: true,
  /// ticks per second, not ticks per frame — a tick is a unit of the
  /// automaton's time and the video runs at a few of them a second, so tying
  /// it to the frame rate would make every other setting meaningless
  speed: 8,
  motion: 0.2,
  rate: 1.2,
  restock: 0.45,
  prio: 0,
  cell: 0,
  flashes: [],      // recent crafts, drawn fading
  idleTicks: 0,     // consecutive ticks with nothing crafted
  owed: 0,          // fractional ticks carried between frames
};

let eng = null;
let desc = null;
let pendingBans = [];
let banned = null;  // by item id
let gctx = null;
let hctx = null;

(async function start() {
  try {
    eng = await loadEngine(new URL('./craftca.wasm', import.meta.url));
  } catch (err) {
    $('status').textContent = 'the engine did not load: ' + err;
    return;
  }
  gctx = $('grid').getContext('2d');
  hctx = $('hist').getContext('2d');
  readHash();
  build();
  wire();
  requestAnimationFrame(loop);
})();

// ---------------------------------------------------------------- the world --

function build() {
  const aspect = 2 / 3;
  S.rows = Math.max(8, Math.round(S.cols * aspect));
  desc = eng.init(S.cols, S.rows, S.seed, 0.12);
  banned = new Array(desc.items.length + 1).fill(false);
  for (const name of desc.bannedByDefault) banned[desc.items.indexOf(name) + 1] = true;
  // bans carried in the permalink, applied on top of the default one
  for (const name of pendingBans) {
    const i = desc.items.indexOf(name) + 1;
    if (i > 0) banned[i] = true;
  }
  push();
  S.flashes.length = 0;
  S.idleTicks = 0;
  sizeCanvas();
  renderBook();
  syncOutputs();
}

/** Send every control's current value to the engine. */
function push() {
  eng.setMotion(S.motion);
  eng.setCraftRate(S.rate);
  eng.setRestock(S.restock);
  eng.setPriority(S.prio);
  for (let i = 1; i < banned.length; i++) eng.setBanned(i, banned[i]);
}

function sizeCanvas() {
  const cv = $('grid');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const wCss = cv.clientWidth || 900;
  S.cell = Math.max(6, Math.floor((wCss * dpr) / S.cols));
  cv.width = S.cell * S.cols;
  cv.height = S.cell * S.rows;
  cv.style.height = (cv.height / dpr) + 'px';
}

// ---------------------------------------------------------------- the loop --

let last = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.25, (t - last) / 1000 || 0);
  last = t;
  if (S.playing) {
    S.owed += dt * S.speed;
    let ticks = Math.floor(S.owed);
    S.owed -= ticks;
    // one wasm call per frame however many ticks are owed, but the flashes
    // only come from the last one — at 200 ticks a second nobody is reading
    // individual outlines anyway
    if (ticks > 0) {
      const n = eng.step(Math.min(ticks, 400));
      if (n > 0) {
        const now = performance.now();
        for (const c of eng.crafts(n)) S.flashes.push({ ...c, born: now });
        S.idleTicks = 0;
      } else {
        S.idleTicks += ticks;
      }
    }
  }
  const fade = Math.max(220, Math.min(900, 2200 / S.speed));
  const cutoff = performance.now() - fade;
  if (S.flashes.length > 400) S.flashes.splice(0, S.flashes.length - 400);
  while (S.flashes.length && S.flashes[0].born < cutoff) S.flashes.shift();
  drawGrid(fade);
  drawHist();
  drawStatus();
}

// ---------------------------------------------------------------- the grid --

function drawGrid(fade = 900) {
  const cv = $('grid');
  const c = S.cell;
  gctx.fillStyle = '#071624';
  gctx.fillRect(0, 0, cv.width, cv.height);

  // slots. Our own, not the game's: a slightly lifted square per cell on the
  // site's own navy, which is enough to read as an inventory without pretending
  // to be one.
  gctx.fillStyle = '#112a41';
  const pad = Math.max(1, Math.round(c * 0.06));
  for (let y = 0; y < S.rows; y++) {
    for (let x = 0; x < S.cols; x++) {
      gctx.fillRect(x * c + pad, y * c + pad, c - pad * 2, c - pad * 2);
    }
  }

  const cells = eng.cells();
  const size = Math.max(8, c - pad * 2);
  for (let y = 0; y < S.rows; y++) {
    for (let x = 0; x < S.cols; x++) {
      const v = cells[y * S.cols + x];
      if (v === 0) continue;
      const id = desc.items[v - 1];
      if (!id || !ART[id]) continue;
      gctx.drawImage(tile(id, size), x * c + pad, y * c + pad);
    }
  }

  // the green outline round a match, fading. His is a hard green rectangle held
  // for about a second; at speed there are too many to hold, so they decay.
  const now = performance.now();
  gctx.lineWidth = Math.max(1.5, c * 0.09);
  gctx.lineJoin = 'miter';
  for (const f of S.flashes) {
    const age = (now - f.born) / fade;
    if (age > 1) continue;
    gctx.strokeStyle = `rgba(78, 226, 106, ${(1 - age) * 0.95})`;
    // a shape that straddles the torus seam is drawn in up to four pieces
    for (const [ox, oy] of [[0, 0], [-S.cols, 0], [0, -S.rows], [-S.cols, -S.rows]]) {
      const x = (f.x + ox) * c, y = (f.y + oy) * c;
      if (x + f.w * c < 0 || y + f.h * c < 0) continue;
      gctx.strokeRect(x + 1, y + 1, f.w * c - 2, f.h * c - 2);
    }
  }
}

// ----------------------------------------------------------- the histogram --

let histHit = [];

function drawHist() {
  const cv = $('hist');
  const counts = eng.counts();
  const rows = [];
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] > 0 || banned[i]) rows.push([counts[i], i]);
  }
  rows.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const shown = rows.slice(0, 22);

  const dpr = Math.min(devicePixelRatio || 1, 2);
  const wantW = Math.round((cv.clientWidth || 320) * dpr);
  if (cv.width !== wantW) { cv.width = wantW; cv.height = Math.round(150 * dpr); }
  hctx.clearRect(0, 0, cv.width, cv.height);
  if (!shown.length) return;

  const iconH = Math.round(20 * dpr);
  const padX = Math.round(4 * dpr);
  const bw = (cv.width - padX * 2) / shown.length;
  const top = Math.round(6 * dpr);
  const barH = cv.height - iconH - top - Math.round(4 * dpr);
  const max = Math.max(1, shown[0][0]);
  histHit = [];

  for (let k = 0; k < shown.length; k++) {
    const [n, id] = shown[k];
    const x = padX + k * bw;
    const h = Math.max(1, (n / max) * barH);
    hctx.fillStyle = banned[id] ? '#4a3a2a' : '#9fc9ee';
    hctx.fillRect(x + bw * 0.12, top + barH - h, bw * 0.76, h);
    const icon = Math.min(iconH, bw * 0.95);
    drawItem(hctx, desc.items[id - 1], x + (bw - icon) / 2, cv.height - iconH, icon);
    if (banned[id]) {
      hctx.strokeStyle = '#ffd79a';
      hctx.lineWidth = Math.max(1, dpr);
      hctx.beginPath();
      hctx.moveTo(x + bw * 0.2, cv.height - iconH * 0.8);
      hctx.lineTo(x + bw * 0.8, cv.height - iconH * 0.2);
      hctx.stroke();
    }
    histHit.push({ x0: x / dpr, x1: (x + bw) / dpr, id });
  }
}

// ------------------------------------------------------------ recipe book --

function renderBook() {
  const book = $('book');
  book.innerHTML = '';
  const seen = new Set();
  for (const r of desc.recipes) {
    if (r.mirrored || seen.has(r.source)) continue;
    seen.add(r.source);
    const out = desc.items[r.out - 1];
    const el = document.createElement('button');
    el.className = 'rec' + (SEEN_IN_VIDEO.has(out) ? ' seen' : '') + (banned[r.out] ? ' off' : '');
    el.dataset.item = String(r.out);
    el.title = (SEEN_IN_VIDEO.has(out) ? 'seen in the video. ' : 'reconstructed. ') + 'click to ban';
    const top = document.createElement('div');
    top.className = 'top';
    top.appendChild(shapeCanvas(r));
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '→';
    top.appendChild(arrow);
    const o = document.createElement('canvas');
    const px = 26 * Math.min(devicePixelRatio || 1, 2);
    o.width = o.height = px;
    o.style.width = o.style.height = '26px';
    drawItem(o.getContext('2d'), out, 0, 0, px);
    top.appendChild(o);
    const y = document.createElement('span');
    y.className = 'yield';
    y.textContent = '×' + r.yield;
    top.appendChild(y);
    el.appendChild(top);
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = label(out);
    el.appendChild(nm);
    el.addEventListener('click', () => toggleBan(r.out));
    book.appendChild(el);
  }
}

/** A recipe's shape, drawn as a little crafting grid. */
function shapeCanvas(r) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const cell = 15 * dpr;
  const c = document.createElement('canvas');
  c.width = r.w * cell;
  c.height = r.h * cell;
  c.style.width = (r.w * 15) + 'px';
  c.style.height = (r.h * 15) + 'px';
  const x = c.getContext('2d');
  for (let j = 0; j < r.h; j++) {
    for (let i = 0; i < r.w; i++) {
      x.fillStyle = '#16304a';
      x.fillRect(i * cell + 1, j * cell + 1, cell - 2, cell - 2);
      const v = r.cells[j * r.w + i];
      if (v) drawItem(x, desc.items[v - 1], i * cell + 1, j * cell + 1, cell - 2);
    }
  }
  return c;
}

function toggleBan(item) {
  banned[item] = !banned[item];
  eng.setBanned(item, banned[item]);
  for (const el of document.querySelectorAll('.rec')) {
    el.classList.toggle('off', banned[Number(el.dataset.item)]);
  }
  writeHash();
}

// ---------------------------------------------------------------- readout --

function drawStatus() {
  const counts = eng.counts();
  let kinds = 0;
  for (let i = 1; i < counts.length; i++) if (counts[i] > 0) kinds++;
  const occ = eng.occupied();
  const cells = S.cols * S.rows;
  const spent = S.idleTicks > 120 && S.playing;
  $('status').innerHTML =
    `tick <b>${fmt(eng.tick())}</b>` +
    `<span>grid <b>${S.cols}×${S.rows}</b></span>` +
    `<span>full <b>${Math.round((occ / cells) * 100)}%</b></span>` +
    `<span>kinds <b>${kinds}</b>/${desc.items.length}</span>` +
    `<span>crafted <b>${fmt(eng.totalCrafts())}</b></span>` +
    `<span>lost to a full grid <b>${fmt(eng.totalSpilled())}</b></span>` +
    (spent ? `<span class="spent">spent — nothing left to craft. Turn up restock, or stir harder.</span>` : '');
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');

// ----------------------------------------------------------------- wiring --

function wire() {
  $('play').addEventListener('click', () => {
    S.playing = !S.playing;
    $('play').textContent = S.playing ? '❚❚ pause' : '▶ play';
    $('play').setAttribute('aria-pressed', String(S.playing));
  });
  $('once').addEventListener('click', () => {
    const n = eng.step(1);
    const now = performance.now();
    for (const c of eng.crafts(n)) S.flashes.push({ ...c, born: now });
  });
  $('reset').addEventListener('click', () => {
    S.seed = (Math.random() * 1e9) | 0;
    eng.reseed(S.seed, 0.12);
    S.flashes.length = 0;
    S.idleTicks = 0;
    writeHash();
  });

  slider('speed', (v) => { S.speed = v; });
  slider('motion', (v) => { S.motion = v; eng.setMotion(v); });
  slider('rate', (v) => { S.rate = v; eng.setCraftRate(v); });
  slider('restock', (v) => { S.restock = v; eng.setRestock(v); });
  slider('size', (v) => { S.cols = v; build(); });

  $('prio').addEventListener('change', (e) => {
    S.prio = parseInt(e.target.value, 10);
    eng.setPriority(S.prio);
    writeHash();
  });

  $('hist').addEventListener('click', (ev) => {
    const r = $('hist').getBoundingClientRect();
    const x = ev.clientX - r.left;
    const hit = histHit.find((h) => x >= h.x0 && x < h.x1);
    if (hit) toggleBan(hit.id);
  });

  addEventListener('resize', () => { sizeCanvas(); });
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === ' ') { e.preventDefault(); $('play').click(); }
    if (e.key === '.') $('once').click();
    if (e.key === 'r') $('reset').click();
  });
}

function slider(id, set) {
  const el = $(id);
  el.addEventListener('input', () => {
    set(parseFloat(el.value));
    syncOutputs();
    writeHash();
  });
}

function syncOutputs() {
  $('speed').value = String(S.speed);
  $('motion').value = String(S.motion);
  $('rate').value = String(S.rate);
  $('restock').value = String(S.restock);
  $('size').value = String(S.cols);
  $('prio').value = String(S.prio);
  $('speed-o').textContent = S.speed + '/s';
  $('motion-o').textContent = S.motion.toFixed(2);
  $('rate-o').textContent = S.rate.toFixed(1);
  $('restock-o').textContent = S.restock === 0 ? 'none' : Math.round(S.restock * 100) + '%';
  $('size-o').textContent = `${S.cols}×${S.rows}`;
}

// -------------------------------------------------------------------- hash --

function writeHash() {
  const p = new URLSearchParams();
  p.set('n', String(S.cols));
  p.set('m', String(S.motion));
  p.set('r', String(S.rate));
  p.set('k', String(S.restock));
  p.set('p', String(S.prio));
  p.set('v', String(S.speed));
  p.set('s', String(S.seed));
  const off = [];
  for (let i = 1; i < (banned || []).length; i++) if (banned[i]) off.push(desc.items[i - 1]);
  if (off.length) p.set('ban', off.join(','));
  const h = '#' + p.toString();
  if (location.hash !== h) history.replaceState(null, '', h);
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const num = (k, lo, hi, cur) => {
    const v = parseFloat(p.get(k));
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : cur;
  };
  S.cols = Math.round(num('n', 16, 80, S.cols));
  S.motion = num('m', 0, 0.6, S.motion);
  S.rate = num('r', 0.1, 40, S.rate);
  S.restock = num('k', 0, 0.9, S.restock);
  S.speed = Math.round(num('v', 1, 240, S.speed));
  S.prio = num('p', 0, 1, S.prio) === 0 ? 0 : 1;
  S.seed = num('s', 0, 2 ** 31, S.seed);
  pendingBans = (p.get('ban') || '').split(',').filter(Boolean);
}
