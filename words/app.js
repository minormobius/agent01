// words — the client.
//
// ONE ENGINE, TWO MODES. The browser imports the same rules engine the server
// runs, which buys three things worth the download:
//
//   * the score of the play you are building updates as you place tiles, and it
//     is the REAL score, computed by the same function that will bank it;
//   * an illegal play is refused here, with the reason, before it costs a round
//     trip;
//   * an offline game against bots is not a cut-down version — it is the same
//     game, played entirely in this tab, which is what makes the PWA worth
//     installing.
//
// Online games still resolve on the server. The client's copy of the rules is
// a courtesy to the player, never an authority: hidden information (the bag,
// other racks) is not here to be leaked, and every online move is re-validated
// server-side against the state the server holds.

import { Dawg } from './engine/dawg.js';
import {
  SIZE, SQ, SQ_BADGE, LAYOUTS, LAYOUT_IDS, DEFAULT_LAYOUT, squares,
} from './engine/board.js';
import { validatePlay, scorePlay } from './engine/rules.js';
import { tileValue, BLANK, RACK_SIZE } from './engine/tiles.js';
import {
  newGame, applyPlay, applyPass, applyExchange, applyResign, redact, botToMove, MAX_SEATS,
} from './engine/game.js';
import { takeTurn, topMoves } from './engine/ai.js';
import { rngFrom, makeCode } from './engine/rng.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

// ------------------------------------------------------------- storage ----
// Online games keep a token; offline games keep the whole state. Both are
// listed under one key so "your games" is a single read.

const LS = {
  index: 'words:index',
  local: (code) => `words:local:${code}`,
  token: (code) => `words:token:${code}`,
  name: 'words:name',
};
const readIndex = () => { try { return JSON.parse(localStorage.getItem(LS.index)) || []; } catch { return []; } };
function noteGame(entry) {
  const list = readIndex().filter((g) => g.code !== entry.code);
  list.unshift({ ...entry, updated: Date.now() });
  localStorage.setItem(LS.index, JSON.stringify(list.slice(0, 24)));
}
function forgetGame(code) {
  localStorage.setItem(LS.index, JSON.stringify(readIndex().filter((g) => g.code !== code)));
  localStorage.removeItem(LS.local(code));
  localStorage.removeItem(LS.token(code));
}

// ---------------------------------------------------------------- state ----

let dawg = null;
let dawgError = null;
/** { mode, code, token, seat, view, state? } — `state` only exists offline. */
let S = null;
let pending = new Map();   // board index -> { letter, blank, from }
let selected = null;       // rack index
let swapping = null;       // Set<rack index>, or null when not swapping
let draft = { layout: DEFAULT_LAYOUT, seats: [{ kind: 'human' }, { kind: 'bot', level: 'steady' }] };

async function loadDawg() {
  if (dawg || dawgError) return dawg;
  try {
    const res = await fetch('/dict/lexicon.dawg', { cache: 'force-cache' });
    if (!res.ok) throw new Error(`lexicon ${res.status}`);
    dawg = new Dawg(new Uint8Array(await res.arrayBuffer()));
    $('lexNote').insertAdjacentText('afterbegin', `${dawg.wordCount.toLocaleString()} words. `);
  } catch (e) {
    dawgError = e;
    toast('could not load the lexicon — offline play is unavailable', true);
  }
  return dawg;
}

