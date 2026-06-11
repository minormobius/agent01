// Glue: the felt table (you vs the certifying bot), tribunal verdict, gallery.
import { gameForSeed, hunt } from './atlas.js';
import { init, legalMoves, apply, scoreline, fmt } from './engine.js';
import { greedyPolicy } from './policies.js';
import { SUIT_GLYPHS } from './genome.js';
import { Rand } from './prng.js';

const $ = (id) => document.getElementById(id);
const cache = new Map();
function getGame(n) { if (!cache.has(n)) cache.set(n, gameForSeed(n)); return cache.get(n); }

let G = null;            // current { genome, report, rules, ... }
let st = null;           // live reducer state
let dealNo = 1, botRand = null, busy = false, spectate = false;

/* ---------- routing/tabs ---------- */
function readURL() { const p = new URLSearchParams(location.search); const n = parseInt(p.get('n'), 10); if (Number.isFinite(n) && n > 0) currentN = n; if (p.get('tab')) showTab(p.get('tab'), false); }
function writeURL() { const p = new URLSearchParams(); p.set('n', currentN); const t = document.querySelector('.tabs button.active')?.dataset.tab; if (t && t !== 'play') p.set('tab', t); history.replaceState(null, '', '?' + p.toString()); }
let currentN = 4;
function showTab(name, push = true) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tabpanel').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + name));
  if (name === 'atlas') ensureGallery();
  if (push) writeURL();
}

/* ---------- load a game ---------- */
function load(n) {
  currentN = n; $('seed').value = n;
  $('board-title').textContent = 'running the tribunal…';
  setTimeout(() => {
    const g = getGame(n);
    if (!g) { $('board-title').textContent = 'no certifiable game at this page'; return; }
    G = g;
    $('board-title').textContent = g.genome.name;
    const pill = $('form-pill'); pill.textContent = g.genome.form; pill.style.background = g.genome.form === 'trick' ? '#7a3b52' : '#2f6f8f';
    renderCert(g.report);
    renderRules(g);
    redeal();
    writeURL();
  }, 25);
}

function redeal() {
  if (!G) return;
  spectate = false;
  st = init(G.genome, 'table::' + currentN + '::' + (dealNo++));
  botRand = new Rand('bot::' + currentN + '::' + dealNo);
  $('win-banner').classList.remove('show');
  renderTable();
  maybeBot();
}

/* ---------- the felt ---------- */
function cardEl(c, { faceUp = true, onClick = null, big = false, disabled = false } = {}) {
  if (!faceUp) { const d = document.createElement('div'); d.className = 'cardb'; return d; }
  const d = document.createElement('div');
  d.className = 'cardf ' + (c.s === 1 || c.s === 2 ? 'red' : 'blk') + (big ? ' big' : '') + (disabled ? ' dis' : '');
  d.innerHTML = `<span class="cr">${c.r}</span><span class="cs">${SUIT_GLYPHS[c.s]}</span>`;
  if (onClick && !disabled) d.addEventListener('click', onClick);
  return d;
}

