// The solver: one screen, two tabs, an on-screen keyboard.
//
// THE SCREEN DOES NOT SCROLL. The app bar, the grid, the selected clue and the
// keyboard are a flex column pinned to the viewport, and the grid is sized in
// JS to whatever is left over (see `sizeGrid`). That is not a stylistic
// preference — solving a crossword means reading a clue and typing into a
// square, and if either of those can leave the screen the puzzle spends its
// time being scrolled instead of being solved.
//
// The keyboard is ours rather than the phone's. An earlier version parked an
// off-screen input to summon the native one, which is the standard trick and
// costs you a third of the screen, a caret you do not want, an autocorrect bar
// and a layout that changes height under you. Drawing 26 letters is less code
// than working around all of that, and it means a tap can never do anything
// except what this file says it does. Physical keyboards still work — see the
// `keydown` handler.
//
// THE GENERATOR IS NOT HERE. It lives in a Web Worker (gen/generate.worker.js)
// because a hard 15x15 is a couple of seconds of tight synchronous search, and
// on the main thread that reads as a crash.
//
// THE URL IS THE STATE. Every puzzle rewrites `?p=` with its permalink, so the
// back button, a reload, a bookmark and a shared link are one mechanism.
// Opening a link GENERATES the puzzle rather than fetching it, which is why the
// lexicon id is in the link: if the answer list has changed since the link was
// made the puzzle would silently be a different one, and the page says so.

import { encodePermalink, decodePermalink, dailySeed, SEED_PATTERN } from './gen/puzzle.js';
import { DIFFICULTIES } from './gen/fill.js';

const $ = (id) => document.getElementById(id);
const el = {
  tabPuzzleBtn: $('tabPuzzleBtn'), tabListBtn: $('tabListBtn'),
  panePuzzle: $('panePuzzle'), paneList: $('paneList'), listinner: $('listinner'),
  gridwrap: $('gridwrap'), grid: $('grid'),
  clueNum: $('clueNum'), clueBody: $('clueBody'), prevClue: $('prevClue'), nextClue: $('nextClue'),
  keyboard: $('keyboard'), timer: $('timer'),
  status: $('status'), statusText: $('statusText'),
  solved: $('solved'), solvedTime: $('solvedTime'),
  settingsBtn: $('settingsBtn'), sheet: $('sheet'), scrim: $('scrim'),
  size: $('size'), difficulty: $('difficulty'), seed: $('seed'), reseed: $('reseed'),
  generateBtn: $('generateBtn'), dailyBtn: $('dailyBtn'),
  checkBtn: $('checkBtn'), revealBtn: $('revealBtn'), clearBtn: $('clearBtn'), shareBtn: $('shareBtn'),
  meta: $('meta'),
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
    if (msg.type === 'ready') { lexiconId = msg.lexiconId; return; }
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

/**
 * Clues come from the worker endpoint rather than the client: the store is
 * three megabytes and a puzzle wants seventy of them. A failure is not fatal —
 * the grid is still solvable by crossings, and saying so beats an empty page.
 */
async function fetchClues(words) {
  const out = new Map();
  for (let i = 0; i < words.length; i += 60) {
    const res = await fetch(`/api/cross/clues?w=${words.slice(i, i + 60).join(',')}`);
    if (!res.ok) throw new Error(`clues: ${res.status}`);
    const body = await res.json();
    for (const [w, clue] of Object.entries(body.clues || {})) out.set(w, clue);
  }
  return out;
}

// ----------------------------------------------------------------- state ----

/** @type {{puzzle: object, link: string, letters: string[], clues: Map<string,string>} | null} */
let game = null;
let cursor = 0;
let direction = 'A';
let tab = 'puzzle';
let startedAt = 0;
let elapsed = 0;
let timerHandle = null;
let solvedAlready = false;
/** Cells the last Check marked wrong. Cleared per square as it is retyped. */
let marked = new Set();
/** entry key -> its <button> and the <span>s of its boxes, for the list tab. */
let listNodes = new Map();

const cellCount = () => game.puzzle.size * game.puzzle.size;
const isBlock = (i) => game.puzzle.blocks[i] === 1;
const keyOf = (entry) => `${entry.num}${entry.dir}`;

/**
 * Two lookups built once when a puzzle loads: cell -> its across and down
 * entries, and cell -> its correct letter.
 *
 * Searching the entry list instead is the obvious version and it is quadratic
 * in the wrong place — every repaint asks for the entry through a square, and
 * the solved check asks for every square's answer, so a 15x15 was scanning
 * seventy-eight entries a few hundred times per keystroke.
 */
function indexPuzzle(puzzle) {
  const byCell = new Array(puzzle.size * puzzle.size);
  const solution = new Array(puzzle.size * puzzle.size).fill('');
  for (const entry of puzzle.entries) {
    entry.cells.forEach((cell, p) => {
      if (!byCell[cell]) byCell[cell] = {};
      byCell[cell][entry.dir] = entry;
      solution[cell] = entry.answer[p];
    });
  }
  return { byCell, solution };
}

/** The entry of `dir` through `cell`. Every white square has one of each. */
const entryAt = (cell, dir = direction) => game.byCell[cell]?.[dir] || null;

/** The correct letter for a cell. */
const solutionAt = (cell) => game.solution[cell];

// ------------------------------------------------------------- rendering ----

/**
 * Fit the grid to the box the layout left for it.
 *
 * Measured rather than computed from `vh`: a phone's viewport changes height
 * when the browser chrome slides away, `100vh` keeps reporting the tall figure,
 * and the difference is the bottom row of a crossword hidden under the URL bar
 * for the rest of the session.
 */
function sizeGrid() {
  if (!game) return;
  const box = el.gridwrap.getBoundingClientRect();
  const style = getComputedStyle(el.gridwrap);
  const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const side = Math.max(120, Math.floor(Math.min(box.width - pad, box.height - padY)));
  el.grid.style.width = `${side}px`;
  el.grid.style.height = `${side}px`;
  document.documentElement.style.setProperty('--cellpx', `${side / game.puzzle.size}px`);
}

function renderGrid() {
  const { size, numbers } = game.puzzle;
  el.grid.style.setProperty('--size', size);
  const frag = document.createDocumentFragment();
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
    frag.appendChild(cell);
  }
  el.grid.replaceChildren(frag);
  sizeGrid();
}

