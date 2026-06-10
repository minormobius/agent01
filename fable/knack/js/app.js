// Glue: routing, controls, the canvas board, the solver-verdict panel, gallery.
import { levelForSeed, hunt } from './atlas.js';
import { Renderer, drawThumb } from './render.js';
import { Player } from './play.js';
import { BUNDLE_BY_ID, BUNDLES } from './bundles.js';

const $ = (id) => document.getElementById(id);
const accent = (b) => (BUNDLE_BY_ID[b] ? BUNDLE_BY_ID[b].accent : 'var(--accent)');

const cache = new Map();
function getLevel(n) { if (!cache.has(n)) cache.set(n, levelForSeed(n)); return cache.get(n); }

let player = null, renderer = null, currentN = 1;

/* routing */
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

/* play */
function loadLevel(n) {
  currentN = n; $('seed').value = n;
  const data = getLevel(n);
  if (player) player.destroy();
  if (!data) { $('board-title').textContent = 'no level here'; return; }
  const { level, report } = data;
  $('board-title').textContent = `${level.bundleName} · ${level.W}×${level.H}`;
  const pill = $('bundle-pill'); pill.textContent = level.bundle; pill.style.background = accent(level.bundle);
  $('win-banner').classList.remove('show');

  renderer = new Renderer($('board'), level);
  player = new Player(level, renderer, {
    solutionPath: data.solve.path, par: report.par,
    onChange: (st) => updateMoves(st),
    onSolved: (st) => { $('win-banner').textContent = st.beat ? `Solved in ${st.moves} — you matched par (${st.par})! ✦` : `Solved in ${st.moves} moves. Par is ${st.par}.`; $('win-banner').classList.add('show'); },
  });
  updateMoves(player.status());
  renderVerdict(level, report, data.solve);
  renderHowto(level);
  renderRules(level, data.solve);
  writeURL();
}
function updateMoves(st) { $('moves').textContent = `${st.moves} moves · par ${st.par}`; }

function renderHowto(level) {
  $('howto').innerHTML = `<span style="color:var(--faint);font-size:12px;">${BUNDLE_BY_ID[level.bundle]?.blurb || ''}</span>`;
}

function renderVerdict(level, r, sr) {
  const row = (ok, t) => `<div class="verdict-row"><span class="ico ${ok ? 'ok' : ''}">${ok ? '✓' : '·'}</span><span>${t}</span></div>`;
  $('verdict').innerHTML =
    row(true, 'Solvable — a goal state is reachable') +
    row(true, `Optimal answer found: par ${r.par}`) +
    `<div class="verdict-row"><span class="ico">⛁</span><span>${r.nodes.toLocaleString()} states searched · ${sr?.algo === 'astar' ? 'A* heuristic oracle' : 'BFS oracle'}</span></div>`;
  $('diff-num').textContent = r.difficulty; $('diff-tier').textContent = r.diffTier;
  $('int-num').textContent = r.interest; $('descriptor').textContent = r.descriptor;

  const ALL = ['box', 'ice', 'key', 'door', 'gate', 'button', 'pit', 'arrow', 'coin'];
  const used = new Set(r.used);
  $('chips').innerHTML = ALL.filter((m) => level.mechanics.includes(m) || used.has(m))
    .map((m) => `<span class="chip ${used.has(m) ? 'on' : ''}">${m}</span>`).join('') || '<span class="chip">—</span>';

  const order = ['depth', 'intricacy', 'interplay', 'winding', 'economy', 'texture'];
  $('signals').innerHTML = order.map((k) => {
    const v = r.signals[k] ?? 0;
    return `<div class="sig"><span class="name">${k}</span><span class="track"><i style="width:${Math.round(v * 100)}%"></i></span><span class="val">${v.toFixed(2)}</span></div>`;
  }).join('');
}

/* hunting */
function randomSeed() { return 1 + Math.floor(Math.random() * 100000); }
function doSurprise() {
  const bundle = $('huntBundle').value || undefined;
  const diff = $('huntDiff').value;
  const want = { minInterest: 70 };
  if (bundle) want.bundle = bundle;
  if (diff === 'hard') want.minDifficulty = 58;
  if (diff === 'easy') want.maxDifficulty = 34;
  const start = randomSeed();
  const found = hunt(start, 160, want) || hunt(start, 160, { bundle });
  if (found) { cache.set(found.n, found); loadLevel(found.n); }
}