function renderTable() {
  if (!st) return;
  const g = G.genome;
  // opponent
  const opp = $('opp-row'); opp.innerHTML = '';
  for (let k = 0; k < st.hands[1].length; k++) opp.appendChild(cardEl(null, { faceUp: spectate ? false : false }));
  if (spectate) { opp.innerHTML = ''; for (const c of st.hands[1]) opp.appendChild(cardEl(c, { big: false, disabled: true })); }
  // middle
  const mid = $('mid-row'); mid.innerHTML = '';
  if (g.form === 'trick') {
    if (st.led) { const w = document.createElement('div'); w.innerHTML = '<div class="mid-lab">led</div>'; w.appendChild(cardEl(st.led, { big: true })); mid.appendChild(w); }
    else { const w = document.createElement('div'); w.innerHTML = `<div class="mid-lab">${st.turn === 0 ? 'you lead' : 'bot leads'}</div>`; mid.appendChild(w); }
  } else {
    const top = st.discard[st.discard.length - 1];
    const w1 = document.createElement('div'); w1.innerHTML = '<div class="mid-lab">discard</div>'; w1.appendChild(cardEl(top, { big: true })); mid.appendChild(w1);
    const w2 = document.createElement('div'); w2.className = 'stockpile'; w2.innerHTML = '<div class="mid-lab">stock</div>';
    const back = document.createElement('div'); back.className = 'cardb'; w2.appendChild(back);
    const sc = document.createElement('div'); sc.className = 'scount'; sc.textContent = st.stock.length; w2.appendChild(sc);
    const mustDraw = !st.over && st.turn === 0 && legalMoves(g, st).every((m) => m.type === 'draw');
    if (mustDraw) back.style.outline = '2px solid #d8b35a';
    w2.addEventListener('click', () => { if (mustDraw && !busy && !spectate) humanMove({ type: 'draw' }); });
    mid.appendChild(w2);
  }
  // my hand
  const my = $('my-row'); my.innerHTML = '';
  const legals = st.over ? [] : legalMoves(g, st);
  const legalIdx = new Set(legals.filter((m) => m.type === 'play').map((m) => m.i));
  st.hands[0].forEach((c, i) => {
    const can = !spectate && st.turn === 0 && legalIdx.has(i) && !busy && !st.over;
    my.appendChild(cardEl(c, { onClick: can ? () => humanMove({ type: 'play', i }) : null, disabled: !can && !st.over && st.turn === 0 && !spectate && legalIdx.size > 0 }));
  });
  // scores + status
  const [a, b, unit] = scoreline(g, st);
  $('my-score').textContent = `you: ${a} ${unit}`;
  $('opp-score').textContent = `bot: ${b} ${unit}`;
  $('felt-status').textContent = st.over
    ? (st.winner === -1 ? 'a draw' : st.winner === 0 ? (spectate ? 'bot A wins' : 'you win ✦') : (spectate ? 'bot B wins' : 'the bot wins'))
    : (st.turn === 0 ? (spectate ? 'bot A thinking…' : 'your turn') : (spectate ? 'bot B thinking…' : 'bot is thinking…'));
  $('moves').textContent = `${st.moves} moves`;
  $('dealog').innerHTML = st.log.map((l) => l.replace('P0', spectate ? 'botA' : 'you').replace('P1', spectate ? 'botB' : 'bot')).join('<br>');
  if (st.over) {
    $('win-banner').textContent = st.winner === 0 && !spectate ? `You beat the bot that certified this game. ✦` : st.winner === -1 ? 'A draw.' : (spectate ? 'Exhibition over.' : `The bot takes it — redeal and adjust.`);
    $('win-banner').classList.add('show');
  }
}

function humanMove(mv) {
  if (!st || st.over || st.turn !== 0 || busy) return;
  st = apply(G.genome, st, mv);
  renderTable();
  maybeBot();
}
function maybeBot() {
  if (!st || st.over || busy) return;
  if (st.turn === 1 || (spectate && st.turn === 0)) {
    busy = true;
    setTimeout(() => {
      if (st && !st.over && (st.turn === 1 || spectate)) {
        const mv = greedyPolicy(G.genome, st, botRand);
        st = apply(G.genome, st, mv);
      }
      busy = false;
      renderTable();
      maybeBot();
    }, spectate ? 420 : 650);
  }
}
function botOff() {
  if (!G) return;
  spectate = true;
  st = init(G.genome, 'exhibition::' + currentN + '::' + (dealNo++));
  botRand = new Rand('bot::ex::' + dealNo);
  $('win-banner').classList.remove('show');
  renderTable();
  maybeBot();
}

