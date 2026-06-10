// Glue: routing, controls, the solver-verdict panel, and the atlas gallery.
import { puzzleForSeed, hunt } from './atlas.js';
import { Player } from './play.js';
import { thumb } from './render.js';

const $ = (id) => document.getElementById(id);
const GENUS_HUE = { binairo: 'genus-binairo', nonogram: 'genus-nonogram' };
const GENUS_CSS = { binairo: 'var(--g-binairo)', nonogram: 'var(--g-nonogram)' };

// deterministic generation ⇒ safe to memoize
const cache = new Map();
function getPuzzle(n) {
  if (!cache.has(n)) cache.set(n, puzzleForSeed(n));
  return cache.get(n);
}

let player = null;
let currentN = 1;

/* ---------------- routing ---------------- */
function readURL() {
  const p = new URLSearchParams(location.search);
  const n = parseInt(p.get('n'), 10);
  const tab = p.get('tab');
  if (Number.isFinite(n) && n > 0) currentN = n;
  if (tab) showTab(tab, false);
}
function writeURL() {
  const p = new URLSearchParams();
  p.set('n', currentN);
  const tab = document.querySelector('.tabs button.active')?.dataset.tab;
  if (tab && tab !== 'play') p.set('tab', tab);
  history.replaceState(null, '', '?' + p.toString());
}

function showTab(name, push = true) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tabpanel').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + name));
  if (name === 'atlas') ensureGallery();
  if (push) writeURL();
}

/* ---------------- play ---------------- */
function loadPuzzle(n) {
  currentN = n;
  $('seed').value = n;
  const data = getPuzzle(n);
  const host = $('board-host');
  if (!data) {
    host.innerHTML = '<div class="loading">no puzzle at this page — try another</div>';
    $('board-title').textContent = '—';
    return;
  }
  const { inst, report } = data;
  $('board-title').textContent = inst.label;
  const pill = $('genus-pill');
  pill.textContent = inst.genus;
  pill.className = 'genus-pill ' + (GENUS_HUE[inst.genus] || '');
  $('win-banner').classList.remove('show');

  player = new Player(inst, host, {
    onSolved: () => $('win-banner').classList.add('show'),
    onChange: (p) => updateProgress(p),
  });
  updateProgress(player.progress());
  renderVerdict(inst, report);
  renderHowto(inst);
  writeURL();
}

function updateProgress(p) {
  $('progress').textContent = `${p.placed} / ${p.target} filled`;
}

function renderHowto(inst) {
  const txt = inst.genus === 'nonogram'
    ? 'Click a cell to fill it; click again to mark it blank (✕); again to clear. Right-click cycles backward. Match the run-length clues.'
    : 'Click an empty cell to set the first color; again for the second; again to clear. No three alike in a line; each line balanced; no two lines identical.';
  $('howto').innerHTML = `<span style="color:var(--faint);font-size:12px;">${txt}</span>`;
}

function renderVerdict(inst, report) {
  const v = $('verdict');
  const row = (ok, label) => `<div class="verdict-row"><span class="ico ${ok ? 'ok' : 'no'}">${ok ? '✓' : '○'}</span><span>${label}</span></div>`;
  v.innerHTML =
    row(true, 'Exactly one solution — certified by exhaustive search') +
    row(report.solved, report.solved ? 'Fair — solvable by pure deduction' : 'Needs a guess somewhere') +
    `<div class="verdict-row"><span class="ico">⛓</span><span>${report.steps} deduction rounds, depth-${report.peakTier} reasoning</span></div>`;

  $('diff-num').textContent = report.difficulty;
  $('diff-tier').textContent = report.diffTier;
  $('int-num').textContent = report.interest;
  $('descriptor').textContent = report.descriptor;

  // technique fingerprint
  const tech = $('tech');
  const info = inst.genusDef.techniqueInfo || {};
  const maxCount = Math.max(1, ...report.techniques.map((t) => t.count));
  tech.innerHTML = report.techniques.length
    ? report.techniques
        .sort((a, b) => b.tier - a.tier || b.count - a.count)
        .map((t) => {
          const meta = info[t.key] || {};
          const w = Math.round((t.count / maxCount) * 100);
          return `<div class="tech-item">
            <div class="tt"><span>${meta.label || t.key}</span><span class="tier">tier ${t.tier} · ${t.count}×</span></div>
            <div class="tech-bar" style="width:${Math.max(8, w)}%"></div>
            <div class="hint">${meta.hint || ''}</div>
          </div>`;
        }).join('')
    : '<div class="hint">solved at a glance</div>';

  // interest signals
  const sig = $('signals');
  const order = ['depth', 'variety', 'texture', 'economy', 'pace', 'fairness'];
  sig.innerHTML = order.map((k) => {
    const val = report.signals[k] ?? 0;
    return `<div class="sig"><span class="name">${k}</span><span class="track"><i style="width:${Math.round(val * 100)}%"></i></span><span class="val">${val.toFixed(2)}</span></div>`;
  }).join('');
}

