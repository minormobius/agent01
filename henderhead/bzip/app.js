// app.js — the dex, the matrix, the scoreboard and the drawing pad.
//
// Distances come from two places: bzncd.wasm for the compressor, and
// critters.js for the baselines that are not compression at all. Both feed
// the same `score`, so the numbers on the board are comparable.

import { loadEngine } from './engine.js';
import {
  W, H, SIZE, makeDex, REPRESENTATIONS, BASELINES, score, ink, inkAgreement, inkPercentile,
} from './critters.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

// four shades, Game Boy-ish but ours: paper, light, mid, ink
const SHADES = [[232, 240, 222], [160, 196, 140], [74, 120, 92], [16, 32, 30]];
const LINE_HUES = (k) => `hsl(${(k * 137.508) % 360} 55% 58%)`;

const state = {
  seed: 151,
  growth: 1,
  rep: 'raw',
  measure: 'bzip',
  both: false,
  dex: null,
  dist: null, // n×n Float32Array
  sc: null,
  selected: null,
  running: 0, // a generation counter: a newer run cancels an older one
};

let eng;

// ------------------------------------------------------------ drawing ----

function spriteImage(px) {
  const img = new ImageData(W, H);
  for (let i = 0; i < SIZE; i++) {
    const c = SHADES[px[i]];
    img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
  }
  return img;
}

const spriteCache = new Map();
function spriteCanvas(c) {
  let cv = spriteCache.get(c);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.getContext('2d').putImageData(spriteImage(c.px), 0, 0);
    spriteCache.set(c, cv);
  }
  return cv;
}

function putSprite(canvas, c) {
  canvas.width = W; canvas.height = H;
  canvas.getContext('2d').drawImage(spriteCanvas(c), 0, 0);
}

// ---------------------------------------------------------------- run ----

async function recompute() {
  const gen = ++state.running;
  const dex = state.dex;
  const n = dex.critters.length;
  state.sc = null;
  renderBoard();

  if (state.measure !== 'bzip') {
    state.dist = BASELINES[state.measure].dist(dex);
    finish();
    return;
  }

  const rep = REPRESENTATIONS[state.rep];
  const t0 = performance.now();
  eng.build(dex.critters.map((c) => rep.of(c.px)), state.both);
  const total = eng.totalPairs();
  let done = 0, budget = 40;
  while (done < total) {
    const f0 = performance.now();
    done = eng.step(budget);
    const dt = performance.now() - f0;
    // aim for about 12 ms of work per frame, whatever the machine
    budget = Math.max(4, Math.min(4000, Math.round(budget * (12 / Math.max(1, dt)))));
    $('progress').value = done / total;
    $('progress-o').textContent = `${done.toLocaleString()} / ${total.toLocaleString()} pairs`;
    await new Promise(requestAnimationFrame);
    if (gen !== state.running) return;
  }
  state.dist = eng.ncd(n);
  state.singles = eng.singles(n);
  $('progress-o').textContent = `${total.toLocaleString()} pairs, ${(state.both ? total * 2 : total).toLocaleString()} compressions in ${((performance.now() - t0) / 1000).toFixed(1)} s`;
  finish();
}

function finish() {
  state.sc = score(state.dex, state.dist);
  state.inkAgree = inkAgreement(state.dex, state.sc.nearest);
  renderBoard();
  renderMatrix();
  renderDex();
  renderDetail();
  queryDrawing();
}

function newDex() {
  state.dex = makeDex(state.seed, state.growth);
  spriteCache.clear();
  if (state.selected != null && state.selected >= state.dex.critters.length) state.selected = null;
  renderDex();
  recompute();
}

// -------------------------------------------------------------- board ----

function renderBoard() {
  const sc = state.sc, dex = state.dex;
  if (!sc) {
    $('board').classList.add('pending');
    return;
  }
  $('board').classList.remove('pending');
  const hub = dex.critters[sc.hub];
  const ratio = sc.chance ? sc.hitRate / sc.chance : 0;
  $('hit').textContent = pct(sc.hitRate);
  $('hit-n').textContent = `${sc.hits} of ${dex.critters.length}`;
  $('chance').textContent = pct(sc.chance, 2);
  $('ratio').textContent = `${ratio.toFixed(1)}×`;
  $('kin').textContent = pct(sc.kinHitRate);
  $('kin-n').textContent = `among the ${sc.withKin} that have relatives`;
  $('hub-name').textContent = `#${String(hub.no).padStart(3, '0')} ${hub.name}`;
  $('hub-count').textContent = sc.hubCount;
  putSprite($('hub-sprite'), hub);
  $('hub-ink').textContent = `${pct(ink(hub.px), 0)} drawn in · fuller than ${pct(inkPercentile(dex, hub.id), 0)} of the dex`;
  $('inkagree').textContent = pct(state.inkAgree, 0);
  $('measure-name').textContent = state.measure === 'bzip'
    ? `bzip2 · ${REPRESENTATIONS[state.rep].label}${state.both ? ' · both orders' : ''}`
    : BASELINES[state.measure].label;
}