function renderList() {
  const frag = document.createDocumentFragment();
  listNodes = new Map();
  for (const [dir, label] of [['A', 'Across'], ['D', 'Down']]) {
    const head = document.createElement('div');
    head.className = 'listhead';
    head.textContent = label;
    frag.appendChild(head);

    for (const entry of game.puzzle.entries.filter((e) => e.dir === dir)) {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'entry';
      node.dataset.key = keyOf(entry);

      const line = document.createElement('div');
      line.className = 'eclue';
      const num = document.createElement('span');
      num.className = 'enum';
      num.textContent = `${entry.num}${dir}`;
      const text = document.createElement('span');
      text.textContent = game.clues.get(entry.answer) || `${entry.len} letters`;
      line.append(num, text);

      const boxes = document.createElement('div');
      boxes.className = 'eboxes';
      boxes.style.setProperty('--n', entry.len);
      const spans = entry.cells.map(() => {
        const b = document.createElement('span');
        b.className = 'ebox';
        boxes.appendChild(b);
        return b;
      });

      node.append(line, boxes);
      // Picking a clue here selects it and shows the keyboard: the list is for
      // finding the one you want, the puzzle tab is for answering it.
      node.addEventListener('click', () => {
        direction = dir;
        cursor = entry.cells.find((c) => !game.letters[c]) ?? entry.cells[0];
        showTab('puzzle');
        paint();
      });
      frag.appendChild(node);
      listNodes.set(keyOf(entry), { node, spans, entry });
    }
  }
  el.listinner.replaceChildren(frag);
}

