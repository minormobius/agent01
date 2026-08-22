// The solver: grid, clues, keyboard, touch, and the URL.
//
// The generator does not live here — it lives in a Web Worker
// (gen/generate.worker.js), because a hard 15x15 is a couple of seconds of
// tight synchronous search and doing that on the main thread reads as a crash.
// This file owns the puzzle once it arrives, and the puzzle is the only state
// there is: no server, no account, no save. Progress lives in localStorage
// under the permalink, so closing the tab is not the same as giving up.
//
// THE URL IS THE STATE. Every generated puzzle rewrites `?p=` with its
// permalink, so the back button, a reload, a bookmark and a shared link are all
// the same mechanism. Opening a link generates the puzzle rather than fetching
// it, which is why the lexicon id is in there: if the answer list has changed
// since the link was made, the puzzle would silently be a different one, and
// the page says so instead.

import { encodePermalink, decodePermalink, dailySeed, SIZES, SEED_PATTERN } from './gen/puzzle.js';
import { DIFFICULTIES } from './gen/fill.js';

const $ = (id) => document.getElementById(id);
const el = {
  setup: $('setup'), size: $('size'), difficulty: $('difficulty'), seed: $('seed'),
  reseed: $('reseed'), generate: $('generate'), daily: $('daily'),
  status: $('status'), statusText: $('statusText'),
  puzzle: $('puzzle'), grid: $('grid'), current: $('current'), meta: $('meta'),
  acrossList: $('acrossList'), downList: $('downList'),
  checkBtn: $('checkBtn'), revealBtn: $('revealBtn'), clearBtn: $('clearBtn'),
  shareBtn: $('shareBtn'), newBtn: $('newBtn'), timer: $('timer'),
  done: $('done'), doneTime: $('doneTime'), another: $('another'), topNote: $('topNote'),
};

// --------------------------------------------------------------- worker ----

let worker = null;
let nextRequestId = 1;
const pending = new Map();
let lexiconId = null;

function generator() {
  if (worker) return worker;
  worker = new Worker(new URL('./gen/generate.worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event) => {
    const msg = event.data || {};
    if (msg.type === 'ready') {
      lexiconId = msg.lexiconId;
      el.topNote.textContent = `${msg.answers.toLocaleString()} answers`;
      return;
    }
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    if (msg.type === 'puzzle') waiter.resolve({ puzzle: msg.puzzle, ms: msg.ms });
    else waiter.reject(new Error(msg.error || 'generation failed'));
  });
  worker.addEventListener('error', (e) => {
    for (const [, waiter] of pending) waiter.reject(new Error(e.message || 'worker failed'));
    pending.clear();
  });
  return worker;
}

function generate(spec) {
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    generator().postMessage({ type: 'generate', id, ...spec });
  });
}

// ---------------------------------------------------------------- clues ----

/**
 * Clues come from the worker endpoint rather than from the client, because the
 * clue store is three megabytes and a puzzle wants seventy of them. A failure
 * here is not fatal: the grid is still solvable by crossings, and saying so is
 * better than an empty page.
 */
async function fetchClues(words) {
  const out = new Map();
  // URL length is the only real bound; chunk so a 15x15 is one or two requests.
  for (let i = 0; i < words.length; i += 60) {
    const chunk = words.slice(i, i + 60);
    const res = await fetch(`/api/cross/clues?w=${chunk.join(',')}`);
    if (!res.ok) throw new Error(`clues: ${res.status}`);
    const body = await res.json();
    for (const [w, clue] of Object.entries(body.clues || {})) out.set(w, clue);
  }
  return out;
}

// ----------------------------------------------------------------- state ----

/** @type {{puzzle: object, link: string, letters: string[], clues: Map<string,string>} | null} */
let game = null;
let cursor = 0;          // cell index
let direction = 'A';     // 'A' or 'D'
let startedAt = 0;
let elapsed = 0;
let timerHandle = null;
let solvedAlready = false;

const cellCount = () => game.puzzle.size * game.puzzle.size;
const isBlock = (i) => game.puzzle.blocks[i] === 1;

/** The entry of `direction` through `cell`, or null. */
function entryAt(cell, dir = direction) {
  return game.puzzle.entries.find((e) => e.dir === dir && e.cells.includes(cell)) || null;
}

// ------------------------------------------------------------- rendering ----

function renderGrid() {
  const { size, numbers } = game.puzzle;
  el.grid.style.setProperty('--size', size);
  el.grid.replaceChildren();
  for (let i = 0; i < size * size; i++) {
    const cell = document.createElement('div');
    cell.className = isBlock(i) ? 'cell block' : 'cell';
    cell.dataset.i = String(i);
    if (!isBlock(i)) {
      if (numbers[i]) {
        const n = document.createElement('span');
        n.className = 'num';
        n.textContent = numbers[i];
        cell.appendChild(n);
      }
      const letter = document.createElement('span');
      letter.className = 'letter';
      cell.appendChild(letter);
    }
    el.grid.appendChild(cell);
  }
  paint();
}

