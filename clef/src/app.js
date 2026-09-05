// app.js — the page.
//
// The whole site is one idea made interactive: THE SOURCE AND THE ENGRAVING ARE
// TWO VIEWS OF ONE DOCUMENT. Type in the text and the notation redraws; click a
// notehead and the caret lands on the characters that drew it; click blank
// staff and a note is written into the source at the caret. Nothing is stored
// in a hidden model that the text is a serialisation of — the text IS the
// model, and every edit is a text edit. That is what makes the file you
// download the same thing you were looking at.

import { parseLily, pitchToLilyRelative, pitchToLily, durationToLily } from './lily.js';
import { engrave } from './engrave.js';
import { PATCHES, Player, scoreToNotes, performance as buildPerformance, renderWav, silentSwitchMayMute } from './audio.js';
import { writeMidi } from './midi.js';
import { LIBRARY, byId, DEFAULT_PIECE } from './library.js';
import { WHOLE, ticksOf, keyAlterations, clefDef, pitchFromDiatonic, spell } from './model.js';
import { glyphSVG } from './glyphs.js';
import { AuthClient } from './auth.js';
import { listComposers, listPieces, fetchSource, missingIncludes } from './mutopia.js';

const COLLECTION = 'com.minomobi.clef.piece';
const DRAFT_KEY = 'clef.draft.v1';
const PREFS_KEY = 'clef.prefs.v1';

const $ = (id) => document.getElementById(id);
const el = {
  source: $('source'), gutter: $('gutter'), score: $('score'), scroll: $('score-scroll'),
  diagnostics: $('diagnostics'), status: $('src-status'), pieceSelect: $('piece-select'),
  play: $('btn-play'), patch: $('patch'), tempo: $('tempo'), tempoOut: $('tempo-out'),
  zoom: $('zoom'), follow: $('follow'), grand: $('grand'), palette: $('palette'), main: $('main'),
  sheet: $('sheet'), sheetTitle: $('sheet-title'), sheetBody: $('sheet-body'),
  toast: $('toast'), account: $('btn-account'),
};

const state = {
  score: null,          // parsed
  layout: null,         // engraved
  perf: null,           // playback timeline
  flat: null,
  selected: null,       // index into layout.events
  dur: 4,
  dotted: false,
  accidental: null,     // -1 | 0 | 1 | null (null = follow the key signature)
  tempoOverride: null,
  playingTick: null,
  title: 'Untitled',
  rkey: null,           // set once this piece has been published
};

const player = new Player();
const auth = new AuthClient();

// ------------------------------------------------------------------ prefs --

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
  } catch { return {}; }
}
function savePrefs(patch) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch { /* private mode; prefs are a convenience, not a requirement */ }
}

// ------------------------------------------------------------------ toast --

let toastTimer = null;
function toast(message, ms = 2600) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
}

// ------------------------------------------------------------ the render --

let renderTimer = null;
function scheduleRender(immediate = false) {
  clearTimeout(renderTimer);
  if (immediate) return render();
  // 140ms: long enough that typing a word is one render, short enough that the
  // notation feels like it is following the keystrokes rather than catching up.
  renderTimer = setTimeout(render, 140);
  return undefined;
}

function scoreWidth() {
  const avail = el.scroll.clientWidth - 28;
  return Math.max(360, Math.min(1100, avail));
}

function render() {
  const src = el.source.value;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ src, title: state.title, rkey: state.rkey }));
  } catch { /* nothing to do; the text is still on screen */ }

  let parsed;
  try {
    parsed = parseLily(src);
  } catch (err) {
    // The parser is written not to throw, but a page that goes blank on one bad
    // character would be worse than a page that says so.
    el.diagnostics.innerHTML = '';
    el.diagnostics.appendChild(diagButton({ severity: 'error', message: String(err && err.message || err), at: 0 }, src));
    el.status.textContent = 'could not read';
    el.status.classList.add('is-bad');
    return;
  }

  state.score = parsed;
  const sp = Number(el.zoom.value) || 9;
  const layout = engrave(parsed, {
    width: scoreWidth(), staffSpace: sp, grandStaff: el.grand.checked,
  });
  state.layout = layout;

  el.score.innerHTML = layout.svg;
  el.score.style.width = `${layout.width}px`;

  state.flat = scoreToNotes(parsed);
  const bpm = state.tempoOverride ?? parsed.tempo.bpm;
  state.perf = buildPerformance(state.flat, { ...parsed.tempo, bpm });
  player.load(state.perf);

  if (state.tempoOverride === null) {
    el.tempo.value = String(Math.round(parsed.tempo.bpm));
    el.tempoOut.textContent = `${Math.round(parsed.tempo.bpm)}`;
  }

  showDiagnostics(parsed.diagnostics, layout.warnings, src);
  paintGutter(src, parsed.diagnostics, layout.warnings);
  restoreSelection();

  const bars = layout.measures;
  const notes = state.flat.notes.length;
  el.status.classList.remove('is-bad');
  el.status.textContent = `${bars} bar${bars === 1 ? '' : 's'} · ${notes} note${notes === 1 ? '' : 's'}`;
}

function showDiagnostics(diags, warnings, src) {
  el.diagnostics.innerHTML = '';
  const all = [
    ...diags.map((d) => ({ ...d, severity: d.severity || 'warning' })),
    ...warnings.map((w) => ({ ...w, severity: 'warning' })),
  ].sort((a, b) => a.at - b.at);
  for (const d of all.slice(0, 40)) el.diagnostics.appendChild(diagButton(d, src));
}

function lineOf(src, offset) {
  let line = 1;
  for (let i = 0; i < Math.min(offset, src.length); i++) if (src[i] === '\n') line++;
  return line;
}

function diagButton(d, src) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `diag diag-${d.severity}`;
  const strong = document.createElement('b');
  strong.textContent = `line ${lineOf(src, d.at)}`;
  b.appendChild(strong);
  b.appendChild(document.createTextNode(d.message));
  b.addEventListener('click', () => {
    el.source.focus();
    el.source.setSelectionRange(d.at, d.at);
    scrollCaretIntoView();
  });
  return b;
}

