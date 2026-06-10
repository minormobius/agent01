// Glue: loads the committed substrate, then the usual fable shell — two genera
// (Ladder / Fold), the meaning-map canvas, oracle verdict, gallery.
import { loadSemantic } from './engine.js';
import { puzzleForSeed, hunt } from './atlas.js';

const $ = (id) => document.getElementById(id);
const GENUS_CSS = { ladder: '#4338ca', fold: '#b5476d' };

let S = null;                       // the substrate
const cache = new Map();
function getPuzzle(n) { if (!cache.has(n)) cache.set(n, puzzleForSeed(S, n)); return cache.get(n); }

let currentN = 3, game = null;      // game = active genus controller

/* ---------- meaning-map canvas ---------- */
let mapCv, mapCtx, dust = null, dpr = 1;
function setupMap() {
  mapCv = $('map'); mapCtx = mapCv.getContext('2d');
  dpr = window.devicePixelRatio || 1;
  const w = Math.min(mapCv.parentElement.clientWidth || 520, 540), h = Math.round(w * 0.62);
  mapCv.width = w * dpr; mapCv.height = h * dpr;
  mapCv.style.width = w + 'px'; mapCv.style.height = h + 'px';
  mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mapCv._w = w; mapCv._h = h;
  // pre-render the dust (all 7k words) once
  dust = document.createElement('canvas');
  dust.width = w * dpr; dust.height = h * dpr;
  const dctx = dust.getContext('2d');
  dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  dctx.fillStyle = dark ? 'rgba(236,231,218,.14)' : 'rgba(31,29,26,.12)';
  for (let i = 0; i < S.n; i++) {
    const p = S.pos(i);
    dctx.fillRect(p.x * (w - 8) + 4, p.y * (h - 8) + 4, 1.3, 1.3);
  }
}
function mapPt(i) { return { x: S.pos(i).x * (mapCv._w - 8) + 4, y: S.pos(i).y * (mapCv._h - 8) + 4 }; }
function drawMap(opts = {}) {
  const ctx = mapCtx, w = mapCv._w, h = mapCv._h;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(dust, 0, 0, w, h);
  const mark = (i, color, r = 4, ring = false) => {
    const p = mapPt(i);
    ctx.fillStyle = color; ctx.strokeStyle = color;
    if (ring) { ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, r + 2, 0, 7); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); }
  };
  if (opts.trail && opts.trail.length > 1) {
    ctx.strokeStyle = 'rgba(67,56,202,.75)'; ctx.lineWidth = 1.8; ctx.beginPath();
    const p0 = mapPt(opts.trail[0]); ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < opts.trail.length; i++) { const p = mapPt(opts.trail[i]); ctx.lineTo(p.x, p.y); }
    ctx.stroke();
  }
  for (const m of opts.marks || []) mark(m.i, m.color, m.r, m.ring);
  for (const lbl of opts.labels || []) {
    const p = mapPt(lbl.i);
    ctx.font = '11px ui-monospace, monospace'; ctx.fillStyle = lbl.color; ctx.textAlign = 'center';
    ctx.fillText(S.wordOf(lbl.i), p.x, p.y - 8);
  }
}