function renderClues() {
  for (const [dir, list] of [['A', el.acrossList], ['D', el.downList]]) {
    list.replaceChildren();
    for (const entry of game.puzzle.entries.filter((e) => e.dir === dir)) {
      const li = document.createElement('li');
      li.dataset.key = `${entry.num}${entry.dir}`;
      li.value = entry.num;
      const text = game.clues.get(entry.answer);
      li.textContent = text || `(${entry.len} letters)`;
      if (!text) li.classList.add('noclue');
      li.addEventListener('click', () => {
        direction = dir;
        moveTo(entry.cells[0]);
      });
      list.appendChild(li);
    }
  }
}

/** Repaint everything that depends on the cursor or the letters. */
function paint() {
  const entry = entryAt(cursor);
  const inEntry = new Set(entry ? entry.cells : []);
  for (const node of el.grid.children) {
    const i = Number(node.dataset.i);
    if (isBlock(i)) continue;
    node.querySelector('.letter').textContent = game.letters[i] || '';
    node.classList.toggle('cursor', i === cursor);
    node.classList.toggle('active', inEntry.has(i));
  }
  for (const list of [el.acrossList, el.downList]) {
    for (const li of list.children) {
      li.classList.toggle('active', !!entry && li.dataset.key === `${entry.num}${entry.dir}`);
    }
  }
  if (entry) {
    const text = game.clues.get(entry.answer) || `${entry.len} letters`;
    el.current.textContent = `${entry.num} ${entry.dir === 'A' ? 'Across' : 'Down'} — ${text}`;
    const li = document.querySelector(`li[data-key="${entry.num}${entry.dir}"].active`);
    if (li) li.scrollIntoView({ block: 'nearest' });
  }
  save();
  checkSolved();
}

// ------------------------------------------------------------ navigation ----

function moveTo(cell) {
  if (cell < 0 || cell >= cellCount() || isBlock(cell)) return;
  cursor = cell;
  paint();
}

/** The next editable cell along `direction`, or null at the end of the entry. */
function step(from, delta) {
  const entry = entryAt(from);
  if (!entry) return null;
  const at = entry.cells.indexOf(from);
  const next = entry.cells[at + delta];
  return next === undefined ? null : next;
}

function typeLetter(ch) {
  if (!game || isBlock(cursor)) return;
  game.letters[cursor] = ch;
  // A square that was marked wrong stops being marked the moment it is retyped;
  // leaving the mark on means Check has to be pressed again to believe a fix.
  el.grid.children[cursor].classList.remove('bad');
  startTimer();
  const next = step(cursor, 1);
  if (next !== null) cursor = next;
  paint();
}

function backspace() {
  if (game.letters[cursor]) {
    game.letters[cursor] = '';
  } else {
    const prev = step(cursor, -1);
    if (prev !== null) { cursor = prev; game.letters[cursor] = ''; }
  }
  paint();
}

/** Move by one square in a compass direction, skipping blocks. */
function arrow(dRow, dCol) {
  const size = game.puzzle.size;
  // An arrow across the grain switches direction first — the behaviour every
  // crossword app has, and its absence is the first thing a solver notices.
  const wanted = dRow ? 'D' : 'A';
  if (direction !== wanted) { direction = wanted; paint(); return; }
  let r = Math.floor(cursor / size) + dRow;
  let c = (cursor % size) + dCol;
  while (r >= 0 && r < size && c >= 0 && c < size) {
    const i = r * size + c;
    if (!isBlock(i)) { moveTo(i); return; }
    r += dRow; c += dCol;
  }
}

function toggleDirection() {
  direction = direction === 'A' ? 'D' : 'A';
  paint();
}

// -------------------------------------------------------------- checking ----

function check() {
  let wrong = 0;
  for (const node of el.grid.children) {
    const i = Number(node.dataset.i);
    if (isBlock(i)) continue;
    node.classList.remove('bad');
    if (!game.letters[i]) continue;
    if (game.letters[i] !== solutionAt(i)) { node.classList.add('bad'); wrong++; }
  }
  el.current.textContent = wrong
    ? `${wrong} wrong ${wrong === 1 ? 'letter' : 'letters'} marked.`
    : 'Nothing wrong so far.';
}

/** The correct letter for a cell, read off the across entry through it. */
function solutionAt(cell) {
  const entry = entryAt(cell, 'A') || entryAt(cell, 'D');
  return entry.answer[entry.cells.indexOf(cell)];
}

function reveal() {
  for (let i = 0; i < cellCount(); i++) if (!isBlock(i)) game.letters[i] = solutionAt(i);
  stopTimer();
  paint();
}