// ---------------------------------------------------------------- dex ----

function renderDex() {
  const dex = state.dex, sc = state.sc;
  const grid = $('dex');
  grid.replaceChildren();
  for (const c of dex.critters) {
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.dataset.id = c.id;
    cell.style.setProperty('--line', LINE_HUES(c.line));
    const main = document.createElement('canvas');
    putSprite(main, c);
    cell.append(main);
    const cap = document.createElement('span');
    cap.className = 'cap';
    cap.innerHTML = `<b>${String(c.no).padStart(3, '0')}</b> ${esc(c.name)}`;
    cell.append(cap);
    if (sc && sc.nearest[c.id] >= 0) {
      const m = dex.critters[sc.nearest[c.id]];
      const hit = m.line === c.line;
      cell.classList.toggle('hit', hit);
      const pair = document.createElement('span');
      pair.className = 'pair';
      const mini = document.createElement('canvas');
      putSprite(mini, m);
      pair.append('→ ', mini, ` ${String(m.no).padStart(3, '0')}`);
      cell.append(pair);
      cell.title = `${c.name} → ${m.name}${hit ? ' (same line)' : ''}`;
    }
    if (sc && c.id === sc.hub) cell.classList.add('hub');
    if (c.id === state.selected) cell.classList.add('sel');
    grid.append(cell);
  }
}

$('dex').addEventListener('click', (ev) => {
  const cell = ev.target.closest('.cell');
  if (!cell) return;
  select(+cell.dataset.id);
});