/* gallery */
let galleryStart = 1; const GAL = 24; let built = false;
function ensureGallery() { if (!built) { built = true; buildGallery(); } }
async function buildGallery() {
  const host = $('gallery'); host.innerHTML = '<div class="loading">generating & solving…</div>';
  const bundleFilter = $('g-bundle').value, sort = $('g-sort').value;
  const items = [];
  for (let n = galleryStart; n < galleryStart + GAL; n++) {
    const d = getLevel(n); if (!d) continue;
    if (bundleFilter && d.level.bundle !== bundleFilter) continue;
    items.push(d);
    if ((n - galleryStart) % 4 === 3) await new Promise((r) => setTimeout(r, 0));
  }
  if (sort === 'interest') items.sort((a, b) => b.report.interest - a.report.interest);
  else if (sort === 'difficulty') items.sort((a, b) => b.report.difficulty - a.report.difficulty);
  else items.sort((a, b) => a.n - b.n);
  $('g-page').textContent = `pages ${galleryStart}–${galleryStart + GAL - 1}`;
  host.innerHTML = '';
  if (!items.length) { host.innerHTML = '<div class="loading">nothing matches that filter on this page</div>'; return; }
  for (const d of items) host.appendChild(card(d));
}
function card(d) {
  const { n, level, report } = d;
  const el = document.createElement('div'); el.className = 'card';
  const tw = document.createElement('div'); tw.className = 'thumb';
  const cv = document.createElement('canvas'); tw.appendChild(cv); el.appendChild(tw);
  drawThumb(cv, level, 150);
  const top = document.createElement('div'); top.className = 'meta-top';
  top.innerHTML = `<span class="bp" style="background:${accent(level.bundle)}">${level.bundle}</span><span class="seedno">#${n}</span>`;
  el.appendChild(top);
  const stats = document.createElement('div'); stats.className = 'cardstats';
  stats.innerHTML = `<span>${report.diffTier} · par ${report.par}</span><span class="istar">✦ ${report.interest}</span>`;
  el.appendChild(stats);
  el.addEventListener('click', () => { loadLevel(n); showTab('play'); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  return el;
}

/* legend in about */
function buildLegend() {
  $('legend').innerHTML = BUNDLES.map((b) =>
    `<div class="li"><span class="sw" style="background:${b.accent}"></span><span><b style="color:var(--fg)">${b.name}</b> — ${b.blurb}</span></div>`).join('');
}

/* wire up */
function init() {
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('go').addEventListener('click', () => loadLevel(Math.max(1, parseInt($('seed').value, 10) || 1)));
  $('seed').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('go').click(); });
  $('prev').addEventListener('click', () => loadLevel(Math.max(1, currentN - 1)));
  $('next').addEventListener('click', () => loadLevel(currentN + 1));
  $('random').addEventListener('click', () => loadLevel(randomSeed()));
  $('surprise').addEventListener('click', doSurprise);
  $('undo').addEventListener('click', () => player?.undo());
  $('reset').addEventListener('click', () => player?.reset());
  $('solve').addEventListener('click', () => player?.playSolution());
  document.querySelectorAll('.dpad button').forEach((b) => b.addEventListener('click', () => player?.move(+b.dataset.d)));
  $('g-prev').addEventListener('click', () => { galleryStart = Math.max(1, galleryStart - GAL); buildGallery(); });
  $('g-next').addEventListener('click', () => { galleryStart += GAL; buildGallery(); });
  $('g-bundle').addEventListener('change', buildGallery);
  $('g-sort').addEventListener('change', buildGallery);
  window.addEventListener('resize', () => { if (renderer && player) { renderer.layout(); renderer.draw(player.state); } });
  $('ver').textContent = 'v1 · 6 genres';
  buildLegend();
  readURL();
  loadLevel(currentN);
}
/* fold-out rules — assembled from the level's actual mechanics */
const MECH_RULES = {
  box: '<b>Crates</b> push one cell when you walk into them — never pull, never two at once. A crate shoved into a corner is stuck for ever.',
  ice: '<b>Ice</b> carries you: step on and you slide in that direction until a wall or crate stops you.',
  key: '<b>Keys</b> are picked up by walking over them.',
  door: '<b>Doors</b> block you until you hold the key of their color.',
  button: '<b>Buttons</b> count as pressed while you or a crate stands on them.',
  gate: '<b>Gates</b> are open only while their button is held down — step off and they close behind you.',
  pit: '<b>Pits</b> block you, but a crate pushed in fills one into walkable floor (the crate is spent).',
  arrow: '<b>One-way tiles</b> can only be entered moving the way the arrow points.',
  coin: '<b>Coins</b> are collected by walking over them.',
};
const GOAL_TEXT = (level) => {
  const g = level.win || {};
  const parts = [];
  if (g.boxesOnTargets) parts.push('push every crate onto a diamond marker');
  if (g.coinsCollected) parts.push('collect every coin');
  if (g.atExit) parts.push('reach the glowing exit');
  return parts.join(', then ') + '.';
};
function renderRules(level, sr) {
  const mechs = (level.mechanics || []).map((m) => MECH_RULES[m]).filter(Boolean);
  $('rules-body').innerHTML =
    `<div class="rrow"><span class="rk">goal</span><span class="rv">${GOAL_TEXT(level).replace(/^./, c=>c.toUpperCase())}</span></div>` +
    `<div class="rrow"><span class="rk">mechanics</span><span class="rv">${mechs.join('<br>') || '<span class="dim">pure movement</span>'}</span></div>` +
    `<div class="rrow"><span class="rk">controls</span><span class="rv">Arrow keys / WASD, swipe, or the pad. <b>Undo</b> takes a move back (it still counts).</span></div>` +
    `<div class="rrow"><span class="rk">the answer</span><span class="rv">The ${sr?.algo === 'astar' ? 'A* heuristic' : 'BFS'} oracle proved this level solvable at optimal <b>par</b> (shown above the board) — match it if you can. <span class="dim">"Watch the engine" replays the oracle's exact route.</span></span></div>`;
  $('rules').open = false;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