/** Line numbers, flagged where a diagnostic landed. */
function paintGutter(src, diags, warnings) {
  const lines = src.split('\n').length;
  const flagged = new Map();
  for (const d of diags) flagged.set(lineOf(src, d.at), d.severity === 'error' ? 'g-bad' : 'g-warn');
  for (const w of warnings) if (!flagged.has(lineOf(src, w.at))) flagged.set(lineOf(src, w.at), 'g-warn');
  let html = '';
  for (let i = 1; i <= lines; i++) {
    const cls = flagged.get(i);
    html += cls ? `<span class="${cls}">${i}</span>\n` : `${i}\n`;
  }
  el.gutter.innerHTML = html;
  el.gutter.scrollTop = el.source.scrollTop;
}

// ------------------------------------------------------------- selection --

function selectEvent(idx, { play = true, moveCaret = true } = {}) {
  state.selected = idx;
  const ev = state.layout?.events[idx];
  paintSelection();
  if (!ev) return;
  if (moveCaret && ev.src) {
    el.source.focus({ preventScroll: true });
    el.source.setSelectionRange(ev.src[0], ev.src[1]);
    scrollCaretIntoView();
  }
  if (play && ev.midi?.length) {
    for (const m of ev.midi.slice(0, 6)) player.preview(m, 0.55);
  }
}

function paintSelection() {
  for (const node of el.score.querySelectorAll('.is-selected')) node.classList.remove('is-selected');
  if (state.selected == null) return;
  const node = el.score.querySelector(`[data-ev="${state.selected}"]`);
  if (node) node.classList.add('is-selected');
}

/** After a re-render the event indices change; re-find the note by its source range. */
function restoreSelection() {
  if (state.selectedSrc && state.layout) {
    const [a] = state.selectedSrc;
    const idx = state.layout.events.findIndex((e) => e.src && e.src[0] === a);
    state.selected = idx >= 0 ? idx : null;
  }
  paintSelection();
}

function scrollCaretIntoView() {
  // textarea has no scrollIntoView for a caret; approximate from the line count.
  const before = el.source.value.slice(0, el.source.selectionStart);
  const line = before.split('\n').length - 1;
  const lineH = parseFloat(getComputedStyle(el.source).lineHeight) || 20;
  const target = line * lineH;
  const view = el.source.clientHeight;
  if (target < el.source.scrollTop + lineH || target > el.source.scrollTop + view - lineH * 2) {
    el.source.scrollTop = Math.max(0, target - view / 2);
    el.gutter.scrollTop = el.source.scrollTop;
  }
}

// ------------------------------------------------------------- note entry --

/**
 * Turn a click on the score into either a selection or a new note.
 *
 * The pitch comes from the y within a staff region plus the clef and key in
 * force there — so clicking the top line in G major writes `fis`, not `f`,
 * which is what someone reading the key signature expects to get.
 */
function onScoreClick(event) {
  const hit = event.target.closest('[data-ev]');
  if (hit) {
    state.selectedSrc = state.layout.events[Number(hit.dataset.ev)]?.src ?? null;
    selectEvent(Number(hit.dataset.ev));
    return;
  }
  const svg = el.score.querySelector('svg');
  if (!svg || !state.layout) return;
  const rect = svg.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (state.layout.width / rect.width);
  const y = (event.clientY - rect.top) * (state.layout.height / rect.height);

  const region = state.layout.regions.find(
    (r) => y >= r.hitTop && y <= r.hitBottom && x >= r.left - 6 && x <= r.right + 6,
  );
  if (!region) return;

  const sp = region.sp;
  // pos 0 is the middle line; +1 per half space, upward.
  const pos = Math.round(((region.top + 2 * sp) - y) / (sp / 2));
  const dia = pos + clefDef(region.clef).middleDia;
  const keyAlt = keyAlterations(region.fifths);
  const base = pitchFromDiatonic(dia);
  const alter = state.accidental ?? (keyAlt.get(base.step) ?? 0);
  insertNote({ ...base, alter }, region);
}

/** Write a note (or rest) into the source at the caret. */
function insertNote(pitch, region) {
  const src = el.source.value;
  const at = insertionPoint(src);
  const prev = referencePitchBefore(at);
  const relative = /\\relative/.test(src);
  const spelling = pitch
    ? (relative ? pitchToLilyRelative(pitch, prev) : pitchToLily(pitch))
    : 'r';
  const dur = durationToLily(ticksOf(state.dur, state.dotted ? 1 : 0));
  const text = `${spelling}${dur} `;

  // A note inserted into relative music becomes the reference for what follows,
  // so the successor is re-spelled in the same edit.
  const next = pitch ? nextEventAfter(at) : null;
  const fixed = next ? respellNext(next, pitch) : null;
  if (fixed !== null && next) {
    const between = src.slice(at, next.src[0]);
    applyEdit(at, next.src[1], text + between + fixed, at + text.length - 1);
  } else {
    applyEdit(at, at, text, at + text.length - 1);
  }
  if (pitch) player.preview(midiOfPitch(pitch, region), 0.5);
}

function midiOfPitch(p, region) {
  return 12 * (p.octave + 1) + [0, 2, 4, 5, 7, 9, 11][p.step] + p.alter
    + (region ? clefDef(region.clef).sounds : 0);
}

/**
 * Where a new note goes.
 *
 * Not simply "at the caret": dropping a note inside `\rela|tive` or halfway
 * through `fis8` produces garbage. So the insertion point is nudged to the end
 * of whatever token the caret is sitting in, which is always a legal boundary.
 */
function insertionPoint(src) {
  let i = el.source.selectionEnd;
  if (i > src.length) i = src.length;
  while (i < src.length && /[^\s|]/.test(src[i])) i++;
  if (i < src.length && src[i] === ' ') i++;
  return i;
}

/**
 * The reference a relative spelling is measured from at some point in the file.
 *
 * Usually that is the previous note. At the very start of a `\relative c'`
 * block there is no previous note, and the reference is the block's own
 * argument — which is exactly the case that matters, because writing the FIRST
 * note absolutely re-anchors every note after it and silently moves the whole
 * piece an octave.
 */
function referencePitchBefore(offset) {
  if (state.layout) {
    let best = null;
    for (const ev of state.layout.events) {
      if (!ev.src || ev.rest || ev.src[1] > offset) continue;
      if (!best || ev.src[1] > best.src[1]) best = ev;
    }
    if (best?.spelled) return best.spelled;
  }
  return relativeAnchorBefore(el.source.value, offset);
}

