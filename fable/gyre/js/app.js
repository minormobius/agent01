// Glue: routing, controls, the 3D canvas board, the solver-verdict panel, gallery.
import { worldForSeed, hunt } from './atlas.js';
import { Renderer, drawThumb } from './render.js';
import { Player } from './play.js';
import { BUNDLE_BY_ID, BUNDLES } from './bundles.js';

const $ = (id) => document.getElementById(id);
const accent = (b) => (BUNDLE_BY_ID[b] ? BUNDLE_BY_ID[b].accent : 'var(--accent)');
const cache = new Map();
function getWorld(n) { if (!cache.has(n)) cache.set(n, worldForSeed(n)); return cache.get(n); }

let player = null, renderer = null, currentN = 1;

function readURL() {
  const p = new URLSearchParams(location.search);
  const n = parseInt(p.get('n'), 10);
  if (Number.isFinite(n) && n > 0) currentN = n;
  if (p.get('tab')) showTab(p.get('tab'), false);
}
function writeURL() {
  const p = new URLSearchParams(); p.set('n', currentN);
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

function loadWorld(n) {
  currentN = n; $('seed').value = n;
  $('board-title').textContent = 'generating & sweeping…';
  // generation can take ~1s; yield a frame so the label paints first
  setTimeout(() => {
    const data = getWorld(n);
    if (player) player.destroy();
    if (!data) { $('board-title').textContent = 'no world here'; return; }
    const { world, solve, report } = data;
    $('board-title').textContent = world.bundleName;
    const pill = $('bundle-pill'); pill.textContent = world.bundle; pill.style.background = accent(world.bundle);
    $('win-banner').classList.remove('show');
    $('map').classList.remove('on'); $('map').textContent = 'show win-map';

    renderer = new Renderer($('board'), world);
    renderer.setSolutionMap(solve.grid, solve.na, solve.np);
    player = new Player(world, renderer, report, {
      onChange: (st) => updateAttempts(st),
      onSolved: (st) => {
        const p = Math.round(st.windU ?? 0), q = Math.round(st.windV ?? 0);
        const wind = (p + q) >= 1 ? ` — winding ${p}× around, ${q}× through` : '';
        $('win-banner').textContent = st.isSolver ? `The solver's shot lands${wind}. ✦` : `Sunk it in ${st.attempts} attempt${st.attempts > 1 ? 's' : ''}${wind}! ✦`;
        $('win-banner').classList.add('show');
      },
    });
    updateAttempts(player.status());
    renderVerdict(world, report);
    $('howto').innerHTML = `<span style="color:var(--faint);font-size:12px;">${BUNDLE_BY_ID[world.bundle]?.blurb || ''} Drag near the ball to aim · drag elsewhere to rotate the world.</span>`;
    writeURL();
  }, 30);
}
function updateAttempts(st) { $('attempts').textContent = `${st.attempts} attempt${st.attempts === 1 ? '' : 's'}`; }

function renderVerdict(w, r) {
  const a = r.answer;
  const p = Math.round(a.windU), q = Math.round(a.windV);
  $('verdict').innerHTML =
    `<div class="verdict-row"><span class="ico ok">✓</span><span>Solvable — at least one launch wins</span></div>` +
    `<div class="verdict-row"><span class="ico ok">✓</span><span>Win-map swept (${(r.winFrac * 100).toFixed(0)}% of launches win)</span></div>` +
    `<div class="verdict-row"><span class="ico">◎</span><span>${r.basins} distinct winning basin${r.basins === 1 ? '' : 's'}</span></div>` +
    `<div class="verdict-row"><span class="ico">∞</span><span>answer winds ${p}× around the ring, ${q}× through</span></div>`;
  $('diff-num').textContent = r.difficulty; $('diff-tier').textContent = r.diffTier;
  $('int-num').textContent = r.interest;
  $('answer-line').innerHTML = `solver's shot: heading <b>${(a.psi * 180 / Math.PI + 360) % 360 | 0}°</b> at power <b>${a.power.toFixed(0)}</b>, ${a.bounces} bounce${a.bounces === 1 ? '' : 's'}`;
  $('descriptor').textContent = r.descriptor;

  const ALL = ['curvature', 'gravity', 'magnet', 'goo', 'bumper'];
  const have = new Set(w.mechanics || []);
  have.add('curvature'); // always on — the surface itself
  $('chips').innerHTML = ALL.map((m) => `<span class="chip ${have.has(m) ? 'on' : ''}">${m}</span>`).join('');

  const order = ['precision', 'winding', 'craft', 'multiplicity', 'patience', 'openness'];
  $('signals').innerHTML = order.map((k) => {
    const v = r.signals[k] ?? 0;
    return `<div class="sig"><span class="name">${k}</span><span class="track"><i style="width:${Math.round(v * 100)}%"></i></span><span class="val">${v.toFixed(2)}</span></div>`;
  }).join('');
}

function randomSeed() { return 1 + Math.floor(Math.random() * 100000); }
function doSurprise() {
  const bundle = $('huntBundle').value || undefined;
  const diff = $('huntDiff').value;
  const want = { minInterest: 62 };
  if (bundle) want.bundle = bundle;
  if (diff === 'hard') want.minDifficulty = 58;
  if (diff === 'easy') want.maxDifficulty = 42;
  $('board-title').textContent = 'hunting…';
  setTimeout(() => {
    const start = randomSeed();
    const found = hunt(start, 30, want) || hunt(start, 30, { bundle });
    if (found) { cache.set(found.n, found); loadWorld(found.n); }
  }, 30);
}

let galleryStart = 1; const GAL = 8; let built = false;
function ensureGallery() { if (!built) { built = true; buildGallery(); } }
async function buildGallery() {
  const host = $('gallery'); host.innerHTML = '<div class="loading">generating worlds & sweeping launches…</div>';
  const bf = $('g-bundle').value, sort = $('g-sort').value;
  const items = [];
  for (let n = galleryStart; n < galleryStart + GAL; n++) {
    await new Promise((r) => setTimeout(r, 0));   // generation is heavy — yield first
    const d = getWorld(n); if (!d) continue;
    if (bf && d.world.bundle !== bf) continue;
    items.push(d);
  }
  if (sort === 'interest') items.sort((a, b) => b.report.interest - a.report.interest);
  else if (sort === 'difficulty') items.sort((a, b) => b.report.difficulty - a.report.difficulty);
  else items.sort((a, b) => a.n - b.n);
  $('g-page').textContent = `pages ${galleryStart}–${galleryStart + GAL - 1}`;
  host.innerHTML = '';
  if (!items.length) { host.innerHTML = '<div class="loading">nothing matches that filter here</div>'; return; }
  for (const d of items) host.appendChild(card(d));
}
function card(d) {
  const { n, world, solve, report } = d;
  const el = document.createElement('div'); el.className = 'card';
  const tw = document.createElement('div'); tw.className = 'thumb';
  const cv = document.createElement('canvas'); tw.appendChild(cv); el.appendChild(tw);
  drawThumb(cv, world, solve, 150);
  const top = document.createElement('div'); top.className = 'meta-top';
  top.innerHTML = `<span class="bp" style="background:${accent(world.bundle)}">${world.bundle}</span><span class="seedno">#${n}</span>`;
  el.appendChild(top);
  const a = report.answer;
  const stats = document.createElement('div'); stats.className = 'cardstats';
  stats.innerHTML = `<span>${report.diffTier} · (${Math.round(a.windU)},${Math.round(a.windV)})</span><span class="istar">✦ ${report.interest}</span>`;
  el.appendChild(stats);
  el.addEventListener('click', () => { loadWorld(n); showTab('play'); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  return el;
}

function buildLegend() {
  $('legend').innerHTML = BUNDLES.map((b) =>
    `<div class="li"><span class="sw" style="background:${b.accent}"></span><span><b style="color:var(--fg)">${b.name}</b> — ${b.blurb}</span></div>`).join('');
}

function init() {
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('go').addEventListener('click', () => loadWorld(Math.max(1, parseInt($('seed').value, 10) || 1)));
  $('seed').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('go').click(); });
  $('prev').addEventListener('click', () => loadWorld(Math.max(1, currentN - 1)));
  $('next').addEventListener('click', () => loadWorld(currentN + 1));
  $('random').addEventListener('click', () => loadWorld(randomSeed()));
  $('surprise').addEventListener('click', doSurprise);
  $('solve').addEventListener('click', () => player?.watchSolver());
  $('reset').addEventListener('click', () => player?.reset());
  $('map').addEventListener('click', () => { const on = player?.toggleMap(); $('map').classList.toggle('on', on); $('map').textContent = on ? 'hide win-map' : 'show win-map'; });
  $('g-prev').addEventListener('click', () => { galleryStart = Math.max(1, galleryStart - GAL); buildGallery(); });
  $('g-next').addEventListener('click', () => { galleryStart += GAL; buildGallery(); });
  $('g-bundle').addEventListener('change', buildGallery);
  $('g-sort').addEventListener('change', buildGallery);
  window.addEventListener('resize', () => { if (renderer && player) { renderer.layout(); player.redraw(); } });
  $('ver').textContent = 'v1 · 5 genres · 3D';
  buildLegend();
  readURL();
  loadWorld(currentN);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