function clearAll() {
  for (let i = 0; i < cellCount(); i++) game.letters[i] = '';
  for (const node of el.grid.children) node.classList.remove('bad');
  elapsed = 0;
  startedAt = 0;
  el.done.hidden = true;
  solvedAlready = false;
  paint();
}

function checkSolved() {
  if (!game || solvedAlready) return;
  for (let i = 0; i < cellCount(); i++) {
    if (isBlock(i)) continue;
    if (game.letters[i] !== solutionAt(i)) return;
  }
  solvedAlready = true;
  stopTimer();
  el.doneTime.textContent = elapsed ? `In ${formatTime(elapsed)}.` : '';
  el.done.hidden = false;
}

// ----------------------------------------------------------------- timer ----

const formatTime = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function startTimer() {
  if (startedAt || solvedAlready) return;
  startedAt = Date.now() - elapsed;
  timerHandle = setInterval(() => {
    elapsed = Date.now() - startedAt;
    el.timer.textContent = formatTime(elapsed);
  }, 1000);
}
function stopTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
  if (startedAt) elapsed = Date.now() - startedAt;
  startedAt = 0;
  el.timer.textContent = formatTime(elapsed);
}

// --------------------------------------------------------------- storage ----
//
// Keyed by permalink, so the same link resumes and a different one does not
// collide. Letters only — everything else is regenerated from the seed.

const storageKey = (link) => `cross:${link}`;

function save() {
  if (!game) return;
  try {
    localStorage.setItem(storageKey(game.link), JSON.stringify({ letters: game.letters, elapsed }));
  } catch { /* private mode, a full quota — not worth interrupting a solve for */ }
}

function restore(link, size) {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(link)) || 'null');
    if (raw && Array.isArray(raw.letters) && raw.letters.length === size * size) {
      elapsed = Number(raw.elapsed) || 0;
      return raw.letters;
    }
  } catch { /* ignore */ }
  return null;
}

// ------------------------------------------------------------------ flow ----

function setStatus(text) {
  el.statusText.textContent = text;
  el.status.hidden = false;
}

async function open(spec, { push = true } = {}) {
  const link = encodePermalink(spec);
  el.puzzle.hidden = true;
  el.done.hidden = true;
  el.setup.hidden = true;
  setStatus(`Generating a ${spec.size}×${spec.size} ${spec.difficulty} puzzle…`);

  let result;
  try {
    result = await generate(spec);
  } catch (e) {
    el.status.hidden = false;
    el.statusText.textContent = `Could not generate that puzzle: ${e.message}`;
    el.setup.hidden = false;
    return;
  }

  const puzzle = result.puzzle;
  setStatus('Fetching clues…');
  let clues = new Map();
  let clueError = null;
  try {
    clues = await fetchClues(puzzle.entries.map((e) => e.answer));
  } catch (e) {
    clueError = e.message;
  }

  stopTimer();
  elapsed = 0;
  solvedAlready = false;
  const saved = restore(link, puzzle.size);
  game = {
    puzzle, link, clues,
    letters: saved || new Array(puzzle.size * puzzle.size).fill(''),
  };
  cursor = puzzle.entries[0].cells[0];
  direction = 'A';

  renderGrid();
  renderClues();
  el.timer.textContent = formatTime(elapsed);
  el.status.hidden = true;
  el.puzzle.hidden = false;
  // The form has done its job; on a phone it is a whole screen of controls
  // between the reader and the puzzle they just asked for. `New` brings it back.
  el.setup.hidden = true;

  const bits = [
    `${puzzle.size}×${puzzle.size}`,
    DIFFICULTIES[puzzle.difficulty].label.toLowerCase(),
    `${puzzle.entries.length} entries`,
    `generated in ${result.ms} ms`,
    `seed “${puzzle.seed}”`,
  ];
  if (clueError) bits.push('clues unavailable — offline?');
  if (lexiconId && puzzle.lexiconId !== lexiconId) {
    bits.push('⚠ this link was made against a different answer list');
  }
  el.meta.textContent = bits.join(' · ');

  el.size.value = String(puzzle.size);
  el.difficulty.value = puzzle.difficulty;
  el.seed.value = puzzle.seed;

  const url = `${location.pathname}?p=${link}`;
  if (push) history.pushState({ link }, '', url);
  else history.replaceState({ link }, '', url);
  document.title = `cross — ${puzzle.seed}`;
}

/** A seed that is short, typable, and never the same twice. */
function randomSeed() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

function specFromForm() {
  let seed = el.seed.value.trim();
  if (!SEED_PATTERN.test(seed)) seed = randomSeed();
  return { seed, size: Number(el.size.value), difficulty: el.difficulty.value };
}

// ---------------------------------------------------------------- events ----