const LETTER_INDEX = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 };

/** The pitch named by the nearest enclosing `\relative <pitch>`, if any. */
function relativeAnchorBefore(src, offset) {
  const head = src.slice(0, offset);
  const m = /\\relative\s+([a-g])((?:isis|eses|is|es)*)((?:'|,)*)/g;
  let last = null;
  for (const hit of head.matchAll(m)) last = hit;
  if (!last) return null;
  let alter = 0;
  for (const acc of last[2].match(/isis|eses|is|es/g) ?? []) {
    alter += { is: 1, es: -1, isis: 2, eses: -2 }[acc];
  }
  let marks = 0;
  for (const ch of last[3]) marks += ch === "'" ? 1 : -1;
  return { step: LETTER_INDEX[last[1]], alter, octave: 3 + marks };
}

/**
 * Keep the note AFTER an edit sounding where it did.
 *
 * In relative mode a note's octave is read from the note before it, so changing
 * or inserting a note silently transposes its successor. Every edit therefore
 * re-spells the next note against the new reference: the edit does what it says
 * and nothing else. Returns the replacement text for that note, or null when
 * there is nothing to fix (absolute mode, no successor, or a successor this
 * cannot safely rewrite — a chord or a decorated note).
 */
function respellNext(nextEvent, newPrev) {
  if (!nextEvent || !newPrev || !/\\relative/.test(el.source.value)) return null;
  if (!nextEvent.spelled || nextEvent.rest) return null;
  const text = el.source.value.slice(nextEvent.src[0], nextEvent.src[1]);
  const m = /^([a-g])((?:isis|eses|is|es)*)((?:'|,)*)(.*)$/s.exec(text);
  if (!m) return null;
  return pitchToLilyRelative(nextEvent.spelled, newPrev) + m[4];
}

/** The next note event in source order after an offset. */
function nextEventAfter(offset) {
  let best = null;
  for (const ev of state.layout?.events ?? []) {
    if (!ev.src || ev.src[0] < offset) continue;
    if (!best || ev.src[0] < best.src[0]) best = ev;
  }
  return best;
}

/** One text edit, undoable, with the caret placed and the score redrawn. */
function applyEdit(from, to, text, caret) {
  el.source.focus({ preventScroll: true });
  el.source.setSelectionRange(from, to);
  // execCommand('insertText') is deprecated but it is the only way to write to
  // a textarea and keep the browser's native undo stack. Losing ctrl-Z on a
  // notation editor would be a far worse bug than using a deprecated call, and
  // the fallback below keeps it working if a browser ever drops it.
  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch { ok = false; }
  if (!ok) {
    const v = el.source.value;
    el.source.value = v.slice(0, from) + text + v.slice(to);
  }
  const c = caret ?? from + text.length;
  el.source.setSelectionRange(c, c);
  scheduleRender(true);
  scrollCaretIntoView();
}

/** Move the selected note by one diatonic step, rewriting its source text. */
function nudgeSelected(steps) {
  const ev = state.layout?.events[state.selected];
  if (!ev || ev.rest || !ev.spelled) return;
  const src = el.source.value;
  const text = src.slice(ev.src[0], ev.src[1]);
  // Only a single note is safely transposable this way; a chord or a decorated
  // note is left alone rather than mangled.
  const m = /^([a-g])((?:isis|eses|is|es)*)((?:'|,)*)(.*)$/s.exec(text);
  if (!m) { toast('select a single note to move it'); return; }

  const region = state.layout.regions.find((r) => r.staff === (ev.staff ?? 0)) ?? state.layout.regions[0];
  const dia = ev.spelled.octave * 7 + ev.spelled.step + steps;
  const target = pitchFromDiatonic(dia);
  const keyAlt = keyAlterations(region?.fifths ?? 0);
  target.alter = keyAlt.get(target.step) ?? 0;

  const relative = /\\relative/.test(src);
  const prev = referencePitchBefore(ev.src[0]);
  const spelling = relative ? pitchToLilyRelative(target, prev) : pitchToLily(target);
  const rest = m[4];
  state.selectedSrc = [ev.src[0], ev.src[0] + spelling.length + rest.length];

  const next = nextEventAfter(ev.src[1]);
  const fixed = next ? respellNext(next, target) : null;
  if (fixed !== null && next) {
    const between = src.slice(ev.src[1], next.src[0]);
    applyEdit(ev.src[0], next.src[1], spelling + rest + between + fixed, ev.src[0]);
  } else {
    applyEdit(ev.src[0], ev.src[1], spelling + rest, ev.src[0]);
  }
  player.preview(midiOfPitch(target, region), 0.5);
  toast(spell(target), 900);
}

function deleteSelected() {
  const ev = state.layout?.events[state.selected];
  if (!ev) return;
  const src = el.source.value;
  let to = ev.src[1];
  while (to < src.length && src[to] === ' ') to++;
  state.selectedSrc = null;
  state.selected = null;

  // Removing a note hands its reference back to the note before it, so the
  // successor is re-spelled against that instead — same reason as insertion.
  const next = nextEventAfter(to);
  const fixed = next ? respellNext(next, referencePitchBefore(ev.src[0])) : null;
  if (fixed !== null && next) {
    applyEdit(ev.src[0], next.src[1], src.slice(to, next.src[0]) + fixed, ev.src[0]);
  } else {
    applyEdit(ev.src[0], to, '');
  }
}

// -------------------------------------------------------------- playback --

function togglePlay() {
  if (player.playing) {
    player.stop();
    setPlayingUI(false);
    return;
  }
  if (!state.perf?.events.length) { toast('nothing to play yet'); return; }
  warnAboutSilentSwitchOnce();
  const from = state.selected != null ? startSecondsOfSelection() : 0;
  player.patch = PATCHES[el.patch.value] ?? PATCHES.piano;
  player.play(from);
  setPlayingUI(true);
}

let silentSwitchWarned = false;

/**
 * On WebKit too old for the audioSession API we cannot escape the ambient
 * category, so the silent switch mutes the speaker while headphones still play.
 * Say it once — a user who thinks the site is broken will not think to check a
 * hardware switch that Apple Music visibly ignores.
 */
function warnAboutSilentSwitchOnce() {
  if (silentSwitchWarned || !silentSwitchMayMute()) return;
  silentSwitchWarned = true;
  toast('no sound? check the silent switch — headphones play either way', 4200);
}

/** Play from the selected note, which is how anyone proofreads one phrase. */
function startSecondsOfSelection() {
  const ev = state.layout?.events[state.selected];
  if (!ev) return 0;
  const hit = state.perf.events.find((e) => e.srcTick >= ev.tick);
  return hit ? hit.at : 0;
}

function setPlayingUI(on) {
  el.play.classList.toggle('is-playing', on);
  el.play.querySelector('.btn-text').textContent = on ? 'Stop' : 'Play';
  el.play.setAttribute('aria-label', on ? 'Stop' : 'Play');
  if (!on) clearPlayhead();
}

function clearPlayhead() {
  for (const n of el.score.querySelectorAll('.is-playing')) n.classList.remove('is-playing');
  state.playingTick = null;
}

player.onTick = (elapsed) => {
  const events = state.perf?.events;
  if (!events?.length || !state.layout) return;
  let tick = null;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].at <= elapsed + 0.02) { tick = events[i].srcTick; break; }
  }
  if (tick === state.playingTick) return;
  state.playingTick = tick;
  clearPlayheadClassOnly();
  if (tick == null) return;
  let first = null;
  state.layout.events.forEach((ev, i) => {
    if (ev.tick !== tick || ev.rest) return;
    const node = el.score.querySelector(`[data-ev="${i}"]`);
    if (node) { node.classList.add('is-playing'); if (!first) first = node; }
  });
  if (first && el.follow.checked) keepInView(first);
};

function clearPlayheadClassOnly() {
  for (const n of el.score.querySelectorAll('.is-playing')) n.classList.remove('is-playing');
}

function keepInView(node) {
  const box = node.getBoundingClientRect();
  const view = el.scroll.getBoundingClientRect();
  if (box.top < view.top + 40 || box.bottom > view.bottom - 40) {
    el.scroll.scrollTop += box.top - view.top - view.height * 0.35;
  }
}

player.onEnd = () => setPlayingUI(false);

// ---------------------------------------------------------------- pieces --

function loadPiece(piece, { push = true } = {}) {
  state.title = piece.title || 'Untitled';
  state.rkey = piece.rkey ?? null;
  state.selected = null;
  state.selectedSrc = null;
  state.tempoOverride = null;
  el.source.value = piece.source;
  el.source.setSelectionRange(0, 0);
  player.stop();
  setPlayingUI(false);
  scheduleRender(true);
  el.scroll.scrollTop = 0;
  if (push && piece.id) {
    history.replaceState(null, '', `#${encodeURIComponent(piece.id)}`);
  }
}

function fillPieceSelect() {
  el.pieceSelect.innerHTML = '';
  const lib = document.createElement('optgroup');
  lib.label = 'library';
  for (const p of LIBRARY) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.title;
    lib.appendChild(o);
  }
  el.pieceSelect.appendChild(lib);
  const mine = document.createElement('optgroup');
  mine.label = 'published';
  mine.id = 'og-mine';
  el.pieceSelect.appendChild(mine);
}

// --------------------------------------------------------------- exports --

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const slug = (s) => (s || 'score').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'score';

function exportLy() {
  download(new Blob([el.source.value], { type: 'text/plain;charset=utf-8' }), `${slug(state.title)}.ly`);
}

function exportSvg() {
  const svg = el.score.querySelector('svg');
  if (!svg) return;
  const clone = svg.cloneNode(true);
  // The page's stylesheet is not coming with it, so the standalone file carries
  // its own — otherwise every stem and beam exports invisible.
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `
    svg { color:#111; font-family: Georgia, "Times New Roman", serif; background:#fff; }
    text { fill: currentColor; }
    .cf-staffline,.cf-ledger,.cf-stem,.cf-barline,.cf-tie,.cf-slur,
    .cf-volta,.cf-brace,.cf-tupletbracket { stroke: currentColor; }
    .cf-beam,.cf-repeatdot { fill: currentColor; }
    .cf-title { font-weight:600 } .cf-subtitle,.cf-composer { font-style:italic }
    .cf-timesig { font-weight:600 } .cf-dyn { font-style:italic; font-weight:700 }
    .cf-tupletnum,.cf-text,.cf-voltanum { font-style:italic }
    .is-playing,.is-selected { color:#111 }`;
  clone.insertBefore(style, clone.firstChild);
  const text = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
  download(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }), `${slug(state.title)}.svg`);
}