/* ---------- LADDER controller ---------- */
class Ladder {
  constructor(p) {
    this.p = p; this.cur = p.start; this.trail = [p.start]; this.moves = 0; this.solved = false; this.playing = false;
    this.renderBoard();
  }
  renderBoard() {
    const host = $('game-host');
    const tsim = S.cos(this.cur, this.p.target);
    host.innerHTML = `
      <div class="word-now">${S.wordOf(this.cur)}</div>
      <div class="word-target">make your way to <b>${S.wordOf(this.p.target)}</b> · closeness:</div>
      <div class="simmeter"><i style="width:${Math.round(Math.max(0, tsim) * 100)}%"></i></div>
      <div class="nbrs" id="nbrs"></div>
      <div class="trail">${this.trail.map((i, k) => k === this.trail.length - 1 ? `<b>${S.wordOf(i)}</b>` : S.wordOf(i)).join(' → ')}</div>`;
    const nb = $('nbrs');
    for (const { id } of S.neighbors(this.cur)) {
      const b = document.createElement('button');
      b.textContent = S.wordOf(id);
      b.addEventListener('click', () => this.move(id));
      nb.appendChild(b);
    }
    this.drawMap();
    $('moves').textContent = `${this.moves} hops · par ${this.p.par}`;
  }
  drawMap() {
    drawMap({
      trail: this.trail,
      marks: [{ i: this.p.start, color: '#2f9d6e', r: 4 }, { i: this.p.target, color: '#c2607f', r: 4, ring: true }, { i: this.cur, color: '#4338ca', r: 4.5 }],
      labels: [{ i: this.p.start, color: '#2f9d6e' }, { i: this.p.target, color: '#c2607f' }],
    });
  }
  move(id) {
    if (this.solved || this.playing) return;
    if (!S.isNeighbor(this.cur, id)) return;
    this.cur = id; this.trail.push(id); this.moves++;
    if (id === this.p.target) { this.solved = true; this.win(); }
    this.renderBoard();
  }
  win() {
    const beat = this.moves <= this.p.par;
    $('win-banner').textContent = beat ? `Crossed in ${this.moves} — you matched the oracle's par! ✦` : `Crossed in ${this.moves} hops (par ${this.p.par}).`;
    $('win-banner').classList.add('show');
  }
  undo() { if (this.playing || this.trail.length < 2) return; this.trail.pop(); this.cur = this.trail[this.trail.length - 1]; this.moves++; this.solved = false; this.renderBoard(); }
  reset() { if (this.playing) return; this.cur = this.p.start; this.trail = [this.p.start]; this.moves = 0; this.solved = false; $('win-banner').classList.remove('show'); this.renderBoard(); }
  async watchSolver() {
    if (this.playing) return;
    this.reset(); this.playing = true;
    for (const id of this.p.path.slice(1)) {
      this.cur = id; this.trail.push(id); this.moves++;
      this.renderBoard();
      await new Promise((r) => setTimeout(r, 550));
    }
    this.playing = false;
    this.solved = true;
    $('win-banner').textContent = `The oracle's crossing: ${this.p.path.map((i) => S.wordOf(i)).join(' → ')} (par ${this.p.par}). ✦`;
    $('win-banner').classList.add('show');
  }
  howto() { return `Step only along a word's twelve nearest neighbours in meaning. The oracle's shortest crossing is ${this.p.par} hops.`; }
}

/* ---------- FOLD controller ---------- */
class Fold {
  constructor(p) {
    this.p = p; this.sel = new Set(); this.locked = new Map(); this.mistakes = 0; this.solved = false;
    this.colors = ['#2f9d6e', '#c2792e', '#7a55c8'];
    this.renderBoard();
  }
  famOf(id) { for (let f = 0; f < 3; f++) if (this.p.families[f].includes(id)) return f; return -1; }
  renderBoard() {
    const host = $('game-host');
    host.innerHTML = `<div class="word-target" style="margin-top:6px;">select four words that belong together, then <b>fold</b></div>
      <div class="fold-grid" id="fgrid"></div>
      <div style="text-align:center;"><button class="btn primary" id="fold-btn">fold ⟡</button></div>`;
    const grid = $('fgrid');
    for (const id of this.p.order) {
      const b = document.createElement('button');
      b.textContent = S.wordOf(id);
      if (this.locked.has(id)) { b.classList.add('locked'); b.style.background = this.colors[this.locked.get(id)]; b.style.borderColor = 'transparent'; }
      else b.addEventListener('click', () => { this.sel.has(id) ? this.sel.delete(id) : this.sel.size < 4 && this.sel.add(id); b.classList.toggle('sel', this.sel.has(id)); });
      if (this.sel.has(id)) b.classList.add('sel');
      grid.appendChild(b);
    }
    $('fold-btn').addEventListener('click', () => this.tryFold());
    this.drawMap();
    $('moves').textContent = `${this.mistakes} miss${this.mistakes === 1 ? '' : 'es'} · margin ${this.p.minMargin.toFixed(2)}`;
  }
  drawMap() {
    const marks = [];
    this.p.order.forEach((id) => {
      const f = this.locked.has(id) ? this.locked.get(id) : -1;
      marks.push({ i: id, color: f >= 0 ? this.colors[f] : (this.solved ? this.colors[this.famOf(id)] : '#888'), r: 3.5 });
    });
    drawMap({ marks });
  }
  tryFold() {
    if (this.solved || this.sel.size !== 4) return;
    const ids = [...this.sel];
    const f = this.famOf(ids[0]);
    const exact = f >= 0 && ids.every((id) => this.famOf(id) === f);
    if (exact) {
      for (const id of ids) this.locked.set(id, f);
      this.sel.clear();
      if (this.locked.size === 12) { this.solved = true; $('win-banner').textContent = `All three families folded — ${this.mistakes} miss${this.mistakes === 1 ? '' : 'es'}. ✦`; $('win-banner').classList.add('show'); }
    } else { this.mistakes++; this.sel.clear(); }
    this.renderBoard();
  }
  undo() {}
  reset() { this.sel.clear(); this.locked.clear(); this.mistakes = 0; this.solved = false; $('win-banner').classList.remove('show'); this.renderBoard(); }
  async watchSolver() {
    if (this.solved) return;
    this.reset();
    for (let f = 0; f < 3; f++) { for (const id of this.p.families[f]) this.locked.set(id, f); this.renderBoard(); await new Promise((r) => setTimeout(r, 600)); }
    this.solved = true;
    $('win-banner').textContent = `The certified families, by margin ${this.p.minMargin.toFixed(2)}. ✦`;
    $('win-banner').classList.add('show');
  }
  howto() { return `Three hidden families of four. The grouping ships with a margin certificate — every word measurably closer to its own family than to the others.`; }
}