/* ---------- panels ---------- */
function renderCert(r) {
  $('gates').innerHTML = ['terminates', 'skillful', 'fair'].map((k) => `<span class="gate">✓ ${k}</span>`).join('');
  $('verdict').innerHTML =
    `<div class="verdict-row"><span class="ico ok">✓</span><span>${r.games} tribunal games played before you arrived</span></div>` +
    `<div class="verdict-row"><span class="ico">⚔</span><span>skill edge: smart bot +${Math.round(r.skill * 100)}% over random — decisions matter</span></div>` +
    `<div class="verdict-row"><span class="ico">⚖</span><span>first-seat edge ${Math.round(r.firstEdge * 100)}% · draws ${Math.round(r.drawRate * 100)}% · avg ${r.avgLen} moves</span></div>` +
    `<div class="verdict-row"><span class="ico">↯</span><span>tension: lead changes ${r.tension}×/game · agency ${r.agency} real choices/turn</span></div>`;
  $('diff-num').textContent = r.difficulty; $('diff-tier').textContent = r.diffTier;
  $('int-num').textContent = r.interest;
  const order = ['skill', 'tension', 'agency', 'pace', 'balance'];
  $('signals').innerHTML = order.map((k) => {
    const v = r.signals[k] ?? 0;
    return `<div class="sig"><span class="name">${k}</span><span class="track"><i style="width:${Math.round(v * 100)}%"></i></span><span class="val">${v.toFixed(2)}</span></div>`;
  }).join('');
}
function renderRules(g) {
  $('howto').innerHTML = `<span style="color:var(--faint);font-size:12px;">${g.genome.form === 'trick' ? 'Click a card to lead or answer; the higher card takes the trick.' : 'Click a card to play it onto the discard; click the stock to draw when stuck.'}</span>`;
  $('rules-body').innerHTML =
    `<div class="rrow"><span class="rk">the game</span><span class="rv">${g.rules}</span></div>` +
    `<div class="rrow"><span class="rk">the bot</span><span class="rv">Your opponent is the same heuristic bot that certified this game in the tribunal — objective-aware, search-free. Beatable, not free.</span></div>` +
    `<div class="rrow"><span class="rk">nb</span><span class="rv"><span class="dim">This rulebook was generated from the game's genome — nobody wrote this game, and nobody wrote these rules.</span></span></div>`;
  $('rules').open = false;
}

/* ---------- hunt + gallery ---------- */
function randomSeed() { return 1 + Math.floor(Math.random() * 100000); }
function doSurprise() {
  const want = { minInterest: 55 };
  const f = $('huntForm').value; if (f) want.form = f;
  $('board-title').textContent = 'hunting…';
  setTimeout(() => { const g = hunt(randomSeed(), 40, want); if (g) { cache.set(g.n, g); load(g.n); } }, 25);
}
let galleryStart = 1; const GAL = 12; let built = false;
function ensureGallery() { if (!built) { built = true; buildGallery(); } }
async function buildGallery() {
  const host = $('gallery'); host.innerHTML = '<div class="loading">dealing & running tribunals…</div>';
  const sort = $('g-sort').value;
  const items = [];
  for (let n = galleryStart; n < galleryStart + GAL; n++) {
    await new Promise((r) => setTimeout(r, 0));
    const g = getGame(n); if (g) items.push(g);
  }
  if (sort === 'interest') items.sort((a, b) => b.report.interest - a.report.interest);
  else if (sort === 'difficulty') items.sort((a, b) => b.report.difficulty - a.report.difficulty);
  else items.sort((a, b) => a.n - b.n);
  $('g-page').textContent = `pages ${galleryStart}–${galleryStart + GAL - 1}`;
  host.innerHTML = '';
  for (const g of items) {
    const el = document.createElement('div'); el.className = 'card';
    el.innerHTML = `<div class="meta-top"><span class="bp" style="background:${g.genome.form === 'trick' ? '#7a3b52' : '#2f6f8f'}">${g.genome.form}</span><span class="seedno">#${g.n}</span></div>
      <div class="cardname" style="margin:6px 0 4px;">${g.genome.name}</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.45;">${g.genome.suits} suits × ${g.genome.ranks} ranks · skill +${Math.round(g.report.skill * 100)}% · ${g.report.avgLen} moves</div>
      <div class="cardstats" style="margin-top:8px;"><span>${g.report.diffTier}</span><span class="istar">✦ ${g.report.interest}</span></div>`;
    el.addEventListener('click', () => { load(g.n); showTab('play'); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    host.appendChild(el);
  }
}

function init2() {
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('go').addEventListener('click', () => load(Math.max(1, parseInt($('seed').value, 10) || 1)));
  $('seed').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('go').click(); });
  $('prev').addEventListener('click', () => load(Math.max(1, currentN - 1)));
  $('next').addEventListener('click', () => load(currentN + 1));
  $('random').addEventListener('click', () => load(randomSeed()));
  $('surprise').addEventListener('click', doSurprise);
  $('redeal').addEventListener('click', redeal);
  $('botoff').addEventListener('click', botOff);
  $('g-prev').addEventListener('click', () => { galleryStart = Math.max(1, galleryStart - GAL); buildGallery(); });
  $('g-next').addEventListener('click', () => { galleryStart += GAL; buildGallery(); });
  $('g-sort').addEventListener('change', buildGallery);
  $('ver').textContent = 'v1 · the tribunal';
  readURL();
  load(currentN);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init2);
else init2();