function select(id) {
  state.selected = id;
  for (const el of $('dex').querySelectorAll('.cell')) el.classList.toggle('sel', +el.dataset.id === id);
  renderDetail();
  renderMatrix();
  $('detail').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ------------------------------------------------------------- detail ----

function ranked(row, skip) {
  const out = [];
  for (let j = 0; j < row.length; j++) if (j !== skip && !Number.isNaN(row[j])) out.push([j, row[j]]);
  out.sort((a, b) => a[1] - b[1]);
  return out;
}

function neighbourList(el, me, row, kinLine, k = 8) {
  const dex = state.dex;
  const list = ranked(row, me ?? -1);
  el.replaceChildren();
  list.slice(0, k).forEach(([j, d], r) => {
    const c = dex.critters[j];
    const li = document.createElement('li');
    if (kinLine != null && c.line === kinLine) li.className = 'kin';
    const cv = document.createElement('canvas');
    putSprite(cv, c);
    li.append(cv);
    const t = document.createElement('span');
    t.innerHTML = `<b>${r + 1}.</b> ${esc(c.name)}<br><code>${state.measure === 'bzip' ? d.toFixed(3) : d.toFixed(state.measure === 'ink' ? 3 : 1)}</code>`;
    li.append(t);
    li.addEventListener('click', () => select(j));
    el.append(li);
  });
  return list;
}

function renderDetail() {
  const dex = state.dex;
  const id = state.selected;
  const box = $('detail');
  if (id == null || !state.dist) {
    box.hidden = id == null;
    return;
  }
  box.hidden = false;
  const c = dex.critters[id];
  const n = dex.critters.length;
  putSprite($('d-sprite'), c);
  $('d-name').textContent = `#${String(c.no).padStart(3, '0')} ${c.name}`;
  const line = dex.lines[c.line];
  $('d-line').innerHTML = line.len === 1
    ? 'does not evolve — it has no relatives to find'
    : `stage ${c.stage + 1} of ${line.len}: ${line.members.map((m) => esc(dex.critters[m].name)).join(' → ')}`;
  const row = state.dist.subarray(id * n, id * n + n);
  const list = neighbourList($('d-list'), id, row, c.line);
  const bits = [`${pct(ink(c.px), 0)} drawn in`];
  if (state.measure === 'bzip' && state.singles) bits.push(`bzip2 alone: ${state.singles[id]} bytes from ${REPRESENTATIONS[state.rep].of(c.px).length}`);
  if (line.len > 1) {
    const ranks = line.members.filter((m) => m !== id).map((m) => 1 + list.findIndex(([j]) => j === m));
    bits.push(`its relatives rank ${ranks.join(' and ')} of ${n - 1}`);
  }
  $('d-facts').textContent = bits.join(' · ');
}

// The engine is a real bzip2, and this is the check a reader can repeat:
// save the bytes it compressed, decompress them with the reference binary.
$('d-save').addEventListener('click', () => {
  if (state.selected == null) return;
  const c = state.dex.critters[state.selected];
  const z = eng.bzip2(REPRESENTATIONS[state.rep].of(c.px));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([z], { type: 'application/x-bzip2' }));
  a.download = `${c.name.toLowerCase()}-${state.rep}.bz2`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ------------------------------------------------------------- matrix ----

function renderMatrix() {
  const cv = $('matrix');
  const ctx = cv.getContext('2d');
  const dex = state.dex, n = dex.critters.length, D = state.dist;
  const cell = 3;
  cv.width = cv.height = n * cell;
  ctx.fillStyle = '#0c1a16';
  ctx.fillRect(0, 0, cv.width, cv.height);
  if (!D || !state.sc) return;
  // colour by rank within the row, not by raw value: every measure here has
  // its own scale, and what the eye needs is "near" against "far"
  const img = ctx.createImageData(n, n);
  for (let i = 0; i < n; i++) {
    const row = ranked(D.subarray(i * n, i * n + n), i);
    row.forEach(([j], r) => {
      const t = 1 - r / (n - 2);
      const v = Math.pow(t, 6);
      const k = (i * n + j) * 4;
      img.data[k] = 20 + 220 * v; img.data[k + 1] = 40 + 200 * v; img.data[k + 2] = 34 + 120 * v; img.data[k + 3] = 255;
    });
  }
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = n;
  tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, n * cell, n * cell);
  // the lines, as squares on the diagonal
  ctx.lineWidth = 1;
  for (const L of dex.lines) {
    if (L.len < 2) continue;
    const a = L.members[0] * cell, s = L.len * cell;
    ctx.strokeStyle = LINE_HUES(L.id);
    ctx.strokeRect(a + 0.5, a + 0.5, s - 1, s - 1);
  }
  // each row's choice
  ctx.fillStyle = '#ff6b5a';
  for (let i = 0; i < n; i++) {
    const j = state.sc.nearest[i];
    if (j >= 0) ctx.fillRect(j * cell, i * cell, cell, cell);
  }
  if (state.selected != null) {
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(0.5, state.selected * cell + 0.5, n * cell - 1, cell - 1);
  }
}

$('matrix').addEventListener('click', (ev) => {
  const r = ev.target.getBoundingClientRect();
  const n = state.dex.critters.length;
  const i = Math.floor(((ev.clientY - r.top) / r.height) * n);
  if (i >= 0 && i < n) select(i);
});
$('matrix').addEventListener('mousemove', (ev) => {
  if (!state.dist) return;
  const r = ev.target.getBoundingClientRect();
  const n = state.dex.critters.length;
  const i = Math.floor(((ev.clientY - r.top) / r.height) * n);
  const j = Math.floor(((ev.clientX - r.left) / r.width) * n);
  if (i < 0 || j < 0 || i >= n || j >= n || i === j) { $('m-hover').textContent = ''; return; }
  const a = state.dex.critters[i], b = state.dex.critters[j];
  $('m-hover').textContent = `${a.name} · ${b.name}: ${state.dist[i * n + j].toFixed(3)}${a.line === b.line ? ' · same line' : ''}`;
});

// ------------------------------------------------------------ drawing ----

const pad = { px: new Uint8Array(SIZE), shade: 3, brush: 1, down: false, dirty: false, last: null };

function padDraw() {
  const cv = $('pad');
  cv.width = W; cv.height = H;
  cv.getContext('2d').putImageData(spriteImage(pad.px), 0, 0);
}

function padAt(ev) {
  const r = $('pad').getBoundingClientRect();
  return [Math.floor(((ev.clientX - r.left) / r.width) * W), Math.floor(((ev.clientY - r.top) / r.height) * H)];
}

function padPaint(x, y) {
  const b = pad.brush - 1;
  for (let dy = -b; dy <= b; dy++) for (let dx = -b; dx <= b; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx >= 0 && yy >= 0 && xx < W && yy < H && dx * dx + dy * dy <= b * b + b) pad.px[yy * W + xx] = pad.shade;
  }
}

function padLine(a, b) {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
  for (let k = 0; k <= n; k++) padPaint(Math.round(a[0] + (b[0] - a[0]) * k / n), Math.round(a[1] + (b[1] - a[1]) * k / n));
}