function exportMidi() {
  if (!state.score || !state.flat) return;
  const bytes = writeMidi(state.score, state.flat, {
    patch: el.patch.value,
    bpm: state.tempoOverride ?? state.score.tempo.bpm,
    unit: state.score.tempo.unit,
  });
  download(new Blob([bytes], { type: 'audio/midi' }), `${slug(state.title)}.mid`);
}

async function exportWav() {
  if (!state.perf?.events.length) { toast('nothing to render'); return; }
  toast('rendering audio…', 60000);
  try {
    const blob = await renderWav(state.perf, el.patch.value);
    download(blob, `${slug(state.title)}.wav`);
    toast('audio ready');
  } catch (err) {
    toast(`could not render audio: ${err.message}`);
  }
}

// ------------------------------------------------------------------ auth --
//
// Publishing writes ONE record to the reader's own ATProto repository. Nothing
// about a piece is stored on this site: the score lives in the author's repo,
// and this page is a viewer for it. That is the whole reason the format is
// plain text — a record anyone can fetch and any tool can read.

function updateAccountButton() {
  const user = auth.getUser();
  el.account.textContent = user ? `@${user.handle}` : 'Sign in';
}

async function publish() {
  const user = auth.getUser();
  if (!user) { openAccount(); return; }
  const title = state.title?.trim() || 'Untitled';
  const record = {
    $type: COLLECTION,
    title,
    composer: state.score?.composer || undefined,
    format: 'lilypond',
    source: el.source.value,
    createdAt: new Date().toISOString(),
  };
  try {
    if (!auth.hasScope(COLLECTION)) await auth.ensureScope([COLLECTION]);
    const res = state.rkey
      ? await auth.pds.putRecord(COLLECTION, state.rkey, record)
      : await auth.pds.createRecord(COLLECTION, record);
    const uri = res?.uri || '';
    state.rkey = uri.split('/').pop() || state.rkey;
    toast(state.rkey ? 'published to your repository' : 'published');
    closeSheet();
    refreshPublished();
  } catch (err) {
    toast(`could not publish: ${err.message}`);
  }
}