/* ---------- shell ---------- */
function readURL() { const p = new URLSearchParams(location.search); const n = parseInt(p.get('n'), 10); if (Number.isFinite(n) && n > 0) currentN = n; if (p.get('tab')) showTab(p.get('tab'), false); }
function writeURL() { const p = new URLSearchParams(); p.set('n', currentN); const t = document.querySelector('.tabs button.active')?.dataset.tab; if (t && t !== 'play') p.set('tab', t); history.replaceState(null, '', '?' + p.toString()); }
function showTab(name, push = true) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tabpanel').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + name));
  if (name === 'atlas') ensureGallery();
  if (push) writeURL();
}

function load(n) {
  currentN = n; $('seed').value = n;
  const p = getPuzzle(n);
  $('win-banner').classList.remove('show');
  if (!p) { $('board-title').textContent = 'no puzzle here'; return; }
  $('board-title').textContent = p.genus === 'ladder' ? `${S.wordOf(p.start)} → ${S.wordOf(p.target)}` : 'three hidden families';
  const pill = $('genus-pill'); pill.textContent = p.genus; pill.style.background = GENUS_CSS[p.genus];
  game = p.genus === 'ladder' ? new Ladder(p) : new Fold(p);
  $('howto').innerHTML = `<span style="color:var(--faint);font-size:12px;">${game.howto()}</span>`;
  renderVerdict(p);
  renderRules(p);
  writeURL();
}

function renderVerdict(p) {
  const r = p.report;
  $('verdict').innerHTML = p.genus === 'ladder'
    ? `<div class="verdict-row"><span class="ico ok">✓</span><span>Crossing exists — BFS over the meaning-graph</span></div>
       <div class="verdict-row"><span class="ico ok">✓</span><span>Optimal crossing: par ${p.par}</span></div>
       <div class="verdict-row"><span class="ico">↭</span><span>endpoint similarity ${S.cos(p.start, p.target).toFixed(2)} — a wide gulf</span></div>`
    : `<div class="verdict-row"><span class="ico ok">✓</span><span>Families certified separable</span></div>
       <div class="verdict-row"><span class="ico ok">✓</span><span>margin ${p.minMargin.toFixed(2)} — every word closer to home</span></div>
       <div class="verdict-row"><span class="ico">⟡</span><span>difficulty = inverse margin, measured</span></div>`;
  $('diff-num').textContent = r.difficulty; $('diff-tier').textContent = r.diffTier;
  $('int-num').textContent = r.interest; $('descriptor').textContent = r.descriptor;
  const keys = Object.keys(r.signals);
  $('signals').innerHTML = keys.map((k) => `<div class="sig"><span class="name">${k}</span><span class="track"><i style="width:${Math.round((r.signals[k] ?? 0) * 100)}%"></i></span><span class="val">${(r.signals[k] ?? 0).toFixed(2)}</span></div>`).join('');
}

function randomSeed() { return 1 + Math.floor(Math.random() * 100000); }
function doSurprise() {
  const want = { minInterest: 75 };
  const g = $('huntGenus').value; if (g) want.genus = g;
  const d = $('huntDiff').value;
  if (d === 'hard') want.minDifficulty = 60;
  if (d === 'easy') want.maxDifficulty = 35;
  const found = hunt(S, randomSeed(), 300, want) || hunt(S, randomSeed(), 300, {});
  if (found) { cache.set(found.n, found); load(found.n); }
}