function toast(msg, bad = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast${bad ? ' bad' : ''}`;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 3200);
}

// ------------------------------------------------------------- home UI ----

const SQ_CLASS = {
  [SQ.DL]: 'dl', [SQ.TL]: 'tl', [SQ.QL]: 'ql', [SQ.DW]: 'dw', [SQ.TW]: 'tw',
  [SQ.MIRE]: 'mire', [SQ.HALF]: 'half', [SQ.TOLL]: 'toll', [SQ.STONE]: 'stone',
  [SQ.START]: 'start',
};

const LEGEND = [
  [SQ.DL, 'Double letter', 'The letter counts twice.'],
  [SQ.TL, 'Triple letter', 'Three times.'],
  [SQ.QL, 'Quad letter', 'Four times — the only square that makes crossing the board for a Z worth it. It sits deep in hazard country.'],
  [SQ.DW, 'Double word', 'The whole word counts twice.'],
  [SQ.TW, 'Triple word', 'Three times.'],
  [SQ.MIRE, 'Mire', 'A letter here scores nothing at all. Word multipliers still apply — a mire is where you dump a U, and where you never want to be forced to put an X.'],
  [SQ.HALF, 'Half', 'The word through it is halved, rounded down, after every multiplier. Two of them quarter it. A bingo laid through a half is half a bingo.'],
  [SQ.TOLL, 'Toll', 'A flat 8 points off the play — not the word. It barely dents a big play and it wipes out a filler one. A play is never taxed below zero.'],
  [SQ.STONE, 'Stone', 'Nothing can ever be placed here, and words break on it exactly as they break on the edge of the board. Only the Archipelago has them.'],
];

function renderLegend() {
  const ul = $('legend');
  ul.replaceChildren(...LEGEND.map(([kind, name, text]) => {
    const li = el('li');
    const chip = el('div', `chip ${SQ_CLASS[kind]}`, SQ_BADGE[kind] || '');
    const body = el('div');
    body.append(el('b', null, name), el('span', null, text));
    li.append(chip, body);
    return li;
  }));
}

function renderLayoutPick() {
  const wrap = $('layoutPick');
  wrap.replaceChildren(...LAYOUT_IDS.map((id) => {
    const b = el('button', draft.layout === id ? 'on' : '', LAYOUTS[id].name);
    b.type = 'button';
    b.onclick = () => { draft.layout = id; renderLayoutPick(); };
    return b;
  }));
  $('layoutBlurb').textContent = LAYOUTS[draft.layout].blurb;
}

function renderSeatPick() {
  const wrap = $('seatPick');
  wrap.replaceChildren(...draft.seats.map((s, i) => {
    const row = el('div', 'seat');
    row.append(el('span', 'n', `${i + 1}`));

    const kind = el('select');
    for (const [v, label] of [['human', 'a person'], ['bot', 'a bot']]) {
      const o = el('option', null, label); o.value = v; kind.append(o);
    }
    kind.value = s.kind;
    kind.onchange = () => {
      s.kind = kind.value;
      if (s.kind === 'bot' && !s.level) s.level = 'steady';
      renderSeatPick();
    };
    row.append(kind);

    if (s.kind === 'bot') {
      const lvl = el('select');
      for (const [v, label] of [['mild', 'mild'], ['steady', 'steady'], ['sharp', 'sharp']]) {
        const o = el('option', null, label); o.value = v; lvl.append(o);
      }
      lvl.value = s.level || 'steady';
      lvl.onchange = () => { s.level = lvl.value; };
      row.append(lvl);
    } else {
      row.append(el('span', 'tag', i === 0 ? 'you' : 'invited'));
    }
    return row;
  }));
  $('addSeat').disabled = draft.seats.length >= MAX_SEATS;
  $('dropSeat').disabled = draft.seats.length <= 1;
  const humans = draft.seats.filter((s) => s.kind === 'human').length;
  $('startNote').textContent = humans > 1
    ? 'More than one person: online gives everyone a link and their own device; offline passes one device around the table.'
    : 'Against bots only — this runs in your browser whether you start it online or off.';
}

function renderResume() {
  const list = readIndex();
  $('resume').hidden = list.length === 0;
  $('resumeList').replaceChildren(...list.map((g) => {
    const li = el('li');
    const left = el('div');
    left.append(el('b', null, g.code), el('div', 'who', `${g.mode === 'local' ? 'offline' : 'online'} · ${LAYOUTS[g.layout]?.name || g.layout}`));
    const open = el('button', 'ghost', 'open'); open.type = 'button';
    open.onclick = () => (g.mode === 'local' ? openLocal(g.code) : openOnline(g.code));
    const drop = el('button', 'ghost', '×'); drop.type = 'button';
    drop.onclick = () => { forgetGame(g.code); renderResume(); };
    li.append(left, el('span', '', ''), open, drop);
    return li;
  }));
}

// ------------------------------------------------------------ game view ----

function showView(which) {
  $('home').hidden = which !== 'home';
  $('game').hidden = which !== 'game';
  window.scrollTo(0, 0);
}

/** The seat this device is playing right now (offline hotseat: whoever's turn). */
function mySeat() {
  if (!S) return null;
  if (S.mode === 'local') {
    const seat = S.state.seats[S.state.turn];
    return seat && seat.kind === 'human' ? seat.seat : null;
  }
  return S.seat;
}

function refreshView() {
  if (S.mode === 'local') {
    S.view = { code: S.code, ...redact(S.state, mySeat()) };
  }
  render();
}

function render() {
  const v = S.view;
  const seat = mySeat();
  const myTurn = v.status === 'active' && seat !== null && v.turn === seat;

  // --- scores ---
  $('scores').replaceChildren(...v.seats.map((s) => {
    const row = el('div', `pl${v.turn === s.seat && v.status === 'active' ? ' turn' : ''}${s.resigned ? ' out' : ''}`);
    const name = el('div', 'nm', s.name + (s.seat === S.seat && S.mode === 'online' ? ' (you)' : ''));
    row.append(name, el('span', 'tag', s.kind === 'bot' ? s.level : `${s.tiles} tiles`), el('span', 'sc', String(s.score)));
    return row;
  }));

  // --- banner ---
  const banner = $('banner');
  if (v.status === 'done') {
    const names = v.ended.winners.map((w) => v.seats[w].name).join(' and ');
    banner.textContent = `${v.ended.winners.length > 1 ? 'Tied:' : 'Winner:'} ${names} — ${v.ended.reason}.`;
    banner.className = 'banner done';
    banner.hidden = false;
  } else if (myTurn) {
    banner.hidden = true;
  } else {
    const who = v.seats[v.turn];
    banner.textContent = seat === null
      ? `Watching. ${who.name} to play.`
      : `${who.name} to play — ${who.kind === 'bot' ? 'thinking' : 'come back when they have moved'}.`;
    banner.className = 'banner';
    banner.hidden = false;
  }

  renderBoard(v);
  renderRack(v, myTurn);
  renderPending(v);
  renderLog(v);

  const busy = !myTurn;
  $('playBtn').disabled = busy || (swapping ? true : pending.size === 0);
  $('recallBtn').disabled = pending.size === 0 && !swapping;
  $('shuffleBtn').disabled = !v.rack.length;
  $('hintBtn').disabled = busy || !dawg;
  $('swapBtn').disabled = busy || v.bagCount < RACK_SIZE;
  $('passBtn').disabled = busy;
  $('resignBtn').disabled = v.status !== 'active' || seat === null;
  $('playBtn').textContent = swapping ? 'Confirm swap' : 'Play';

  // --- invite ---
  const openSeats = v.seats.filter((s) => s.kind === 'human' && !s.joined).length;
  $('shareRow').hidden = !(S.mode === 'online' && openSeats > 0);
  if (S.mode === 'online') $('shareLink').value = `${location.origin}/?g=${S.code}`;

  $('topNote').textContent = `${S.code} · ${LAYOUTS[v.layout]?.name || v.layout} · bag ${v.bagCount}`;
}

function renderBoard(v) {
  const sq = squares(v.layout);
  const board = $('board');
  if (board.childElementCount !== SIZE * SIZE) {
    board.replaceChildren(...Array.from({ length: SIZE * SIZE }, (_, i) => {
      const d = el('div', 'sq');
      d.dataset.i = i;
      d.onclick = () => onSquare(i);
      return d;
    }));
  }
  const last = v.history.filter((h) => h.kind === 'play').at(-1);
  const lastCells = new Set(last ? last.placements.map((p) => p.i) : []);

  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = board.children[i];
    const kind = sq[i];
    const on = pending.has(i);
    cell.className = `sq ${SQ_CLASS[kind] || ''}${lastCells.has(i) && !on ? ' lastplay' : ''}${selected !== null && !v.board[i] && !on && kind !== SQ.STONE ? ' target' : ''}`;
    const tile = v.board[i] || (on ? { l: pending.get(i).letter, b: pending.get(i).blank } : null);
    if (!tile) {
      cell.replaceChildren(document.createTextNode(SQ_BADGE[kind] || ''));
      continue;
    }
    const t = el('div', `tile${on ? ' pending' : ''}${tile.b ? ' blank' : ''}`, tile.l);
    if (!tile.b) t.append(el('span', 'v', String(tileValue(tile.l))));
    cell.replaceChildren(t);
  }
}

function renderRack(v, myTurn) {
  const rack = $('rack');
  const used = new Map();
  for (const p of pending.values()) used.set(p.from, true);

  rack.replaceChildren(...Array.from({ length: RACK_SIZE }, (_, k) => {
    const tile = v.rack[k];
    if (tile === undefined) return el('div', 'rt empty');
    const d = el('div', `rt${selected === k ? ' sel' : ''}${used.has(k) ? ' used' : ''}${swapping?.has(k) ? ' swap' : ''}`,
      tile === BLANK ? '?' : tile);
    if (tile !== BLANK) d.append(el('span', 'v', String(tileValue(tile))));
    d.onclick = () => onRack(k, myTurn);
    return d;
  }));
}

/** The live score of the play being built — the real scorer, not an estimate. */
function renderPending(v) {
  const box = $('pending');
  if (swapping) {
    box.hidden = false;
    box.className = 'pending';
    box.replaceChildren(el('span', null, swapping.size
      ? `Throwing back ${swapping.size} tile${swapping.size > 1 ? 's' : ''} — pick more, or confirm.`
      : 'Tap the tiles you want to throw back.'));
    return;
  }
  if (!pending.size) { box.hidden = true; return; }
  box.hidden = false;

  const placements = [...pending.entries()].map(([i, p]) => ({ i, letter: p.letter, blank: p.blank }));
  const check = validatePlay({ board: v.board, layout: v.layout }, placements, dawg || null);
  if (!check.ok) {
    box.className = 'pending bad';
    box.replaceChildren(el('span', null, check.error));
    return;
  }
  const s = scorePlay({ board: v.board, layout: v.layout }, placements);
  const bits = [s.words.map((w) => w.word).join(' · ')];
  if (s.bingo) bits.push('all seven — bingo');
  if (s.toll) bits.push(`toll −${s.toll}`);
  box.className = 'pending ok';
  box.replaceChildren(el('span', null, bits.join(' · ')), el('span', 'pts', String(s.score)));
}

function renderLog(v) {
  const log = $('log');
  log.replaceChildren(...[...v.history].reverse().map((h) => {
    const li = el('li');
    const who = v.seats[h.seat]?.name || `seat ${h.seat + 1}`;
    let what = '';
    if (h.kind === 'play') what = h.words.join(', ');
    else if (h.kind === 'pass') what = 'passed';
    else if (h.kind === 'exchange') what = `swapped ${h.count} tile${h.count > 1 ? 's' : ''}`;
    else if (h.kind === 'resign') what = 'resigned';
    const mid = el('div');
    mid.append(el('span', null, what));
    if (h.kind === 'play' && (h.toll || h.bingo)) {
      mid.append(el('div', 'note', [h.bingo ? 'bingo +40' : null, h.toll ? `toll −${h.toll}` : null].filter(Boolean).join(' · ')));
    }
    li.append(el('span', 'who', who), mid, el('span', 'pts', h.kind === 'play' ? String(h.score) : ''));
    return li;
  }));
}

// ---------------------------------------------------------- interaction ----

function onRack(k, myTurn) {
  if (!myTurn) return;
  if (swapping) {
    if (swapping.has(k)) swapping.delete(k); else swapping.add(k);
    render();
    return;
  }
  if ([...pending.values()].some((p) => p.from === k)) return;  // already on the board
  selected = selected === k ? null : k;
  render();
}

function onSquare(i) {
  const v = S.view;
  const seat = mySeat();
  if (v.status !== 'active' || seat === null || v.turn !== seat || swapping) return;

  if (pending.has(i)) { pending.delete(i); selected = null; render(); return; }
  if (v.board[i] || squares(v.layout)[i] === SQ.STONE) return;
  if (selected === null) return;

  const tile = v.rack[selected];
  if (tile === BLANK) {
    askLetter((letter) => {
      if (!letter) return;
      pending.set(i, { letter, blank: true, from: selected });
      selected = null;
      render();
    });
    return;
  }
  pending.set(i, { letter: tile, blank: false, from: selected });
  selected = null;
  render();
}

function askLetter(done) {
  const body = $('modalBody');
  body.replaceChildren();
  const grid = el('div', 'letters');
  let chosen = null;
  for (let c = 0; c < 26; c++) {
    const ch = String.fromCharCode(65 + c);
    const b = el('button', 'ghost', ch);
    b.type = 'button';
    b.onclick = () => {
      chosen = ch;
      [...grid.children].forEach((n) => n.classList.remove('on'));
      b.classList.add('on');
    };
    grid.append(b);
  }
  body.append(grid);
  openModal('What is the blank?', () => done(chosen), () => done(null));
}

function openModal(title, ok, cancel) {
  $('modalTitle').textContent = title;
  $('modal').hidden = false;
  $('modalOk').onclick = () => { $('modal').hidden = true; ok(); };
  $('modalCancel').onclick = () => { $('modal').hidden = true; if (cancel) cancel(); };
}

function recall() {
  pending.clear();
  selected = null;
  swapping = null;
  render();
}

// ------------------------------------------------------------- the moves --

async function submitMove(body) {
  if (S.mode === 'local') return localMove(body);
  const res = await fetch(`/api/games/${S.code}/move`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, token: S.token, version: S.view.version }),
  });
  const data = await res.json().catch(() => ({ error: 'bad response' }));
  if (!res.ok) {
    if (data.stale) { S.view = data; recall(); toast('somebody moved first — have another look', true); return; }
    toast(data.error || 'that move was refused', true);
    return;
  }
  S.view = data;
  noteGame({ code: S.code, mode: 'online', layout: data.layout });
  recall();
}

function localMove(body) {
  const seat = mySeat();
  if (seat === null) return;
  let res;
  if (body.kind === 'play') res = applyPlay(S.state, seat, body.placements, dawg);
  else if (body.kind === 'pass') res = applyPass(S.state, seat);
  else if (body.kind === 'exchange') res = applyExchange(S.state, seat, body.tiles);
  else if (body.kind === 'resign') res = applyResign(S.state, seat);
  if (!res?.ok) { toast(res?.error || 'that move was refused', true); return; }

  let guard = 0;
  while (botToMove(S.state) && guard++ < 12) takeTurn(S.state, S.state.turn, dawg);

  saveLocal();
  recall();
  refreshView();
}

function saveLocal() {
  localStorage.setItem(LS.local(S.code), JSON.stringify(S.state));
  noteGame({ code: S.code, mode: 'local', layout: S.state.layout });
}

async function doPlay() {
  if (swapping) {
    const tiles = [...swapping].map((k) => S.view.rack[k]);
    swapping = null;
    if (!tiles.length) { render(); return; }
    await submitMove({ kind: 'exchange', tiles });
    if (S.mode === 'online') render();
    return;
  }
  const placements = [...pending.entries()].map(([i, p]) => ({ i, letter: p.letter, blank: p.blank }));
  if (!placements.length) return;
  const check = validatePlay({ board: S.view.board, layout: S.view.layout }, placements, dawg || null);
  if (!check.ok) { toast(check.error, true); return; }
  await submitMove({ kind: 'play', placements });
  if (S.mode === 'online') render();
}

async function doHint() {
  if (!dawg) { toast('the lexicon is still loading', true); return; }
  const v = S.view;
  const hints = topMoves({ board: v.board, layout: v.layout }, v.rack, dawg, 5);
  if (!hints.length) { toast('nothing playable — swap or pass'); return; }
  const body = $('modalBody');
  body.replaceChildren(...hints.map((h) => {
    const b = el('button', 'ghost', `${h.word} — ${h.score}`);
    b.type = 'button';
    b.style.width = '100%';
    b.style.marginBottom = '6px';
    b.onclick = () => {
      pending.clear();
      const rack = [...v.rack];
      for (const p of h.placements) {
        const want = p.blank ? BLANK : p.letter;
        const from = rack.indexOf(want);
        if (from !== -1) { rack[from] = null; pending.set(p.i, { letter: p.letter, blank: p.blank, from }); }
      }
      $('modal').hidden = true;
      selected = null;
      render();
    };
    return b;
  }));
  openModal('Best plays from your rack', () => {}, () => {});
}

// --------------------------------------------------------------- sessions --

async function startLocal() {
  if (!(await loadDawg())) { toast('the lexicon is needed for offline play', true); return; }
  const name = $('myName').value.trim() || 'You';
  localStorage.setItem(LS.name, name);
  const seed = crypto.randomUUID();
  const code = makeCode(rngFrom(seed), 5);
  const seats = draft.seats.map((s, i) => ({
    kind: s.kind, level: s.level,
    name: s.kind === 'bot' ? `${s.level} bot` : (i === 0 ? name : `Player ${i + 1}`),
  }));
  const state = newGame({ seed, layout: draft.layout, seats });
  let guard = 0;
  while (botToMove(state) && guard++ < 12) takeTurn(state, state.turn, dawg);

  S = { mode: 'local', code, state, seat: null };
  saveLocal();
  refreshView();
  showView('game');
}

async function startOnline() {
  const name = $('myName').value.trim() || 'You';
  localStorage.setItem(LS.name, name);
  if (!draft.seats.some((s) => s.kind === 'human')) { toast('somebody has to play', true); return; }
  // Only the creator's seat is named here; the rest are named by whoever takes
  // them, and bots are named by the server from their level.
  const firstHuman = draft.seats.findIndex((s) => s.kind === 'human');
  const seats = draft.seats.map((s, i) => ({
    kind: s.kind,
    level: s.level,
    ...(i === firstHuman ? { name } : {}),
  }));
  const res = await fetch('/api/games', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ layout: draft.layout, seats }),
  });
  const data = await res.json().catch(() => ({ error: 'bad response' }));
  if (!res.ok) { toast(data.error || 'could not start a game', true); return; }
  localStorage.setItem(LS.token(data.code), data.token);
  S = { mode: 'online', code: data.code, token: data.token, seat: data.seat, view: data };
  noteGame({ code: data.code, mode: 'online', layout: data.layout });
  history.replaceState(null, '', `/?g=${data.code}`);
  render();
  showView('game');
  poll();
}

async function openOnline(code, tokenOverride) {
  const token = tokenOverride || localStorage.getItem(LS.token(code)) || '';
  const res = await fetch(`/api/games/${code}?token=${encodeURIComponent(token)}`);
  const data = await res.json().catch(() => ({ error: 'bad response' }));
  if (!res.ok) { toast(data.error || 'no such game', true); return; }
  S = { mode: 'online', code, token, seat: data.you, view: data };
  if (data.you === null && !token) {
    // Not a player yet: take a seat if one is free, otherwise watch.
    const join = await fetch(`/api/games/${code}/join`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: localStorage.getItem(LS.name) || 'Player' }),
    });
    if (join.ok) {
      const jd = await join.json();
      localStorage.setItem(LS.token(code), jd.token);
      S = { mode: 'online', code, token: jd.token, seat: jd.seat, view: jd };
    } else {
      toast('every seat is taken — watching');
    }
  }
  noteGame({ code, mode: 'online', layout: S.view.layout });
  history.replaceState(null, '', `/?g=${code}`);
  render();
  showView('game');
  poll();
}

async function openLocal(code) {
  if (!(await loadDawg())) { toast('the lexicon is needed for offline play', true); return; }
  const raw = localStorage.getItem(LS.local(code));
  if (!raw) { toast('that game is not on this device', true); return; }
  S = { mode: 'local', code, state: JSON.parse(raw), seat: null };
  refreshView();
  showView('game');
}

/**
 * Online games are asynchronous, so this polls slowly and only while the tab is
 * visible and it is somebody else's turn. No websocket: a game where the next
 * move might come tomorrow does not need a held-open connection.
 */
let pollTimer = null;
function poll() {
  clearTimeout(pollTimer);
  if (!S || S.mode !== 'online') return;
  const wait = document.hidden ? 60000 : (S.view.status === 'done' ? 0 : 6000);
  if (!wait) return;
  pollTimer = setTimeout(async () => {
    if (S?.mode !== 'online') return;
    if (S.view.turn !== S.seat || S.view.status !== 'active') {
      try {
        const res = await fetch(`/api/games/${S.code}?token=${encodeURIComponent(S.token || '')}`);
        if (res.ok) {
          const data = await res.json();
          if (data.version !== S.view.version) { S.view = data; render(); }
        }
      } catch { /* offline: try again next tick */ }
    }
    poll();
  }, wait);
}

// ----------------------------------------------------------------- wiring --

function wire() {
  $('goHome').onclick = () => { clearTimeout(pollTimer); showView('home'); renderResume(); };
  $('addSeat').onclick = () => {
    if (draft.seats.length < MAX_SEATS) draft.seats.push({ kind: 'bot', level: 'steady' });
    renderSeatPick();
  };
  $('dropSeat').onclick = () => { if (draft.seats.length > 1) draft.seats.pop(); renderSeatPick(); };
  $('startLocal').onclick = startLocal;
  $('startOnline').onclick = startOnline;
  $('joinBtn').onclick = () => {
    const code = $('joinCode').value.trim().toUpperCase();
    if (code.length === 5) openOnline(code);
    else toast('a game code is five characters', true);
  };
  $('playBtn').onclick = doPlay;
  $('recallBtn').onclick = recall;
  $('hintBtn').onclick = doHint;
  $('shuffleBtn').onclick = () => {
    // Cosmetic only: the rack order is the player's own business, so this
    // shuffles the VIEW and nothing else.
    const r = S.view.rack;
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    pending.clear();
    selected = null;
    render();
  };
  $('swapBtn').onclick = () => {
    pending.clear();
    selected = null;
    swapping = swapping ? null : new Set();
    render();
  };
  $('passBtn').onclick = () => {
    $('modalBody').replaceChildren();
    openModal('Pass your turn?', () => submitMove({ kind: 'pass' }).then(() => S.mode === 'online' && render()));
  };
  $('resignBtn').onclick = () => {
    $('modalBody').replaceChildren(el('p', 'hint',
      'You are out, and the others play on. In a two-player game that ends it.'));
    openModal('Resign this game?', () => submitMove({ kind: 'resign' }).then(() => S.mode === 'online' && render()));
  };
  $('copyLink').onclick = async () => {
    try { await navigator.clipboard.writeText($('shareLink').value); toast('link copied'); }
    catch { $('shareLink').select(); }
  };
  $('lookup').oninput = async (e) => {
    const word = e.target.value.trim().toUpperCase();
    const out = $('lookupResult');
    if (word.length < 2) { out.textContent = ''; out.className = 'verdict'; return; }
    const d = await loadDawg();
    const valid = d ? d.has(word) : false;
    out.textContent = valid ? 'a word' : 'not a word';
    out.className = `verdict ${valid ? 'yes' : 'no'}`;
  };
  document.addEventListener('visibilitychange', poll);
}

// ------------------------------------------------------------------ boot --

async function boot() {
  // Registered FIRST: beforeinstallprompt can fire before the awaits below
  // resolve, and a listener added afterwards never sees it — which is how a
  // PWA ends up with a permanently hidden install button.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    $('installBtn').hidden = false;
    $('installBtn').onclick = async () => { $('installBtn').hidden = true; e.prompt(); };
  });

  wire();
  renderLegend();
  renderLayoutPick();
  renderSeatPick();
  renderResume();
  $('myName').value = localStorage.getItem(LS.name) || '';

  const g = new URLSearchParams(location.search).get('g');
  if (g) await openOnline(g.toUpperCase());
  loadDawg();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

boot();