/* ---------------- hunting ---------------- */
function randomSeed() { return 1 + Math.floor(Math.random() * 100000); }

function doSurprise() {
  const genus = $('huntGenus').value || undefined;
  const diff = $('huntDiff').value;
  const want = { minInterest: 80 };
  if (genus) want.genus = genus;
  if (diff === 'hard') want.minDifficulty = 42;
  if (diff === 'easy') want.maxDifficulty = 28;
  const start = randomSeed();
  const found = hunt(start, 220, want) || hunt(start, 220, { genus });
  if (found) { cache.set(found.n, found); loadPuzzle(found.n); }
}

/* ---------------- atlas gallery ---------------- */
let galleryStart = 1;
const GAL_COUNT = 24;
let galleryBuilt = false;

function ensureGallery() { if (!galleryBuilt) { galleryBuilt = true; buildGallery(); } }

async function buildGallery() {
  const host = $('gallery');
  host.innerHTML = '<div class="loading">generating & grading…</div>';
  const genusFilter = $('g-genus').value;
  const sort = $('g-sort').value;
  const items = [];
  for (let n = galleryStart; n < galleryStart + GAL_COUNT; n++) {
    const data = getPuzzle(n);
    if (!data) continue;
    if (genusFilter && data.inst.genus !== genusFilter) continue;
    items.push(data);
    if ((n - galleryStart) % 6 === 5) await new Promise((r) => setTimeout(r, 0)); // yield
  }
  if (sort === 'interest') items.sort((a, b) => b.report.interest - a.report.interest);
  else if (sort === 'difficulty') items.sort((a, b) => b.report.difficulty - a.report.difficulty);
  else items.sort((a, b) => a.n - b.n);

  host.innerHTML = '';
  $('g-page').textContent = `pages ${galleryStart}–${galleryStart + GAL_COUNT - 1}`;
  if (!items.length) { host.innerHTML = '<div class="loading">nothing matches that filter on this page</div>'; return; }
  for (const data of items) host.appendChild(card(data));
}

function card(data) {
  const { n, inst, report } = data;
  const el = document.createElement('div');
  el.className = 'card';
  el.appendChild((() => {
    const t = document.createElement('div'); t.className = 'thumb'; t.appendChild(thumb(inst)); return t;
  })());
  const top = document.createElement('div');
  top.className = 'meta-top';
  top.innerHTML = `<span class="gpill" style="background:${GENUS_CSS[inst.genus]}">${inst.genus}</span><span class="seedno">#${n}</span>`;
  el.appendChild(top);
  const name = document.createElement('div');
  name.className = 'cardname';
  name.textContent = inst.label;
  el.appendChild(name);
  const stats = document.createElement('div');
  stats.className = 'cardstats';
  stats.innerHTML = `<span>${report.diffTier} · ${report.difficulty}</span><span class="istar">✦ ${report.interest}</span>`;
  el.appendChild(stats);
  el.addEventListener('click', () => { loadPuzzle(n); showTab('play'); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  return el;
}

/* ---------------- wire up ---------------- */
function init() {
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('go').addEventListener('click', () => loadPuzzle(Math.max(1, parseInt($('seed').value, 10) || 1)));
  $('seed').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('go').click(); });
  $('prev').addEventListener('click', () => loadPuzzle(Math.max(1, currentN - 1)));
  $('next').addEventListener('click', () => loadPuzzle(currentN + 1));
  $('random').addEventListener('click', () => loadPuzzle(randomSeed()));
  $('surprise').addEventListener('click', doSurprise);
  $('check').addEventListener('click', () => { const n = player?.showMistakes(); if (n != null) $('progress').textContent = n ? `${n} mistake${n > 1 ? 's' : ''} highlighted` : 'no mistakes so far'; });
  $('reset').addEventListener('click', () => player?.reset());
  $('reveal').addEventListener('click', () => player?.reveal());
  $('g-prev').addEventListener('click', () => { galleryStart = Math.max(1, galleryStart - GAL_COUNT); buildGallery(); });
  $('g-next').addEventListener('click', () => { galleryStart += GAL_COUNT; buildGallery(); });
  $('g-genus').addEventListener('change', buildGallery);
  $('g-sort').addEventListener('change', buildGallery);
  $('ver').textContent = 'v1 · 2 genera';

  readURL();
  loadPuzzle(currentN);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