let galleryStart = 1; const GAL = 18; let built = false;
function ensureGallery() { if (!built) { built = true; buildGallery(); } }
function buildGallery() {
  const host = $('gallery'); host.innerHTML = '';
  const gf = $('g-genus').value, sort = $('g-sort').value;
  const items = [];
  for (let n = galleryStart; n < galleryStart + GAL; n++) { const p = getPuzzle(n); if (!p) continue; if (gf && p.genus !== gf) continue; items.push(p); }
  if (sort === 'interest') items.sort((a, b) => b.report.interest - a.report.interest);
  else if (sort === 'difficulty') items.sort((a, b) => b.report.difficulty - a.report.difficulty);
  else items.sort((a, b) => a.n - b.n);
  $('g-page').textContent = `pages ${galleryStart}–${galleryStart + GAL - 1}`;
  if (!items.length) { host.innerHTML = '<div class="loading">nothing here</div>'; return; }
  for (const p of items) {
    const el = document.createElement('div'); el.className = 'card';
    const name = p.genus === 'ladder' ? `${S.wordOf(p.start)} → ${S.wordOf(p.target)}` : p.families.map((f) => S.wordOf(f[0])).join(' · ');
    el.innerHTML = `<div class="meta-top"><span class="bp" style="background:${GENUS_CSS[p.genus]}">${p.genus}</span><span class="seedno">#${p.n}</span></div>
      <div class="cardname" style="font-size:14px;margin:8px 0;">${name}</div>
      <div class="cardstats"><span>${p.report.diffTier}${p.genus === 'ladder' ? ' · par ' + p.par : ' · m ' + p.minMargin.toFixed(2)}</span><span class="istar">✦ ${p.report.interest}</span></div>`;
    el.addEventListener('click', () => { load(p.n); showTab('play'); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    host.appendChild(el);
  }
}

async function init() {
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  S = await loadSemantic('./data');
  setupMap();
  $('go').addEventListener('click', () => load(Math.max(1, parseInt($('seed').value, 10) || 1)));
  $('seed').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('go').click(); });
  $('prev').addEventListener('click', () => load(Math.max(1, currentN - 1)));
  $('next').addEventListener('click', () => load(currentN + 1));
  $('random').addEventListener('click', () => load(randomSeed()));
  $('surprise').addEventListener('click', doSurprise);
  $('undo').addEventListener('click', () => game?.undo());
  $('reset').addEventListener('click', () => game?.reset());
  $('solve').addEventListener('click', () => game?.watchSolver());
  $('g-prev').addEventListener('click', () => { galleryStart = Math.max(1, galleryStart - GAL); buildGallery(); });
  $('g-next').addEventListener('click', () => { galleryStart += GAL; buildGallery(); });
  $('g-genus').addEventListener('change', buildGallery);
  $('g-sort').addEventListener('change', buildGallery);
  window.addEventListener('resize', () => { if (S) { setupMap(); game?.drawMap?.(); } });
  $('ver').textContent = `v1 · ${S.n.toLocaleString()} words · 2 genera`;
  readURL();
  load(currentN);
}
/* fold-out rules — per genus, with the substrate explained */
function renderRules(p) {
  const sub = `<span class="dim">The board is a frozen embedding: 7,000 words, each wired to its twelve nearest neighbours in meaning. The map shows it flattened — your moves draw on it.</span>`;
  if (p.genus === 'ladder') {
    $('rules-body').innerHTML =
      `<div class="rrow"><span class="rk">goal</span><span class="rv">Get from <b>${S.wordOf(p.start)}</b> to <b>${S.wordOf(p.target)}</b>.</span></div>` +
      `<div class="rrow"><span class="rk">law</span><span class="rv">From your current word you may step only to one of its <b>twelve nearest neighbours</b> — the buttons below the map. Meaning is the only road.</span></div>` +
      `<div class="rrow"><span class="rk">the answer</span><span class="rv">A BFS over the meaning-graph found the shortest crossing: <b>par ${p.par}</b>. The closeness meter shows how near your current word sits to the target.</span></div>` +
      `<div class="rrow"><span class="rk">substrate</span><span class="rv">${sub}</span></div>`;
  } else {
    $('rules-body').innerHTML =
      `<div class="rrow"><span class="rk">goal</span><span class="rv">Sort the twelve words into <b>three hidden families of four</b>.</span></div>` +
      `<div class="rrow"><span class="rk">law</span><span class="rv">Select four words, press <b>fold</b>. Exactly right → the family locks in colour. Wrong → a miss. No partial credit.</span></div>` +
      `<div class="rrow"><span class="rk">the answer</span><span class="rv">The grouping ships with a <b>margin certificate</b> (${p.minMargin.toFixed(2)} here): every word is measurably closer to its own family than to either other. Tight margin = wickedly confusable.</span></div>` +
      `<div class="rrow"><span class="rk">substrate</span><span class="rv">${sub}</span></div>`;
  }
  $('rules').open = false;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