/** Repaint everything that depends on the cursor or the letters. */
function paint() {
  const entry = entryAt(cursor);
  const inEntry = entry ? new Set(entry.cells) : new Set();

  for (const node of el.grid.children) {
    const i = Number(node.dataset.i);
    if (isBlock(i)) continue;
    node.querySelector('.letter').textContent = game.letters[i] || '';
    node.classList.toggle('cursor', i === cursor);
    node.classList.toggle('active', inEntry.has(i));
    node.classList.toggle('bad', marked.has(i));
  }

  if (entry) {
    el.clueNum.textContent = `${entry.num}${entry.dir === 'A' ? 'A' : 'D'}`;
    el.clueBody.textContent = game.clues.get(entry.answer) || `${entry.len} letters`;
  }

  if (tab === 'list') paintList(entry);
  save();
  checkSolved();
}

/** The list tab's boxes, refreshed from the grid. Only while it is showing. */
function paintList(activeEntry) {
  const activeKey = activeEntry ? keyOf(activeEntry) : null;
  for (const [key, { node, spans, entry }] of listNodes) {
    let full = true;
    entry.cells.forEach((cell, p) => {
      const ch = game.letters[cell] || '';
      const span = spans[p];
      if (span.textContent !== ch) span.textContent = ch;
      span.classList.toggle('bad', marked.has(cell));
      if (!ch) full = false;
    });
    node.classList.toggle('filled', full);
    node.classList.toggle('active', key === activeKey);
  }
}

// ------------------------------------------------------------ navigation ----

function moveTo(cell) {
  if (cell < 0 || cell >= cellCount() || isBlock(cell)) return;
  cursor = cell;
  paint();
}

/** The next cell along `direction` within the entry, or null at its end. */
function step(from, delta) {
  const entry = entryAt(from);
  if (!entry) return null;
  const next = entry.cells[entry.cells.indexOf(from) + delta];
  return next === undefined ? null : next;
}

function typeLetter(ch) {
  if (!game || isBlock(cursor)) return;
  game.letters[cursor] = ch;
  // A square marked wrong stops being marked the moment it is retyped; leaving
  // the mark means Check has to be pressed again to believe a fix.
  marked.delete(cursor);
  startTimer();
  const next = step(cursor, 1);
  if (next !== null) cursor = next;
  paint();
}

function backspace() {
  if (!game) return;
  if (game.letters[cursor]) {
    game.letters[cursor] = '';
  } else {
    const prev = step(cursor, -1);
    if (prev !== null) { cursor = prev; game.letters[cursor] = ''; }
  }
  marked.delete(cursor);
  paint();
}

/** Move one square in a compass direction, skipping blocks. */
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

/** Jump to the entry `delta` away in reading order, landing on its first gap. */
function stepEntry(delta) {
  if (!game) return;
  const entries = game.puzzle.entries;
  const at = entries.indexOf(entryAt(cursor));
  const next = entries[(at + delta + entries.length) % entries.length];
  direction = next.dir;
  cursor = next.cells.find((c) => !game.letters[c]) ?? next.cells[0];
  paint();
}

// -------------------------------------------------------------- checking ----

function check() {
  marked = new Set();
  let wrong = 0;
  for (let i = 0; i < cellCount(); i++) {
    if (isBlock(i) || !game.letters[i]) continue;
    if (game.letters[i] !== solutionAt(i)) { marked.add(i); wrong++; }
  }
  paint();
  flash(wrong ? `${wrong} wrong ${wrong === 1 ? 'letter' : 'letters'}` : 'Nothing wrong so far');
}

function reveal() {
  for (let i = 0; i < cellCount(); i++) if (!isBlock(i)) game.letters[i] = solutionAt(i);
  marked = new Set();
  stopTimer();
  paint();
}

function clearAll() {
  for (let i = 0; i < cellCount(); i++) game.letters[i] = '';
  marked = new Set();
  elapsed = 0;
  startedAt = 0;
  solvedAlready = false;
  el.solved.hidden = true;
  el.timer.textContent = formatTime(0);
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
  el.solvedTime.textContent = elapsed ? `in ${formatTime(elapsed)}` : '';
  el.solved.hidden = false;
}

