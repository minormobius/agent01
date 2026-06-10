// Glue: the two-knob navigation (new game vs new puzzle), the genome panel, the
// solver verdict, and an atlas of *games* (one card per genome).
import { gameForSeed, exactGame, genomeForSeed, rankGames, huntGame } from './atlas.js';
import { Renderer, drawThumb } from './render.js';
import { Player } from './play.js';
import { activeRules } from './genome.js';

const $ = (id) => document.getElementById(id);
const cache = new Map();
function getGame(meta, inst) { const key = meta + ':' + (inst ?? 'auto'); if (!cache.has(key)) cache.set(key, inst != null ? exactGame(meta, inst) : gameForSeed(meta)); return cache.get(key); }

let player = null, renderer = null, metaN = 1, instP = null;

function readURL() {
  const p = new URLSearchParams(location.search);
  const n = parseInt(p.get('n'), 10), pp = parseInt(p.get('p'), 10);
  if (Number.isFinite(n) && n > 0) metaN = n;
  if (Number.isFinite(pp) && pp >= 0) instP = pp;
  if (p.get('tab')) showTab(p.get('tab'), false);
}
function writeURL() {
  const p = new URLSearchParams(); p.set('n', metaN); if (instP != null) p.set('p', instP);
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

function load(meta, inst) {
  metaN = meta; $('seed').value = meta;
  $('board-title').textContent = 'rolling…';
  setTimeout(() => {
    const g = getGame(meta, inst);
    if (player) player.destroy();
    if (!g) { $('board-title').textContent = 'this game rolled a dud — try ✦ new game'; return; }
    instP = g.instSeed;
    const aes = g.genome.aesthetic;
    $('board-title').textContent = aes.terms.agent[0].toUpperCase() + aes.terms.agent.slice(1) + ' · ' + g.genome.substrate.id;
    const pill = $('prim-pill'); pill.textContent = g.genome.primary; pill.style.background = `hsl(${aes.hue},60%,50%)`;
    $('win-banner').classList.remove('show');

    renderer = new Renderer($('board'), g.inst);
    player = new Player(g.inst, renderer, {
      solutionPath: g.solve.path, par: g.report.par,
      onChange: (st) => $('moves').textContent = `${st.moves} moves · par ${st.par}`,
      onSolved: (st) => { $('win-banner').textContent = st.beat ? `Solved in ${st.moves} — par! ✦` : `Solved in ${st.moves} (par ${st.par}).`; $('win-banner').classList.add('show'); },
    });
    $('moves').textContent = `0 moves · par ${g.report.par}`;
    buildDirpad(g.inst);
    renderGenome(g.genome);
    renderVerdict(g);
    $('howto').innerHTML = `<span style="color:var(--faint);font-size:12px;">Goal: <b>${goalText(g.genome.goal)}</b>. ${g.inst.sub.dirs === 4 ? 'Arrow keys / WASD or the pad.' : 'Use the direction pad (6-way).'} Dashed borders are wrap seams; ½ marks a twist.</span>`;
    writeURL();
  }, 25);
}

function goalText(goal) {
  return { exit: 'reach the gate', cover: 'push every crate onto a marker', collect: 'gather every token' + (goal.thenExit ? ', then reach the gate' : ''), lights: 'light every tile' }[goal.type];
}

function buildDirpad(inst) {
  const pad = $('dirpad'); pad.innerHTML = '';
  for (let d = 0; d < inst.sub.dirs; d++) {
    const b = document.createElement('button'); b.textContent = inst.sub.dirName(d);
    b.addEventListener('click', () => player?.move(d));
    pad.appendChild(b);
  }
}

function renderGenome(gen) {
  const rules = []; if (gen.moveModel === 'slide') rules.push('slide');
  for (const r of activeRules(gen)) if (!(r === 'ice' && gen.moveModel === 'slide')) rules.push(r);
  const rows = [
    ['topology', `${gen.substrate.id} · ${gen.substrate.W}×${gen.substrate.H}`],
    ['law', rules.length ? rules.join(' + ') : 'pure traversal'],
    ['goal', goalText(gen.goal)],
    ['aesthetic', gen.aesthetic.name],
  ];
  $('genome').innerHTML = rows.map(([k, v]) => `<div class="gx"><span class="gk">${k}</span><span class="gv">${v}</span></div>`).join('');
  $('rich').style.width = Math.round(gen.richness * 100) + '%';
}

function renderVerdict(g) {
  const r = g.report;
  $('verdict').innerHTML =
    `<div class="verdict-row"><span class="ico ok">✓</span><span>Solvable — one BFS oracle, any grammar</span></div>` +
    `<div class="verdict-row"><span class="ico ok">✓</span><span>Optimal answer: par ${r.par}</span></div>` +
    `<div class="verdict-row"><span class="ico">⛁</span><span>${r.nodes.toLocaleString()} states searched${r.seams ? ` · ${r.seams} seam-crossing${r.seams > 1 ? 's' : ''}` : ''}</span></div>`;
  $('diff-num').textContent = r.difficulty; $('diff-tier').textContent = r.diffTier;
  $('int-num').textContent = r.interest; $('descriptor').textContent = r.descriptor;
  const order = ['depth', 'intricacy', 'interplay', 'topology', 'pace'];
  $('signals').innerHTML = order.map((k) => {
    const v = r.signals[k] ?? 0;
    return `<div class="sig"><span class="name">${k}</span><span class="track"><i style="width:${Math.round(v * 100)}%"></i></span><span class="val">${v.toFixed(2)}</span></div>`;
  }).join('');
}

function randomSeed() { return 1 + Math.floor(Math.random() * 100000); }
function doWeird() {
  const want = { minRichness: 0.45, minInterest: 50 };
  const s = $('huntSub').value, p = $('huntPrim').value;
  if (s) want.substrate = s; if (p) want.primary = p;
  $('board-title').textContent = 'hunting a weirder world…';
  setTimeout(() => { const g = huntGame(randomSeed(), 80, want); if (g) { cache.set(g.metaSeed + ':auto', g); load(g.metaSeed); } }, 25);
}

let galleryStart = 1; const GAL = 12; let built = false;
function ensureGallery() { if (!built) { built = true; buildGallery(); } }
async function buildGallery() {
  const host = $('gallery'); host.innerHTML = '<div class="loading">rolling genomes & solving an instance of each…</div>';
  const items = [];
  for (let n = galleryStart; n < galleryStart + GAL; n++) {
    await new Promise((r) => setTimeout(r, 0));
    const g = getGame(n); if (g) items.push(g);
  }
  $('g-page').textContent = `games ${galleryStart}–${galleryStart + GAL - 1}`;
  host.innerHTML = '';
  if (!items.length) { host.innerHTML = '<div class="loading">no games here</div>'; return; }
  for (const g of items) host.appendChild(card(g));
}
function card(g) {
  const el = document.createElement('div'); el.className = 'card';
  const tw = document.createElement('div'); tw.className = 'thumb';
  const cv = document.createElement('canvas'); tw.appendChild(cv); el.appendChild(tw);
  drawThumb(cv, g.inst, 150);
  const top = document.createElement('div'); top.className = 'meta-top';
  top.innerHTML = `<span class="bp" style="background:hsl(${g.genome.aesthetic.hue},60%,50%)">${g.genome.substrate.id}</span><span class="seedno">#${g.metaSeed}</span>`;
  el.appendChild(top);
  const name = document.createElement('div'); name.className = 'cardname'; name.style.fontSize = '13px';
  name.textContent = `${g.genome.aesthetic.name} · ${g.genome.primary}`;
  el.appendChild(name);
  const stats = document.createElement('div'); stats.className = 'cardstats';
  stats.innerHTML = `<span>${g.report.diffTier} · par ${g.report.par}</span><span class="istar">✦ ${g.report.interest}</span>`;
  el.appendChild(stats);
  el.addEventListener('click', () => { load(g.metaSeed); showTab('play'); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  return el;
}

function init() {
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('go').addEventListener('click', () => load(Math.max(1, parseInt($('seed').value, 10) || 1)));
  $('seed').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('go').click(); });
  $('newgame').addEventListener('click', () => load(randomSeed()));
  $('newpuzzle').addEventListener('click', () => { cache.delete(metaN + ':auto'); load(metaN, (instP ?? 0) + 1); });
  $('weird').addEventListener('click', doWeird);
  $('undo').addEventListener('click', () => player?.undo());
  $('reset').addEventListener('click', () => player?.reset());
  $('solve').addEventListener('click', () => player?.watchSolver());
  $('g-prev').addEventListener('click', () => { galleryStart = Math.max(1, galleryStart - GAL); buildGallery(); });
  $('g-next').addEventListener('click', () => { galleryStart += GAL; buildGallery(); });
  window.addEventListener('resize', () => { if (renderer && player) { renderer.layout(); renderer.draw(player.state); } });
  $('ver').textContent = 'v1 · 6 topologies × 4 goals';
  readURL();
  load(metaN, instP);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