async function refreshPublished() {
  const group = document.getElementById('og-mine');
  if (!group || !auth.getUser()) return;
  try {
    const res = await auth.pds.listRecords(COLLECTION, 60);
    group.innerHTML = '';
    for (const r of res?.records ?? []) {
      const o = document.createElement('option');
      o.value = `at:${r.uri}`;
      o.textContent = r.value?.title || '(untitled)';
      group.appendChild(o);
    }
  } catch { /* not signed in, or no records yet — the group just stays empty */ }
}

/**
 * Resolve a handle or DID to the PDS that holds its records.
 *
 * Both hops are public and CORS-open: the appview resolves a handle to a DID,
 * and plc.directory (or the domain itself, for did:web) names the PDS.
 */
async function resolveRepo(idOrHandle) {
  let did = idOrHandle;
  if (!did.startsWith('did:')) {
    const r = await fetch('https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle'
      + `?handle=${encodeURIComponent(did)}`);
    if (!r.ok) throw new Error(`no such handle: ${idOrHandle}`);
    did = (await r.json()).did;
  }
  const docUrl = did.startsWith('did:web:')
    ? `https://${did.slice(8).replace(/:/g, '/')}/.well-known/did.json`
    : `https://plc.directory/${did}`;
  const doc = await (await fetch(docUrl)).json();
  const svc = (doc.service || []).find((x) => /PersonalDataServer/i.test(x.type || ''))
    || (doc.service || [])[0];
  if (!svc?.serviceEndpoint) throw new Error('that identity names no data server');
  return { did, pds: svc.serviceEndpoint.replace(/\/$/, '') };
}

/**
 * Open a score from an `at://` URI.
 *
 * Read PUBLICLY, through the author's own PDS, rather than through this site's
 * authenticated proxy. The proxy can only reach the signed-in user's own repo —
 * so routing shared links through it meant a published score opened for its
 * author and for nobody else, which is not publishing at all. Anyone can read
 * a public record on ATProto without an account, and now this does.
 */