/** A transient line in the clue bar — there is no room for a toast anywhere. */
let flashHandle = null;
function flash(text) {
  el.clueNum.textContent = '';
  el.clueBody.textContent = text;
  if (flashHandle) clearTimeout(flashHandle);
  flashHandle = setTimeout(() => { if (game) paint(); }, 1600);
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
// Keyed by permalink, so the same link resumes and a different one cannot
// collide. Letters only — everything else regenerates from the seed.

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

// ------------------------------------------------------------------ tabs ----

function showTab(which) {
  tab = which;
  const onPuzzle = which === 'puzzle';
  el.tabPuzzleBtn.setAttribute('aria-selected', String(onPuzzle));
  el.tabListBtn.setAttribute('aria-selected', String(!onPuzzle));
  el.panePuzzle.hidden = !onPuzzle;
  el.paneList.hidden = onPuzzle;
  if (onPuzzle) sizeGrid();
  else paintList(game ? entryAt(cursor) : null);
}

// -------------------------------------------------------------- keyboard ----

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', '⇄ZXCVBNM⌫'];

function buildKeyboard() {
  const frag = document.createDocumentFragment();
  for (const row of ROWS) {
    const div = document.createElement('div');
    div.className = 'krow';
    for (const ch of row) {
      const key = document.createElement('button');
      key.type = 'button';
      key.className = ch === '⌫' || ch === '⇄' ? 'key wide' : 'key';
      key.textContent = ch;
      key.dataset.k = ch;
      if (ch === '⌫') key.setAttribute('aria-label', 'Backspace');
      if (ch === '⇄') key.setAttribute('aria-label', 'Switch between across and down');
      div.appendChild(key);
    }
    frag.appendChild(div);
  }
  el.keyboard.replaceChildren(frag);
}

// `pointerdown`, not `click`: a key that waits for the pointer to come back up
// feels like a lag, and on a crossword you are typing fast.
el.keyboard.addEventListener('pointerdown', (event) => {
  const key = event.target.closest('.key');
  if (!key || !game) return;
  event.preventDefault();
  pressKey(key.dataset.k);
});

function pressKey(k) {
  if (k === '⌫') backspace();
  else if (k === '⇄') toggleDirection();
  else typeLetter(k);
}

// ------------------------------------------------------------------ flow ----

function setStatus(text) {
  el.statusText.textContent = text;
  el.status.hidden = false;
}

async function openPuzzle(spec, { push = true } = {}) {
  closeSheet();
  setStatus(`Generating a ${spec.size}×${spec.size} ${spec.difficulty} puzzle…`);

  let result;
  try {
    result = await generate(spec);
  } catch (e) {
    setStatus(`Could not generate that puzzle: ${e.message}`);
    return;
  }

  const puzzle = result.puzzle;
  const link = encodePermalink(spec);
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
  marked = new Set();
  el.solved.hidden = true;

  const saved = restore(link, puzzle.size);
  game = {
    puzzle, link, clues,
    letters: saved || new Array(puzzle.size * puzzle.size).fill(''),
    ...indexPuzzle(puzzle),
  };
  cursor = puzzle.entries[0].cells[0];
  direction = 'A';

  renderGrid();
  renderList();
  el.timer.textContent = formatTime(elapsed);
  el.status.hidden = true;
  showTab('puzzle');
  paint();

  const bits = [
    `${puzzle.size}×${puzzle.size} ${DIFFICULTIES[puzzle.difficulty].label.toLowerCase()}`,
    `${puzzle.entries.length} entries`,
    `seed “${puzzle.seed}”`,
    `generated in ${result.ms} ms`,
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

// -------------------------------------------------------------- settings ----

function openSheet() {
  el.sheet.hidden = false;
  el.scrim.hidden = false;
  el.settingsBtn.setAttribute('aria-expanded', 'true');
}
function closeSheet() {
  el.sheet.hidden = true;
  el.scrim.hidden = true;
  el.settingsBtn.setAttribute('aria-expanded', 'false');
}
const sheetOpen = () => !el.sheet.hidden;

el.settingsBtn.addEventListener('click', () => (sheetOpen() ? closeSheet() : openSheet()));
el.scrim.addEventListener('click', closeSheet);

// ---------------------------------------------------------------- events ----

el.tabPuzzleBtn.addEventListener('click', () => showTab('puzzle'));
el.tabListBtn.addEventListener('click', () => showTab('list'));
el.prevClue.addEventListener('click', () => stepEntry(-1));
el.nextClue.addEventListener('click', () => stepEntry(1));

el.generateBtn.addEventListener('click', () => openPuzzle(specFromForm()));
el.dailyBtn.addEventListener('click', () => openPuzzle({
  seed: dailySeed(), size: Number(el.size.value), difficulty: el.difficulty.value,
}));
el.reseed.addEventListener('click', () => { el.seed.value = randomSeed(); });
el.checkBtn.addEventListener('click', () => { closeSheet(); check(); });
el.revealBtn.addEventListener('click', () => { closeSheet(); reveal(); });
el.clearBtn.addEventListener('click', () => { closeSheet(); clearAll(); });
el.shareBtn.addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?p=${game.link}`;
  try {
    await navigator.clipboard.writeText(url);
    el.shareBtn.textContent = 'Copied';
  } catch {
    // Clipboard access is refused often enough — permissions, an insecure
    // context, an unfocused document — that a silent failure looks like a bug.
    el.shareBtn.textContent = 'Copy failed';
  }
  setTimeout(() => { el.shareBtn.textContent = 'Copy link'; }, 1500);
});

el.grid.addEventListener('pointerdown', (event) => {
  const cell = event.target.closest('.cell');
  if (!cell || cell.classList.contains('block') || !game) return;
  event.preventDefault();
  const i = Number(cell.dataset.i);
  // Tapping the square you are already on flips across/down — the same thing
  // the ⇄ key does, in the place a thumb already is.
  if (i === cursor) toggleDirection();
  else moveTo(i);
});

window.addEventListener('keydown', (event) => {
  if (!game) return;
  const target = event.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key === 'Escape' && sheetOpen()) { closeSheet(); event.preventDefault(); return; }
  if (sheetOpen()) return;

  if (/^[a-zA-Z]$/.test(event.key)) { typeLetter(event.key.toUpperCase()); event.preventDefault(); return; }
  switch (event.key) {
    case 'Backspace': backspace(); event.preventDefault(); break;
    case 'Delete': game.letters[cursor] = ''; marked.delete(cursor); paint(); event.preventDefault(); break;
    case 'ArrowUp': arrow(-1, 0); event.preventDefault(); break;
    case 'ArrowDown': arrow(1, 0); event.preventDefault(); break;
    case 'ArrowLeft': arrow(0, -1); event.preventDefault(); break;
    case 'ArrowRight': arrow(0, 1); event.preventDefault(); break;
    case 'Tab': stepEntry(event.shiftKey ? -1 : 1); event.preventDefault(); break;
    case ' ': toggleDirection(); event.preventDefault(); break;
    default: break;
  }
});

// The grid is sized to a measured box, so it has to be re-measured whenever the
// box changes: rotation, a desktop window drag, and — the one that matters —
// a phone's browser chrome sliding away, which changes the viewport without
// firing `resize` on some browsers. visualViewport catches that.
const remeasure = () => { if (tab === 'puzzle') sizeGrid(); };
new ResizeObserver(remeasure).observe(el.gridwrap);
window.addEventListener('orientationchange', () => setTimeout(remeasure, 250));
if (window.visualViewport) window.visualViewport.addEventListener('resize', remeasure);

window.addEventListener('popstate', () => boot({ push: false }));

// ------------------------------------------------------------------ boot ----

function boot({ push = false } = {}) {
  buildKeyboard();
  const fromUrl = decodePermalink(new URLSearchParams(location.search).get('p'));
  // No link means today's puzzle rather than an empty screen with a form on it:
  // the daily is a real default, it is the same puzzle for everybody, and the
  // settings sheet is one tap away for anything else.
  openPuzzle(fromUrl || { seed: dailySeed(), size: 15, difficulty: 'medium' }, { push });
}

boot();