el.generate.addEventListener('click', () => open(specFromForm()));
el.newBtn.addEventListener('click', () => {
  el.setup.hidden = false;
  el.puzzle.hidden = true;
  el.done.hidden = true;
  el.setup.scrollIntoView({ block: 'start' });
});
el.reseed.addEventListener('click', () => { el.seed.value = randomSeed(); });
el.daily.addEventListener('click', () => open({
  seed: dailySeed(), size: Number(el.size.value), difficulty: el.difficulty.value,
}));
el.another.addEventListener('click', () => { el.seed.value = randomSeed(); open(specFromForm()); });
el.checkBtn.addEventListener('click', check);
el.revealBtn.addEventListener('click', reveal);
el.clearBtn.addEventListener('click', clearAll);
el.shareBtn.addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?p=${game.link}`;
  try {
    await navigator.clipboard.writeText(url);
    el.shareBtn.textContent = 'Copied';
  } catch {
    // Clipboard access is refused often enough (permissions, insecure context,
    // an unfocused document) that a silent failure would look like a bug.
    el.shareBtn.textContent = 'Copy failed';
  }
  setTimeout(() => { el.shareBtn.textContent = 'Copy link'; }, 1500);
});

/**
 * A phone has no keyboard until something focusable asks for one, and the grid
 * is a pile of divs. So there is one off-screen input that exists purely to
 * summon it: tapping a square focuses it, and whatever the keyboard puts in it
 * is read as a keystroke and thrown away. This is the standard trick and there
 * is no better one — a contenteditable grid fights the browser's own caret, and
 * an input per square breaks the moment autocorrect notices a word.
 */
const kbd = document.createElement('input');
kbd.className = 'kbd';
kbd.setAttribute('autocapitalize', 'characters');
kbd.setAttribute('autocomplete', 'off');
kbd.setAttribute('autocorrect', 'off');
kbd.setAttribute('spellcheck', 'false');
kbd.setAttribute('aria-hidden', 'true');
kbd.tabIndex = -1;
document.body.appendChild(kbd);

kbd.addEventListener('input', () => {
  const typed = kbd.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
  kbd.value = '';
  for (const ch of typed) typeLetter(ch);
});
// Android soft keyboards report Backspace on an empty field only through
// keydown, and not always with a useful key name; both spellings are handled.
kbd.addEventListener('keydown', (event) => {
  if (event.key === 'Backspace' || event.keyCode === 8) { backspace(); event.preventDefault(); }
});

el.grid.addEventListener('pointerdown', (event) => {
  const cell = event.target.closest('.cell');
  if (!cell || cell.classList.contains('block')) return;
  const i = Number(cell.dataset.i);
  // Tapping the square you are already on flips across/down. On a phone that is
  // the only way to change direction, so it has to be the tap and not a gesture.
  if (i === cursor) toggleDirection();
  else moveTo(i);
  kbd.value = '';
  kbd.focus({ preventScroll: true });
});

window.addEventListener('keydown', (event) => {
  if (!game || el.puzzle.hidden) return;
  const target = event.target;
  if (target && target !== kbd && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
  // The off-screen input already turned this into a letter via its `input`
  // event; handling it here as well would type everything twice.
  if (target === kbd && /^[a-zA-Z]$/.test(event.key)) return;

  if (/^[a-zA-Z]$/.test(event.key)) { typeLetter(event.key.toUpperCase()); event.preventDefault(); return; }
  switch (event.key) {
    case 'Backspace': backspace(); event.preventDefault(); break;
    case 'Delete': game.letters[cursor] = ''; paint(); event.preventDefault(); break;
    case 'ArrowUp': arrow(-1, 0); event.preventDefault(); break;
    case 'ArrowDown': arrow(1, 0); event.preventDefault(); break;
    case 'ArrowLeft': arrow(0, -1); event.preventDefault(); break;
    case 'ArrowRight': arrow(0, 1); event.preventDefault(); break;
    case 'Tab': {
      const entries = game.puzzle.entries;
      const here = entryAt(cursor);
      const at = entries.indexOf(here);
      const next = entries[(at + (event.shiftKey ? -1 : 1) + entries.length) % entries.length];
      direction = next.dir;
      moveTo(next.cells[0]);
      event.preventDefault();
      break;
    }
    case ' ': toggleDirection(); event.preventDefault(); break;
    default: break;
  }
});

window.addEventListener('popstate', () => { boot({ push: false }); });

// ------------------------------------------------------------------ boot ----

function boot({ push = false } = {}) {
  const fromUrl = decodePermalink(new URLSearchParams(location.search).get('p'));
  if (fromUrl) {
    open(fromUrl, { push });
    return;
  }
  el.setup.hidden = false;
  el.puzzle.hidden = true;
  el.seed.value = randomSeed();
  generator(); // start loading the lexicon now, not when Generate is pressed
}

boot();