async function openAtUri(uri) {
  try {
    // Strip the scheme ONCE. Doing it in two steps — `/^at:/` and then
    // `'at://'` — leaves the two slashes behind, so `split('/')` yields two
    // empty leading fields and every part lands one place late: the DID is read
    // as the record key and nothing resolves. This is why an at:// link had
    // never actually opened one.
    const parts = String(uri).trim().replace(/^at:\/\//, '').split('/').filter(Boolean);
    const [who, collection, rkey] = [parts[0], parts[1] || COLLECTION, parts[2]];
    if (!rkey) throw new Error('that at:// URI names no record');
    const { did, pds } = await resolveRepo(who);
    const url = `${pds}/xrpc/com.atproto.repo.getRecord`
      + `?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}`
      + `&rkey=${encodeURIComponent(rkey)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`the author's server answered ${res.status}`);
    const v = (await res.json())?.value;
    if (!v?.source) throw new Error('that record holds no score');
    // Only claim it as YOURS — and so let a later publish overwrite it — when
    // it actually is. Otherwise this is a read of someone else's work.
    const mine = auth.getUser()?.did === did;
    loadPiece({ title: v.title || 'Untitled', source: v.source, rkey: mine ? rkey : null },
      { push: false });
    const by = v.composer ? ` · ${v.composer}` : '';
    toast(`opened “${v.title || 'Untitled'}”${by}${mine ? '' : ' (read-only copy — publishing saves it to your own repository)'}`, 6000);
  } catch (err) {
    toast(`could not open: ${err.message}`);
  }
}

// ----------------------------------------------------------------- sheets --

function openSheet(title, build) {
  el.sheetTitle.textContent = title;
  el.sheetBody.innerHTML = '';
  build(el.sheetBody);
  el.sheet.hidden = false;
  el.sheet.querySelector('button, input, select')?.focus();
}
function closeSheet() { el.sheet.hidden = true; }

function openExport() {
  openSheet('Export', (body) => {
    const menu = document.createElement('div');
    menu.className = 'menu';
    const item = (label, note, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<b>${label}</b><span>${note}</span>`;
      b.addEventListener('click', () => { closeSheet(); fn(); });
      menu.appendChild(b);
    };
    item('.ly', 'the source, exactly as you see it — LilyPond will engrave it too', exportLy);
    item('.mid', 'MIDI, for a DAW or another notation editor', exportMidi);
    item('.svg', 'the engraving as vector art, for a document or a poster', exportSvg);
    item('.wav', 'the preview rendered to audio', exportWav);
    item('print', 'the score alone, at page width', () => window.print());
    body.appendChild(menu);

    const p = document.createElement('p');
    p.style.marginTop = '14px';
    p.innerHTML = 'Publishing puts the piece in <b>your</b> ATProto repository, not on this server. '
      + 'Anyone can then fetch it, and you can delete it from your own account.';
    body.appendChild(p);
    const pub = document.createElement('button');
    pub.className = 'btn btn-primary';
    pub.type = 'button';
    pub.textContent = auth.getUser() ? 'Publish to my repository' : 'Sign in to publish';
    pub.addEventListener('click', publish);
    body.appendChild(pub);
  });
}

function openAccount() {
  const user = auth.getUser();
  openSheet(user ? 'Your account' : 'Sign in', (body) => {
    if (user) {
      const p = document.createElement('p');
      p.innerHTML = `Signed in as <b>@${user.handle}</b>. Scores you publish are written to your `
        + 'own repository as <code>com.minomobi.clef.piece</code> records.';
      body.appendChild(p);

      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = '<label class="field"><span class="field-label">open an at:// score</span>'
        + '<input id="at-uri" type="text" placeholder="at://did:plc:…/com.minomobi.clef.piece/…"></label>';
      const go = document.createElement('button');
      go.className = 'btn';
      go.type = 'button';
      go.textContent = 'Open';
      go.addEventListener('click', () => {
        const v = document.getElementById('at-uri').value.trim();
        if (v) { closeSheet(); openAtUri(v); }
      });
      row.appendChild(go);
      body.appendChild(row);

      const out = document.createElement('button');
      out.className = 'btn';
      out.type = 'button';
      out.textContent = 'Sign out';
      out.addEventListener('click', async () => {
        await auth.logout();
        updateAccountButton();
        closeSheet();
      });
      body.appendChild(out);
      return;
    }

    const p = document.createElement('p');
    p.innerHTML = 'You do not need an account to read, write, play or download anything here — '
      + 'signing in only adds the ability to <b>publish a score to your own ATProto repository</b>, '
      + 'where it stays yours.';
    body.appendChild(p);

    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = '<label class="field"><span class="field-label">Bluesky handle</span>'
      + '<input id="handle" type="text" placeholder="you.bsky.social" autocapitalize="off" autocorrect="off"></label>';
    const go = document.createElement('button');
    go.className = 'btn btn-primary';
    go.type = 'button';
    go.textContent = 'Sign in';
    const start = async () => {
      const handle = document.getElementById('handle').value.trim().replace(/^@/, '');
      if (!handle) return;
      try {
        await auth.login(handle, { scope: `atproto repo:${COLLECTION}` });
      } catch (err) {
        toast(`sign-in failed: ${err.message}`);
      }
    };
    go.addEventListener('click', start);
    row.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
    row.appendChild(go);
    body.appendChild(row);
  });
}

function openLibrary() {
  openSheet('Start from', (body) => {
    const list = document.createElement('div');
    list.className = 'piece-list';
    const blank = document.createElement('button');
    blank.type = 'button';
    blank.innerHTML = '<b>Blank staff</b><span>an empty bar in C major, 4/4</span>';
    blank.addEventListener('click', () => {
      closeSheet();
      loadPiece({
        id: null,
        title: 'Untitled',
        source: '\\header {\n  title = "Untitled"\n  composer = ""\n}\n\n'
          + '\\score {\n  \\new Staff \\relative c\' {\n    \\clef treble\n    \\key c \\major\n'
          + '    \\time 4/4\n    \\tempo 4 = 90\n\n    c4 d e f | g1\n  }\n}\n',
      });
    });
    list.appendChild(blank);
    for (const p of LIBRARY) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<b>${p.title}</b><span>${p.blurb}</span>`;
      b.addEventListener('click', () => { closeSheet(); loadPiece(p); el.pieceSelect.value = p.id; });
      list.appendChild(b);
    }
    body.appendChild(list);
  });
}

/**
 * The Mutopia explorer.
 *
 * Two levels: composers, then that composer's catalogue. Everything is fetched
 * through this site's own worker (mutopiaproject.org sends no CORS header) and
 * cached there for an hour, so browsing costs the archive one request per
 * composer per hour rather than one per visitor.
 *
 * Nothing fetched is ever inserted as HTML — every field goes in through
 * textContent. See the note at the top of mutopia.js.
 */
let composerCache = null;
const pieceCache = new Map();

function openBrowse() {
  openSheet('The Mutopia Project', (body) => {
    const intro = document.createElement('p');
    intro.textContent = 'Around 2,300 public-domain scores kept as LilyPond source — '
      + 'so they open here as music you can edit, hear and export, not as a picture of music.';
    body.appendChild(intro);

    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'browse-search';
    search.placeholder = 'Filter composers…';
    search.setAttribute('aria-label', 'Filter composers');
    body.appendChild(search);

    const list = document.createElement('div');
    list.className = 'piece-list browse-list';
    body.appendChild(list);

    const note = document.createElement('p');
    note.className = 'browse-note';
    body.appendChild(note);

    const render = (composers, filter) => {
      const q = filter.trim().toLowerCase();
      const shown = q
        ? composers.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
        : composers;
      list.textContent = '';
      for (const c of shown.slice(0, 400)) {
        const b = document.createElement('button');
        b.type = 'button';
        const n = document.createElement('b');
        n.textContent = c.name;
        const sub = document.createElement('span');
        sub.textContent = c.code;
        b.append(n, sub);
        b.addEventListener('click', () => openComposer(c));
        list.appendChild(b);
      }
      note.textContent = shown.length
        ? `${shown.length} composer${shown.length === 1 ? '' : 's'}`
        : 'no composer of that name in the archive';
    };

    const load = async () => {
      note.textContent = 'reading the archive…';
      try {
        composerCache = composerCache || await listComposers();
        render(composerCache, search.value);
      } catch (err) {
        note.textContent = `could not reach the archive: ${err.message}`;
      }
    };
    search.addEventListener('input', () => composerCache && render(composerCache, search.value));
    load();
  });
}

function openComposer(composer) {
  openSheet(composer.name, (body) => {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn btn-quiet browse-back';
    back.textContent = '‹ all composers';
    back.addEventListener('click', openBrowse);
    body.appendChild(back);

    const list = document.createElement('div');
    list.className = 'piece-list browse-list';
    body.appendChild(list);
    const note = document.createElement('p');
    note.className = 'browse-note';
    note.textContent = 'reading the catalogue…';
    body.appendChild(note);

    (async () => {
      let pieces;
      try {
        pieces = pieceCache.get(composer.code) || await listPieces(composer.code);
        pieceCache.set(composer.code, pieces);
      } catch (err) {
        note.textContent = `could not read the catalogue: ${err.message}`;
        return;
      }
      const openable = pieces.filter((p) => p.lyPath);
      list.textContent = '';
      for (const piece of pieces) {
        const b = document.createElement('button');
        b.type = 'button';
        const n = document.createElement('b');
        n.textContent = piece.title;
        const sub = document.createElement('span');
        // Only the facts the archive gave us, joined — a missing field just
        // drops out rather than showing as "undefined".
        sub.textContent = [piece.instrument, piece.style, piece.opus, piece.licence]
          .filter(Boolean).join(' · ');
        b.append(n, sub);
        if (piece.lyPath) {
          b.addEventListener('click', () => openMutopiaPiece(piece));
        } else {
          b.disabled = true;
          b.title = piece.multiFile
            ? 'this score is published as a zip of separate part files, which clef cannot unpack'
            : 'no LilyPond source published for this one';
          const why = document.createElement('span');
          why.className = 'browse-why';
          why.textContent = piece.multiFile ? 'multi-file' : 'no source';
          b.appendChild(why);
        }
        list.appendChild(b);
      }
      note.textContent = pieces.length
        ? `${openable.length} of ${pieces.length} open here`
        : 'nothing catalogued for this composer';
    })();
  });
}

async function openMutopiaPiece(piece) {
  closeSheet();
  toast(`fetching “${piece.title}”…`, 30000);
  try {
    const source = await fetchSource(piece.lyPath);
    loadPiece({ id: null, title: piece.title, source }, { push: false });
    const missing = missingIncludes(source);
    // Say it out loud. A piece that pulls its parts from sibling files will
    // render as whatever happened to be in the one file we fetched, and silence
    // about that is indistinguishable from the piece simply being short.
    if (missing.length) {
      toast(`opened, but this score includes ${missing.join(', ')} — that music is not here`, 8000);
    } else {
      // Report the licence the ARCHIVE gave for this piece. Much of Mutopia is
      // public domain and a good deal of it is Creative Commons; saying "public
      // domain" over a CC BY-SA edition is a false statement about someone
      // else's terms, and the archive already told us the right answer.
      const terms = piece.licence ? `${piece.licence}` : 'see the Mutopia entry for terms';
      toast(`opened “${piece.title}” — ${terms}, via the Mutopia Project`, 6000);
    }
  } catch (err) {
    toast(`could not open that piece: ${err.message}`);
  }
}

function openAbout() {
  openSheet('About clef', (body) => {
    body.innerHTML = `
      <p><b>clef</b> reads a working subset of <b>LilyPond</b> — the open-source
      music engraving language — and draws it as classical notation, in the
      browser, with no font to download and no server to ask. Everything on this
      page is computed from the text on the left.</p>

      <p>Sheet music locked inside a proprietary file is sheet music that outlives
      neither its program nor its author. Plain text does not have that problem:
      you can diff it, email it, keep it in git, and read it in fifty years.</p>

      <h3>Where the music comes from</h3>
      <p><b>Browse</b> opens the <b>Mutopia Project</b> — around 2,300 scores kept
      as LilyPond source rather than as page images, which is why they open here
      as music you can edit, hear and export rather than as a picture. Each
      piece carries its own licence; most are public domain, some are Creative
      Commons, and clef shows you which when it opens one.</p>

      <p style="color:var(--ink-faint);font-size:12px">To be clear about the
      thing itself: LilyPond is a <b>program</b>, not a network. It has no API,
      no accounts and no records to browse. What exists is the corpus written in
      its language, and Mutopia is the largest free one.</p>

      <h3>What it reads</h3>
      <dl>
        <dt>pitches</dt><dd><code>c d e fis bes</code>, octaves with <code>'</code> and <code>,</code>, and <code>\\relative</code> / <code>\\fixed</code> / absolute modes</dd>
        <dt>alphabets</dt><dd>Dutch (the default), plus <code>\\language "english"</code> and <code>"deutsch"</code>. An alphabet it cannot read is refused rather than guessed at</dd>
        <dt>transposition</dt><dd><code>\\transpose c c''</code>, applied to notes and to the key signature</dd>
        <dt>ornaments</dt><dd><code>\\grace</code>, <code>\\appoggiatura</code>, <code>\\acciaccatura</code> — drawn small, taking no time from the bar</dd>
        <dt>rhythm</dt><dd><code>1 2 4 8 16 32</code>, dots, <code>\\tuplet 3/2</code>, ties <code>~</code></dd>
        <dt>structure</dt><dd><code>\\clef \\key \\time \\partial \\tempo \\repeat volta \\bar</code>, bar checks with <code>|</code></dd>
        <dt>polyphony</dt><dd>chords <code>&lt;c e g&gt;</code>, voices <code>&lt;&lt; … \\\\ … &gt;&gt;</code>, several staves, <code>\\new PianoStaff</code></dd>
        <dt>marks</dt><dd>slurs <code>( )</code>, beams <code>[ ]</code>, dynamics <code>\\f \\pp</code>, articulations <code>-. -&gt; \\fermata</code></dd>
      </dl>

      <h3>What it does not</h3>
      <p>Lyrics and layout overrides (<code>\\override</code>, <code>\\set</code>,
      <code>\\tweak</code>) are read and discarded — that is the part of LilyPond
      this is not. Cross-staff beaming, hairpins and voice-collision resolution
      are not drawn. Repeat playback ignores <code>\\alternative</code> endings
      and plays straight through.</p>
      <p>On a complicated score from the archive you may see bar checks fail in
      the panel under the source. That is the file's <code>|</code> marks
      disagreeing with what this reader made of the bar, and it is reported
      rather than hidden — an engraving that quietly disagrees with its source
      is worse than one that says so.</p>

      <h3>The empty staff</h3>
      <p>A one-staff score is drawn on a grand staff, with an empty partner
      below, because that is what piano paper looks like whether or not the left
      hand is playing. For a single-line instrument — a song, a flute part —
      turn <b>grand staff</b> off in the bar above the score.</p>

      <h3>Keys</h3>
      <dl>
        <dt>space</dt><dd>play / stop (from the selected note, if there is one)</dd>
        <dt>1 2 4 8 6</dt><dd>whole, half, quarter, eighth, sixteenth</dd>
        <dt>. </dt><dd>dotted on / off</dd>
        <dt>alt + ↑ ↓</dt><dd>move the selected note by a step (plain arrows still move the caret)</dd>
        <dt>⌫</dt><dd>delete the selected note</dd>
      </dl>

      <h3>Where the music goes</h3>
      <p>Nowhere, unless you say so. Your draft is kept in this browser only.
      <b>Publish</b> writes the score to your own ATProto repository as a
      <code>com.minomobi.clef.piece</code> record — this site keeps no copy and
      can not delete it for you.</p>

      <p style="color:var(--ink-faint);font-size:12px">
      The bundled pieces are public domain. <code>clef</code> is not affiliated with
      the LilyPond project; it reads the language, it is not that program.</p>`;
  });
}

// ------------------------------------------------------------------ wire --

function wire() {
  el.source.addEventListener('input', () => scheduleRender());
  el.source.addEventListener('scroll', () => { el.gutter.scrollTop = el.source.scrollTop; });
  el.source.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      applyEdit(el.source.selectionStart, el.source.selectionEnd, '  ');
    }
  });

  el.score.addEventListener('click', onScoreClick);
  el.play.addEventListener('click', togglePlay);

  el.patch.addEventListener('change', () => {
    player.patch = PATCHES[el.patch.value] ?? PATCHES.piano;
    savePrefs({ patch: el.patch.value });
  });
  el.tempo.addEventListener('input', () => {
    state.tempoOverride = Number(el.tempo.value);
    el.tempoOut.textContent = el.tempo.value;
    scheduleRender(true);
  });
  el.zoom.addEventListener('input', () => {
    savePrefs({ zoom: el.zoom.value });
    scheduleRender(true);
  });

  el.pieceSelect.addEventListener('change', () => {
    const v = el.pieceSelect.value;
    if (v.startsWith('at:')) openAtUri(v);
    else loadPiece(byId(v));
  });

  el.grand.addEventListener('change', () => {
    savePrefs({ grand: el.grand.checked });
    scheduleRender(true);
  });

  $('btn-browse').addEventListener('click', openBrowse);
  $('btn-new').addEventListener('click', openLibrary);
  $('btn-export').addEventListener('click', openExport);
  $('btn-about').addEventListener('click', openAbout);
  el.account.addEventListener('click', openAccount);
  $('sheet-close').addEventListener('click', closeSheet);
  el.sheet.addEventListener('click', (e) => { if (e.target === el.sheet) closeSheet(); });

  el.palette.addEventListener('click', (e) => {
    const b = e.target.closest('.pbtn');
    if (!b) return;
    if (b.dataset.dur) {
      state.dur = Number(b.dataset.dur);
      for (const o of el.palette.querySelectorAll('[data-dur]')) o.classList.toggle('is-on', o === b);
    } else if (b.dataset.toggle === 'dot') {
      state.dotted = !state.dotted;
      b.classList.toggle('is-on', state.dotted);
    } else if (b.dataset.acc !== undefined) {
      const v = Number(b.dataset.acc);
      state.accidental = state.accidental === v ? null : v;
      for (const o of el.palette.querySelectorAll('[data-acc]')) {
        o.classList.toggle('is-on', state.accidental !== null && Number(o.dataset.acc) === state.accidental);
      }
    } else if (b.dataset.insert === 'rest') {
      insertNote(null, null);
    } else if (b.dataset.insert === 'bar') {
      const at = insertionPoint(el.source.value);
      applyEdit(at, at, '| ');
    }
  });

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => {
      for (const t of document.querySelectorAll('.tab')) {
        t.setAttribute('aria-selected', String(t === tab));
      }
      el.main.dataset.view = tab.dataset.view;
      scheduleRender(true);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSheet(); return; }
    const typing = e.target === el.source || e.target.tagName === 'INPUT';
    if (e.key === ' ' && !typing) { e.preventDefault(); togglePlay(); return; }
    if (typing && e.target !== el.source) return;

    if (state.selected != null && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      if (!e.altKey) return;          // plain arrows still move the caret
      e.preventDefault();
      nudgeSelected(e.key === 'ArrowUp' ? 1 : -1);
      return;
    }
    if (typing) return;
    if (state.selected != null && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault();
      deleteSelected();
      return;
    }
    const durKey = { 1: 1, 2: 2, 4: 4, 8: 8, 6: 16 }[e.key];
    if (durKey) {
      state.dur = durKey;
      for (const o of el.palette.querySelectorAll('[data-dur]')) {
        o.classList.toggle('is-on', Number(o.dataset.dur) === durKey);
      }
    }
    if (e.key === '.') {
      state.dotted = !state.dotted;
      el.palette.querySelector('[data-toggle="dot"]').classList.toggle('is-on', state.dotted);
    }
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => scheduleRender(true), 160);
  });
  window.addEventListener('beforeprint', () => {
    // Print at page width rather than at whatever the pane happened to be.
    if (state.score) {
      state.layout = engrave(state.score, {
        width: 1000, staffSpace: 8.5, grandStaff: el.grand.checked,
      });
      el.score.innerHTML = state.layout.svg;
      el.score.style.width = `${state.layout.width}px`;
    }
  });
  window.addEventListener('afterprint', () => scheduleRender(true));
}