$('pad').addEventListener('pointerdown', (ev) => {
  pad.down = true;
  $('pad').setPointerCapture(ev.pointerId);
  const p = padAt(ev);
  padLine(p, p);
  pad.last = p;
  padDraw();
});
$('pad').addEventListener('pointermove', (ev) => {
  if (!pad.down) return;
  const p = padAt(ev);
  padLine(pad.last, p);
  pad.last = p;
  padDraw();
});
const padUp = () => {
  if (!pad.down) return;
  pad.down = false;
  queryDrawing();
};
$('pad').addEventListener('pointerup', padUp);
$('pad').addEventListener('pointercancel', padUp);

for (const b of document.querySelectorAll('[data-shade]')) {
  b.addEventListener('click', () => {
    pad.shade = +b.dataset.shade;
    for (const o of document.querySelectorAll('[data-shade]')) o.setAttribute('aria-pressed', o === b);
  });
}
$('brush').addEventListener('input', () => { pad.brush = +$('brush').value; $('brush-o').textContent = pad.brush; });
$('pad-clear').addEventListener('click', () => { pad.px.fill(0); padDraw(); queryDrawing(); });
$('pad-copy').addEventListener('click', () => {
  if (state.selected == null) return;
  pad.px.set(state.dex.critters[state.selected].px);
  padDraw();
  queryDrawing();
});

function queryDrawing() {
  const el = $('pad-list');
  if (!state.dex || !state.sc) return;
  if (!pad.px.some((v) => v)) {
    el.innerHTML = '<li class="empty">draw something</li>';
    $('pad-facts').textContent = '';
    return;
  }
  const dex = state.dex, n = dex.critters.length;
  let row;
  if (state.measure === 'bzip') {
    // the set in the engine holds the current representation, so the
    // drawing goes in the same way
    row = eng.query(REPRESENTATIONS[state.rep].of(pad.px), n, state.both);
    $('pad-facts').textContent = `bzip2 makes ${eng.bzLen(REPRESENTATIONS[state.rep].of(pad.px))} bytes of it · ${pct(ink(pad.px), 0)} drawn in`;
  } else {
    // a baseline: build the row with the drawing as an extra member
    const probe = { px: pad.px, line: -1, stages: 1 };
    const tmp = { critters: [...dex.critters, probe] };
    const D = BASELINES[state.measure].dist(tmp);
    row = D.subarray(n * (n + 1), n * (n + 1) + n);
    $('pad-facts').textContent = `${pct(ink(pad.px), 0)} drawn in`;
  }
  neighbourList(el, null, row, null, 5);
}

// ----------------------------------------------------------- controls ----

function bindRadio(name, key, after) {
  for (const b of document.querySelectorAll(`[data-${name}]`)) {
    b.addEventListener('click', () => {
      state[key] = b.dataset[name];
      for (const o of document.querySelectorAll(`[data-${name}]`)) o.setAttribute('aria-pressed', o === b);
      after();
    });
  }
}

bindRadio('rep', 'rep', () => {
  $('rep-note').textContent = REPRESENTATIONS[state.rep].note;
  if (state.measure !== 'bzip') pressMeasure('bzip');
  recompute();
});
bindRadio('measure', 'measure', () => {
  $('measure-note').textContent = state.measure === 'bzip' ? 'normalized compression distance under bzip2 -9' : BASELINES[state.measure].note;
  document.body.classList.toggle('baseline', state.measure !== 'bzip');
  recompute();
});
function pressMeasure(m) {
  state.measure = m;
  for (const o of document.querySelectorAll('[data-measure]')) o.setAttribute('aria-pressed', o.dataset.measure === m);
  document.body.classList.toggle('baseline', m !== 'bzip');
  $('measure-note').textContent = 'normalized compression distance under bzip2 -9';
}

$('both').addEventListener('change', () => { state.both = $('both').checked; if (state.measure === 'bzip') recompute(); });

let growthTimer;
$('growth').addEventListener('input', () => {
  state.growth = +$('growth').value;
  $('growth-o').textContent = state.growth === 1 ? 'as drawn' : state.growth === 0 ? 'none' : pct(state.growth, 0);
  clearTimeout(growthTimer);
  growthTimer = setTimeout(newDex, 200);
});
$('reroll').addEventListener('click', () => {
  state.seed = 1 + Math.floor(Math.random() * 99999);
  $('seed').value = state.seed;
  newDex();
});
$('seed').addEventListener('change', () => {
  state.seed = Math.max(1, Math.floor(+$('seed').value) || 151);
  newDex();
});

// ---------------------------------------------------------------- go ----

(async () => {
  try {
    eng = await loadEngine(new URL('./bzncd.wasm', import.meta.url));
  } catch (err) {
    $('progress-o').textContent = `the engine did not load: ${err.message}`;
    return;
  }
  padDraw();
  newDex();
})();