// ------------------------------------------------------------------ boot --

function boot() {
  // The brand mark is the same G clef the engraver draws — one source, so the
  // logo can never drift from the notation.
  const mark = document.getElementById('brand-clef');
  if (mark) mark.outerHTML = glyphSVG('gClef', 3, 27, 5.6);

  for (const [id, p] of Object.entries(PATCHES)) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = p.label;
    el.patch.appendChild(o);
  }
  fillPieceSelect();

  const prefs = loadPrefs();
  if (prefs.patch && PATCHES[prefs.patch]) el.patch.value = prefs.patch;
  // A phone gets a smaller staff by default: at the desktop size a 400px page
  // fits two bars to a system, which is a scroll rather than a score. The
  // slider still wins once the reader has touched it.
  if (prefs.grand === false) el.grand.checked = false;
  if (prefs.zoom) el.zoom.value = prefs.zoom;
  else if (window.matchMedia('(max-width: 560px)').matches) el.zoom.value = '7';
  player.patch = PATCHES[el.patch.value] ?? PATCHES.piano;

  wire();

  // What to open: a hash, then a saved draft, then the tour.
  const hash = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { draft = null; }

  if (hash.startsWith('at://')) {
    loadPiece(byId(DEFAULT_PIECE), { push: false });
    openAtUri(hash);
  } else if (hash && LIBRARY.some((p) => p.id === hash)) {
    const p = byId(hash);
    loadPiece(p, { push: false });
    el.pieceSelect.value = p.id;
  } else if (draft?.src?.trim()) {
    loadPiece({ id: null, title: draft.title || 'Untitled', source: draft.src, rkey: draft.rkey }, { push: false });
  } else {
    const p = byId(DEFAULT_PIECE);
    loadPiece(p, { push: false });
    el.pieceSelect.value = p.id;
  }

  auth.onAuthChange(() => { updateAccountButton(); refreshPublished(); });
  auth.init().then(() => { updateAccountButton(); refreshPublished(); }).catch(() => updateAccountButton());
}

boot();

export { WHOLE };
