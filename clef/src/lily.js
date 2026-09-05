// lily.js — a parser for a working subset of LilyPond input.
//
// WHY A PARSER AND NOT A JSON FORMAT: sheet music that lives in a proprietary
// binary is sheet music you can't diff, can't grep, can't email, and can't
// outlive the program that wrote it. LilyPond's input language is the closest
// thing this field has to a lingua franca for plain-text scores, and there is a
// real public-domain corpus written in it (Mutopia and the like). So `clef`
// reads that language rather than inventing a ninth one.
//
// WHAT THIS IS NOT: LilyPond proper is a Scheme-extensible typesetting system
// with a decade of engraving research inside it. This is a *reader* for the
// notation subset — pitches, durations, clefs, keys, metres, chords, tuplets,
// ties, slurs, beams, dynamics, articulations, repeats, multiple staves and
// voices. Anything it cannot read it reports as a diagnostic rather than
// dropping on the floor, because a note that silently vanishes is worse than an
// error message.
//
// The parser is a character-level recursive descent rather than a token stream,
// because LilyPond is context-sensitive in ways that fight tokenisation: `<`
// opens a chord but `<<` opens parallel music; `4` is a duration after a note
// and a numerator after `\time`; a bare `4.` is a dotted quarter but `4 . 5`
// never occurs. Reading characters with the grammar in hand sidesteps all of it.
//
// Every event carries `src: [start, end]` — its byte range in the input. That
// is what makes the editor and the engraving two views of one document: click a
// notehead, the caret lands on the note that drew it.

import { PPQ, WHOLE, ticksOf, fifthsOf, noteValue } from './model.js';

const LETTERS = 'cdefgab';

// Articulation shorthands. LilyPond writes these as `-.`, `->` and so on, where
// the leading character is the DIRECTION (`-` neutral, `^` above, `_` below).
const SHORT_ARTIC = { '.': 'staccato', '>': 'accent', '-': 'tenuto', '!': 'staccatissimo', '_': 'portato', '+': 'stopped' };
const NAMED_ARTIC = new Set([
  'staccato', 'accent', 'tenuto', 'staccatissimo', 'marcato', 'portato',
  'fermata', 'shortfermata', 'longfermata', 'trill', 'prall', 'mordent',
  'turn', 'upbow', 'downbow', 'thumb', 'open', 'stopped', 'flageolet',
  'segno', 'coda', 'espressivo',
]);
const DYNAMICS = new Set([
  'ppppp', 'pppp', 'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'ffff', 'fffff',
  'fp', 'sf', 'sff', 'sfz', 'sp', 'spp', 'rfz', 'n',
]);
// Commands that open a music expression. parseItem defers these to parseMusic.
const MUSIC_COMMANDS = new Set([
  'relative', 'absolute', 'fixed', 'new', 'context', 'repeat', 'alternative',
  'tuplet', 'times', 'grace', 'acciaccatura', 'appoggiatura', 'afterGrace',
  'transpose', 'addlyrics', 'lyricmode', 'lyricsto',
]);

// Contexts that mean "a new staff starts here" vs. ones that only group.
const STAFF_CONTEXTS = new Set(['Staff', 'DrumStaff', 'RhythmicStaff', 'TabStaff', 'Lyrics']);
const GROUP_CONTEXTS = new Set(['PianoStaff', 'StaffGroup', 'ChoirStaff', 'GrandStaff', 'Score']);

export class ParseError extends Error {}

class Reader {
  constructor(src) {
    this.src = src;
    this.i = 0;
    this.diagnostics = [];
    this.defs = new Map();      // identifier -> parsed music node
    this.header = {};
    this.depth = 0;
  }

  warn(message, at = this.i, severity = 'warning') {
    // One diagnostic per site is plenty; a malformed file should not produce a
    // thousand identical lines that bury the first real problem.
    if (this.diagnostics.length < 60) this.diagnostics.push({ severity, message, at });
  }

  get done() { return this.i >= this.src.length; }
  peek(k = 0) { return this.src[this.i + k]; }

  /** Skip whitespace and both comment forms. */
  ws() {
    for (;;) {
      const c = this.src[this.i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { this.i++; continue; }
      if (c === '%') {
        if (this.src[this.i + 1] === '{') {
          const end = this.src.indexOf('%}', this.i + 2);
          this.i = end === -1 ? this.src.length : end + 2;
        } else {
          const nl = this.src.indexOf('\n', this.i);
          this.i = nl === -1 ? this.src.length : nl + 1;
        }
        continue;
      }
      return;
    }
  }

  eat(s) {
    this.ws();
    if (this.src.startsWith(s, this.i)) { this.i += s.length; return true; }
    return false;
  }

  /** A bare word: an identifier, context name or keyword. */
  word() {
    this.ws();
    const m = /^[A-Za-z][A-Za-z0-9_-]*/.exec(this.src.slice(this.i));
    if (!m) return null;
    this.i += m[0].length;
    return m[0];
  }

  /** `\command` — returns the name without the backslash. */
  command() {
    this.ws();
    if (this.src[this.i] !== '\\') return null;
    const save = this.i;
    this.i++;
    const w = this.word();
    if (!w) { this.i = save; return null; }
    return w;
  }

  number() {
    this.ws();
    const m = /^-?\d+(\.\d+)?/.exec(this.src.slice(this.i));
    if (!m) return null;
    this.i += m[0].length;
    return Number(m[0]);
  }

  string() {
    this.ws();
    if (this.src[this.i] !== '"') return null;
    this.i++;
    let out = '';
    while (this.i < this.src.length && this.src[this.i] !== '"') {
      if (this.src[this.i] === '\\') { out += this.src[this.i + 1] ?? ''; this.i += 2; continue; }
      out += this.src[this.i++];
    }
    this.i++; // closing quote
    return out;
  }
}

// ------------------------------------------------------------- the parser --

/**
 * Parse LilyPond source into a score.
 *
 * Returns `{ title, composer, subtitle, tempo, staves, diagnostics }` where
 * each staff is `{ name, voices: [ Event[] ] }`. Never throws on bad input:
 * whatever it could read comes back, with the rest reported in `diagnostics`.
 */
export function parseLily(source) {
  const r = new Reader(String(source ?? ''));
  const top = [];

  // ---- top level: \version, \header, definitions, \score, or bare music ----
  let guard = 0;
  while (!r.done && guard++ < 10000) {
    r.ws();
    if (r.done) break;

    // `name = music` — LilyPond's variable definition. Real scores lean on
    // these heavily (`soprano = \relative c' { ... }`), so a reader that skips
    // them can't open most of the corpus.
    const save = r.i;
    const w = r.word();
    if (w) {
      const after = r.i;
      r.ws();
      if (r.peek() === '=') {
        r.i++;
        const v = parseAssignable(r);
        r.defs.set(w, v);
        continue;
      }
      r.i = after === r.i ? save : save;
    }

    if (r.peek() === '\\') {
      const at = r.i;
      const cmd = r.command();
      if (cmd === 'version' || cmd === 'language' || cmd === 'include') { r.string(); continue; }
      if (cmd === 'header') { parseHeader(r); continue; }
      if (cmd === 'paper' || cmd === 'layout' || cmd === 'midi') { skipBlock(r); continue; }
      if (cmd === 'score' || cmd === 'book' || cmd === 'bookpart') {
        const inner = parseScoreBlock(r);
        if (inner) top.push(inner);
        continue;
      }
      r.i = at;
      const node = parseMusic(r);
      if (node) top.push(node); else { r.i = at + 1; }
      continue;
    }

    if (r.peek() === '{' || (r.peek() === '<' && r.peek(1) === '<')) {
      const node = parseMusic(r);
      if (node) top.push(node);
      continue;
    }

    // Nothing recognised here — step past one character so we always advance.
    r.warn(`unexpected ${JSON.stringify(r.peek())}`, r.i);
    r.i++;
  }

  // A file that only defines variables (no \score, no bare music) still has a
  // score in it — use the definitions in the order they were written.
  let root = top.length === 1 ? top[0] : { t: 'seq', items: top };
  if (top.length === 0 && r.defs.size) {
    root = { t: 'par', items: [...r.defs.values()], split: false };
  }

  const staves = extractStaves(root, r);
  const tempo = findTempo(staves);
  return {
    title: r.header.title || '',
    subtitle: r.header.subtitle || '',
    composer: r.header.composer || r.header.poet || '',
    tempo,
    staves,
    diagnostics: r.diagnostics,
  };
}

function parseAssignable(r) {
  r.ws();
  if (r.peek() === '"') return { t: 'text', value: r.string() };
  if (/[0-9]/.test(r.peek() ?? '')) return { t: 'text', value: String(r.number()) };
  if (r.peek() === '#') { skipScheme(r); return { t: 'seq', items: [] }; }
  return parseMusic(r) || { t: 'seq', items: [] };
}

function parseHeader(r) {
  if (!r.eat('{')) return;
  let guard = 0;
  while (!r.done && guard++ < 500) {
    r.ws();
    if (r.eat('}')) return;
    const key = r.word();
    if (!key) { r.i++; continue; }
    r.ws();
    if (r.peek() === '=') r.i++;
    r.ws();
    if (r.peek() === '"') { r.header[key] = r.string(); continue; }
    if (r.peek() === '\\') {
      // \markup { ... } — flatten to the words inside, which is what a title is.
      const cmd = r.command();
      if (cmd === 'markup') { r.header[key] = flattenMarkup(r); continue; }
      continue;
    }
    const line = /^[^\n]*/.exec(r.src.slice(r.i))[0];
    r.i += line.length;
    r.header[key] = line.trim();
  }
}

/** Pull the plain text out of a `\markup { ... }` block. */
function flattenMarkup(r) {
  r.ws();
  if (r.peek() === '"') return r.string();
  if (!r.eat('{')) return '';
  const parts = [];
  let depth = 1;
  let guard = 0;
  while (!r.done && guard++ < 2000) {
    r.ws();
    const c = r.peek();
    if (c === '{') { depth++; r.i++; continue; }
    if (c === '}') { depth--; r.i++; if (depth === 0) break; continue; }
    if (c === '"') { parts.push(r.string()); continue; }
    if (c === '\\') { r.command(); continue; }
    const m = /^[^\s{}"\\]+/.exec(r.src.slice(r.i));
    if (m) { parts.push(m[0]); r.i += m[0].length; continue; }
    r.i++;
  }
  return parts.join(' ');
}

function skipBlock(r) {
  r.ws();
  if (r.peek() !== '{') return;
  let depth = 0;
  while (!r.done) {
    const c = r.src[r.i];
    if (c === '"') { r.string(); continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; r.i++; if (depth === 0) return; continue; }
    r.i++;
  }
}

function skipScheme(r) {
  // `#'symbol`, `#(function ...)`, `#42` — consumed and ignored. Layout tweaks
  // are exactly the part of LilyPond this reader does not implement.
  r.i++; // '#'
  r.ws();
  if (r.peek() === '(') {
    let depth = 0;
    while (!r.done) {
      const c = r.src[r.i];
      if (c === '"') { r.string(); continue; }
      if (c === '(') depth++;
      if (c === ')') { depth--; r.i++; if (depth === 0) return; continue; }
      r.i++;
    }
    return;
  }
  if (r.peek() === '"') { r.string(); return; }
  const m = /^[^\s]+/.exec(r.src.slice(r.i));
  if (m) r.i += m[0].length;
}

function parseScoreBlock(r) {
  if (!r.eat('{')) return null;
  const items = [];
  let guard = 0;
  while (!r.done && guard++ < 5000) {
    r.ws();
    if (r.eat('}')) break;
    if (r.peek() === '\\') {
      const at = r.i;
      const cmd = r.command();
      if (cmd === 'layout' || cmd === 'midi' || cmd === 'header') {
        if (cmd === 'header') parseHeader(r); else skipBlock(r);
        continue;
      }
      r.i = at;
    }
    const m = parseMusic(r);
    if (m) items.push(m); else r.i++;
  }
  return items.length === 1 ? items[0] : { t: 'par', items, split: false };
}

// -------------------------------------------------------- music expressions --

function parseMusic(r) {
  r.ws();
  if (r.done) return null;
  if (r.depth > 60) { r.warn('music nested too deeply', r.i, 'error'); return null; }

  const c = r.peek();

  if (c === '<' && r.peek(1) === '<') return parseParallel(r);
  if (c === '{') return parseSequential(r);

  if (c === '\\') {
    const at = r.i;
    const cmd = r.command();
    switch (cmd) {
      case 'relative': {
        r.ws();
        let ref = { step: 0, octave: 4 };
        const p = tryPitch(r);
        if (p) ref = { step: p.step, octave: p.octave };
        const music = parseMusic(r);
        return { t: 'relative', ref, music };
      }
      case 'absolute': return { t: 'absolute', music: parseMusic(r) };
      case 'fixed': {
        r.ws();
        const p = tryPitch(r);
        const music = parseMusic(r);
        return { t: 'fixed', ref: p ? { step: p.step, octave: p.octave } : { step: 0, octave: 4 }, music };
      }
      case 'new':
      case 'context': {
        const type = r.word() || 'Voice';
        r.ws();
        let label = '';
        if (r.peek() === '=') { r.i++; r.ws(); label = r.string() || r.word() || ''; }
        r.ws();
        if (r.src.startsWith('\\with', r.i)) { r.command(); skipBlock(r); }
        const music = parseMusic(r);
        if (STAFF_CONTEXTS.has(type)) return { t: 'staff', name: label, kind: type, music };
        if (GROUP_CONTEXTS.has(type)) return { t: 'group', kind: type, music };
        return { t: 'voice', name: label, music };
      }
      case 'repeat': {
        const kind = r.word() || 'volta';
        const times = r.number() ?? 2;
        const body = parseMusic(r);
        r.ws();
        let alternatives = null;
        if (r.src.startsWith('\\alternative', r.i)) {
          r.command();
          const alt = parseMusic(r);
          alternatives = alt && alt.t === 'seq' ? alt.items : (alt ? [alt] : []);
        }
        return { t: 'repeat', kind, times, music: body, alternatives };
      }
      case 'alternative': {
        const alt = parseMusic(r);
        return { t: 'seq', items: alt ? [alt] : [] };
      }
      case 'tuplet': {
        // \tuplet 3/2 { ... } — three notes in the time of two.
        const num = r.number() ?? 3;
        r.eat('/');
        const den = r.number() ?? 2;
        const music = parseMusic(r);
        return { t: 'tuplet', num, den, factor: den / num, music };
      }
      case 'times': {
        // \times 2/3 { ... } — the same thing, written as the factor itself.
        const num = r.number() ?? 2;
        r.eat('/');
        const den = r.number() ?? 3;
        const music = parseMusic(r);
        return { t: 'tuplet', num: den, den: num, factor: num / den, music };
      }
      case 'grace':
      case 'acciaccatura':
      case 'appoggiatura':
      case 'afterGrace': {
        const music = parseMusic(r);
        r.warn(`\\${cmd} is parsed but not engraved yet — its notes are omitted`, at);
        return { t: 'seq', items: [], dropped: music };
      }
      case 'transpose': {
        tryPitch(r); tryPitch(r);
        r.warn('\\transpose is not applied yet — music is read at written pitch', at);
        return parseMusic(r);
      }
      case 'addlyrics':
      case 'lyricmode':
      case 'lyricsto': {
        if (cmd === 'lyricsto') { r.ws(); r.string() || r.word(); }
        skipBlock(r);
        r.warn('lyrics are not engraved yet', at);
        return { t: 'seq', items: [] };
      }
      default: {
        // A user-defined identifier: `\melody` expands to what it was bound to.
        if (cmd && r.defs.has(cmd)) return { t: 'ref', name: cmd, music: r.defs.get(cmd) };
        r.i = at;
        return parseSequential(r, /* implicit */ true);
      }
    }
  }

  // A bare run of events with no braces (`c4 d e f`) is legal at top level.
  return parseSequential(r, true);
}

function parseSequential(r, implicit = false) {
  r.depth++;
  const items = [];
  if (!implicit) {
    if (!r.eat('{')) { r.depth--; return null; }
  }
  let guard = 0;
  while (!r.done && guard++ < 200000) {
    r.ws();
    if (r.done) break;
    if (r.peek() === '}') { if (!implicit) r.i++; break; }
    if (implicit && (r.peek() === '>' && r.peek(1) === '>')) break;
    if (implicit && r.src.startsWith('\\\\', r.i)) break;
    const before = r.i;
    const item = parseItem(r);
    if (item) items.push(...(Array.isArray(item) ? item : [item]));
    if (r.i === before) {
      // Nothing consumed: unknown syntax. Report once and step past it.
      r.warn(`skipped ${JSON.stringify(r.src.slice(r.i, r.i + 12))}`, r.i);
      r.i++;
    }
    // An implicit sequence ends at the next structural command. The `r.ws()` is
    // load-bearing: without it the check sees the newline after `\tempo 4 = 76`
    // rather than the `\new` on the following line, so the sequence swallows
    // every voice in the block and two-part writing silently becomes one part.
    r.ws();
    if (implicit && items.length && r.peek() === '\\' && !r.src.startsWith('\\\\', r.i)) {
      const save = r.i;
      const cmd = r.command();
      r.i = save;
      if (cmd && ['new', 'context', 'score', 'header'].includes(cmd)) break;
    }
  }
  r.depth--;
  return { t: 'seq', items };
}

function parseParallel(r) {
  r.depth++;
  r.i += 2; // '<<'
  const branches = [];
  let current = [];
  let split = false;
  let guard = 0;
  while (!r.done && guard++ < 20000) {
    r.ws();
    if (r.src.startsWith('>>', r.i)) { r.i += 2; break; }
    if (r.src.startsWith('\\\\', r.i)) {
      r.i += 2;
      split = true;
      branches.push({ t: 'seq', items: current });
      current = [];
      continue;
    }
    const before = r.i;
    const m = parseMusic(r);
    if (m) current.push(m);
    if (r.i === before) { r.warn('unterminated << >>', r.i, 'error'); r.i++; }
  }
  branches.push({ t: 'seq', items: current });
  r.depth--;

  // WITH `\\`, each branch is a voice and the grouping is the point. WITHOUT
  // it, `<< a b >>` is simply "a and b at once", and wrapping them in a single
  // sequence hides that there were two of them — which is how `<< \new Voice
  // {…} \new Voice {…} >>`, the explicit spelling of two-voice writing, ended
  // up engraved as one voice with both parts stacked in it.
  if (split) {
    const items = branches.filter((b) => b.items.length);
    return { t: 'par', items: items.length ? items : branches, split: true };
  }
  return { t: 'par', items: branches.flatMap((b) => b.items), split: false };
}

// -------------------------------------------------------------- one event --

function parseItem(r) {
  r.ws();
  const at = r.i;
  const c = r.peek();
  if (c === undefined) return null;

  if (c === '{' || (c === '<' && r.peek(1) === '<')) return parseMusic(r);

  if (c === '|') {
    r.i++;
    // `|` is a bar CHECK, not a bar line — it asserts "a measure ends here".
    return { t: 'barcheck', src: [at, r.i] };
  }
  if (c === '#') { skipScheme(r); return null; }

  if (c === '\\') return parseBackslashItem(r, at);
  if (c === '<') return parseChord(r, at);
  if (/[a-gsrRq]/.test(c)) return parseNoteLike(r, at);

  return null;
}

function parseBackslashItem(r, at) {
  if (r.src.startsWith('\\<', r.i)) { r.i += 2; return { t: 'hairpin', dir: 'cresc', src: [at, r.i] }; }
  if (r.src.startsWith('\\>', r.i)) { r.i += 2; return { t: 'hairpin', dir: 'dim', src: [at, r.i] }; }
  if (r.src.startsWith('\\!', r.i)) { r.i += 2; return { t: 'hairpin', dir: 'stop', src: [at, r.i] }; }
  if (r.src.startsWith('\\(', r.i)) { r.i += 2; return { t: 'phrase', open: true, src: [at, r.i] }; }
  if (r.src.startsWith('\\)', r.i)) { r.i += 2; return { t: 'phrase', open: false, src: [at, r.i] }; }

  const cmd = r.command();
  if (!cmd) { r.i = at + 1; return null; }

  // Some commands open a music EXPRESSION rather than set a property, and they
  // are legal anywhere a note is — `c4 \tuplet 3/2 { d8 e f } g4` is ordinary
  // writing. Hand those back to parseMusic rather than duplicating its cases;
  // forgetting to do so is why the first draft dropped every triplet on the
  // floor with a "not supported" warning.
  if (MUSIC_COMMANDS.has(cmd)) {
    r.i = at;
    return parseMusic(r);
  }

  switch (cmd) {
    case 'clef': {
      r.ws();
      const name = r.string() || r.word() || 'treble';
      return { t: 'clef', value: name.replace(/"/g, ''), src: [at, r.i] };
    }
    case 'key': {
      r.ws();
      const tonicTok = tryPitchName(r);
      r.ws();
      const mode = (r.command() || 'major').toLowerCase();
      const fifths = fifthsOf(tonicTok ?? 'c', mode);
      if (fifths === null) {
        r.warn(`unknown key \\key ${tonicTok} \\${mode}`, at);
        return null;
      }
      return { t: 'key', fifths, tonic: tonicTok ?? 'c', mode, src: [at, r.i] };
    }
    case 'time': {
      const num = r.number() ?? 4;
      r.eat('/');
      const den = r.number() ?? 4;
      return { t: 'time', num, den, src: [at, r.i] };
    }
    case 'partial': {
      const d = readDuration(r);
      return { t: 'partial', ticks: d ? d.ticks : WHOLE / 4, src: [at, r.i] };
    }
    case 'tempo': {
      r.ws();
      const text = r.peek() === '"' ? r.string() : null;
      r.ws();
      let unit = null; let bpm = null;
      if (/\d/.test(r.peek() ?? '')) {
        const d = readDuration(r);
        r.ws();
        if (r.peek() === '=') {
          r.i++;
          bpm = r.number();
          unit = d ? d.ticks : WHOLE / 4;
        }
      }
      return { t: 'tempo', text, unit, bpm, src: [at, r.i] };
    }
    case 'bar': {
      r.ws();
      const style = r.string() || '|';
      return { t: 'bar', style, src: [at, r.i] };
    }
    case 'break': return { t: 'break', src: [at, r.i] };
    case 'mark': { r.ws(); if (r.peek() === '#') skipScheme(r); else r.string(); return null; }
    case 'voiceOne': case 'voiceTwo': case 'voiceThree': case 'voiceFour':
      return { t: 'voicedir', which: cmd, src: [at, r.i] };
    case 'oneVoice': return { t: 'voicedir', which: 'oneVoice', src: [at, r.i] };
    case 'stemUp': case 'stemDown': case 'stemNeutral':
      return { t: 'stemdir', dir: cmd === 'stemUp' ? 1 : cmd === 'stemDown' ? -1 : 0, src: [at, r.i] };
    case 'cresc': return { t: 'hairpin', dir: 'cresc', src: [at, r.i] };
    case 'decresc': case 'dim': return { t: 'hairpin', dir: 'dim', src: [at, r.i] };
    case 'set': case 'override': case 'unset': case 'revert': case 'once': case 'tweak': {
      // A layout instruction. Consume to the end of the statement and move on.
      const line = /^[^\n]*/.exec(r.src.slice(r.i))[0];
      r.i += line.length;
      return null;
    }
    default: {
      if (r.defs.has(cmd)) return { t: 'ref', name: cmd, music: r.defs.get(cmd), src: [at, r.i] };
      if (DYNAMICS.has(cmd)) return { t: 'dynamic', value: cmd, src: [at, r.i] };
      if (NAMED_ARTIC.has(cmd)) return { t: 'artic', value: cmd, src: [at, r.i] };
      r.warn(`\\${cmd} is not supported`, at);
      return null;
    }
  }
}

/** A pitch NAME only (for `\key es \major`), without octave marks. */
function tryPitchName(r) {
  r.ws();
  const m = /^[a-g](?:(?:is|es|s|f)+)?/.exec(r.src.slice(r.i));
  if (!m) return null;
  r.i += m[0].length;
  return m[0];
}

/** Parse a pitch token: letter, accidental suffixes, octave marks. */
function tryPitch(r) {
  r.ws();
  const m = /^([a-g])((?:isis|eses|is|es|ih|eh)*)((?:'|,)*)(!?)(\??)/.exec(r.src.slice(r.i));
  if (!m) return null;
  r.i += m[0].length;
  const step = LETTERS.indexOf(m[1]);
  let alter = 0;
  for (const acc of m[2].match(/isis|eses|is|es|ih|eh/g) ?? []) {
    if (acc === 'is') alter += 1;
    else if (acc === 'es') alter -= 1;
    else if (acc === 'isis') alter += 2;
    else if (acc === 'eses') alter -= 2;
    // Quarter-tones (`ih`/`eh`) are read so the file parses, then rounded to
    // the nearest semitone — this notation has no quarter-tone glyphs.
  }
  let q = 0;
  for (const ch of m[3]) q += ch === "'" ? 1 : -1;
  return { step, alter, octave: 3 + q, marks: q, forced: m[4] === '!', cautionary: m[5] === '?' };
}

/** Read a duration `4`, `8.`, `16..`, `\breve`, plus any `*n/m` scaling. */
function readDuration(r) {
  r.ws();
  let base = null;
  if (r.src.startsWith('\\breve', r.i)) { r.i += 6; base = 0.5; }
  else if (r.src.startsWith('\\longa', r.i)) { r.i += 6; base = 0.25; }
  else {
    const m = /^(\d+)/.exec(r.src.slice(r.i));
    if (!m) return null;
    r.i += m[1].length;
    base = Number(m[1]);
  }
  let dots = 0;
  while (r.peek() === '.') { dots++; r.i++; }
  let scale = 1;
  while (r.peek() === '*') {
    r.i++;
    const n = r.number() ?? 1;
    let d = 1;
    if (r.peek() === '/') { r.i++; d = r.number() ?? 1; }
    scale *= n / d;
  }
  return { denom: base, dots, ticks: Math.round(ticksOf(base, dots) * scale), scale };
}

/** Trailing decorations on a note or chord: ties, slurs, beams, marks. */
function readPostfix(r, ev) {
  let guard = 0;
  while (!r.done && guard++ < 200) {
    const c = r.peek();
    if (c === ' ' || c === '\t') { r.i++; continue; }
    if (c === '~') { r.i++; ev.tie = true; continue; }
    if (c === '(') { r.i++; ev.slur = 'start'; continue; }
    if (c === ')') { r.i++; ev.slur = ev.slur === 'start' ? 'both' : 'stop'; continue; }
    if (c === '[') { r.i++; ev.beam = 'start'; continue; }
    if (c === ']') { r.i++; ev.beam = ev.beam === 'start' ? 'both' : 'stop'; continue; }
    if (c === '*') { readDuration(r); continue; }

    if (c === '-' || c === '^' || c === '_') {
      const dir = c === '^' ? 1 : c === '_' ? -1 : 0;
      const next = r.peek(1);
      if (next && SHORT_ARTIC[next] !== undefined && next !== '-') {
        r.i += 2;
        ev.artics.push({ name: SHORT_ARTIC[next], dir });
        continue;
      }
      if (c === '-' && next === '-') { r.i += 2; ev.artics.push({ name: 'tenuto', dir }); continue; }
      if (next === '"') { r.i++; ev.texts.push({ text: r.string(), dir: dir || 1 }); continue; }
      if (next === '\\') {
        const save = r.i;
        r.i++;
        const cmd = r.command();
        if (cmd === 'markup') { ev.texts.push({ text: flattenMarkup(r), dir: dir || 1 }); continue; }
        if (cmd && NAMED_ARTIC.has(cmd)) { ev.artics.push({ name: cmd, dir }); continue; }
        if (cmd && DYNAMICS.has(cmd)) { ev.dynamic = cmd; continue; }
        r.i = save;
      }
      break;
    }

    if (c === '\\') {
      const save = r.i;
      if (r.src.startsWith('\\<', r.i)) { r.i += 2; ev.hairpin = 'cresc'; continue; }
      if (r.src.startsWith('\\>', r.i)) { r.i += 2; ev.hairpin = 'dim'; continue; }
      if (r.src.startsWith('\\!', r.i)) { r.i += 2; ev.hairpin = 'stop'; continue; }
      if (r.src.startsWith('\\(', r.i)) { r.i += 2; ev.phrase = 'start'; continue; }
      if (r.src.startsWith('\\)', r.i)) { r.i += 2; ev.phrase = 'stop'; continue; }
      const cmd = r.command();
      if (cmd && DYNAMICS.has(cmd)) { ev.dynamic = cmd; continue; }
      if (cmd && NAMED_ARTIC.has(cmd)) { ev.artics.push({ name: cmd, dir: 0 }); continue; }
      r.i = save;
      break;
    }
    break;
  }
  return ev;
}

function blankEvent(at) {
  return { artics: [], texts: [], tie: false, slur: null, beam: null, dynamic: null, hairpin: null, src: [at, at] };
}

function parseNoteLike(r, at) {
  // Rests and spacers first — `r`, `R`, `s` would otherwise look like pitches.
  const c = r.peek();
  if ((c === 'r' || c === 'R' || c === 's') && !/^[a-g]/.test(c)) {
    const isWord = /^[a-zA-Z]{2,}/.test(r.src.slice(r.i));
    if (!isWord) {
      r.i++;
      const d = readDuration(r);
      const ev = blankEvent(at);
      ev.t = 'rest';
      ev.invisible = c === 's';
      ev.fullMeasure = c === 'R';
      ev.duration = d;
      readPostfix(r, ev);
      ev.src = [at, r.i];
      return ev;
    }
  }
  if (c === 'q') {
    r.i++;
    const d = readDuration(r);
    const ev = blankEvent(at);
    ev.t = 'repeatChord';
    ev.duration = d;
    readPostfix(r, ev);
    ev.src = [at, r.i];
    return ev;
  }

  const p = tryPitch(r);
  if (!p) return null;
  const d = readDuration(r);
  const ev = blankEvent(at);
  ev.t = 'note';
  ev.pitches = [p];
  ev.duration = d;
  readPostfix(r, ev);
  ev.src = [at, r.i];
  return ev;
}

function parseChord(r, at) {
  r.i++; // '<'
  const pitches = [];
  let guard = 0;
  while (!r.done && guard++ < 200) {
    r.ws();
    if (r.peek() === '>') { r.i++; break; }
    const p = tryPitch(r);
    if (!p) {
      if (r.peek() === '\\') { r.command(); continue; }   // per-note tweaks
      if (r.peek() === '-') { r.i += 2; continue; }
      r.warn('malformed chord', r.i);
      r.i++;
      continue;
    }
    // A tie may sit on an individual chord member.
    if (r.peek() === '~') { r.i++; p.tie = true; }
    pitches.push(p);
  }
  const d = readDuration(r);
  const ev = blankEvent(at);
  ev.t = 'note';
  ev.chord = true;
  ev.pitches = pitches;
  ev.duration = d;
  readPostfix(r, ev);
  ev.src = [at, r.i];
  return ev;
}

// ------------------------------------------------- flatten to timed voices --
//
// The parse tree is shaped like the source. What the engraver wants is the
// opposite: a flat list of events per voice, each with an absolute onset in
// ticks and a fully-resolved absolute pitch. This pass does that, and it is
// where relative-octave mode is resolved — necessarily left to right, because
// `\relative` means "relative to the note before", which is a reading order
// fact and not a tree fact.

class Flattener {
  constructor(reader) {
    this.r = reader;
    this.out = [];
    this.tick = 0;
    this.dur = { denom: 4, dots: 0, ticks: WHOLE / 4 }; // LilyPond durations are sticky
    this.mode = 'absolute';
    this.ref = null;
    this.tupletFactor = 1;
    this.tupletId = 0;
    this.expanding = new Set();
  }

  resolvePitch(p) {
    if (this.mode === 'relative') {
      const prev = this.ref ?? { step: 0, octave: 4 };
      let octave = prev.octave;
      const target = p.step;
      let dia = octave * 7 + target;
      const prevDia = prev.octave * 7 + prev.step;
      // Nearest octave, ties broken downward — LilyPond's "within a fourth" rule.
      while (dia - prevDia > 3) { octave--; dia -= 7; }
      while (prevDia - dia > 3) { octave++; dia += 7; }
      octave += p.marks;
      return { step: p.step, alter: p.alter, octave, forced: p.forced, cautionary: p.cautionary, tie: p.tie };
    }
    if (this.mode === 'fixed') {
      const base = this.ref ?? { step: 0, octave: 4 };
      return { step: p.step, alter: p.alter, octave: base.octave + p.marks, forced: p.forced, cautionary: p.cautionary, tie: p.tie };
    }
    return { step: p.step, alter: p.alter, octave: p.octave, forced: p.forced, cautionary: p.cautionary, tie: p.tie };
  }

  push(ev) { this.out.push(ev); }

  walk(node) {
    if (!node) return;
    switch (node.t) {
      case 'seq': for (const it of node.items) this.walk(it); return;
      case 'par': {
        // Parallel music inside one voice stream (not a `\\` voice split) is
        // simultaneous: every branch starts at the same tick.
        const start = this.tick;
        let end = start;
        for (const it of node.items) {
          this.tick = start;
          this.walk(it);
          end = Math.max(end, this.tick);
        }
        this.tick = end;
        return;
      }
      case 'ref': {
        if (this.expanding.has(node.name)) {
          this.r.warn(`\\${node.name} refers to itself`, node.src?.[0] ?? 0, 'error');
          return;
        }
        this.expanding.add(node.name);
        this.walk(node.music);
        this.expanding.delete(node.name);
        return;
      }
      case 'staff': case 'voice': case 'group': this.walk(node.music); return;
      case 'relative': {
        const savedMode = this.mode; const savedRef = this.ref;
        this.mode = 'relative';
        this.ref = { step: node.ref.step, octave: node.ref.octave };
        this.walk(node.music);
        this.mode = savedMode; this.ref = savedRef;
        return;
      }
      case 'fixed': {
        const savedMode = this.mode; const savedRef = this.ref;
        this.mode = 'fixed'; this.ref = node.ref;
        this.walk(node.music);
        this.mode = savedMode; this.ref = savedRef;
        return;
      }
      case 'absolute': {
        const savedMode = this.mode;
        this.mode = 'absolute';
        this.walk(node.music);
        this.mode = savedMode;
        return;
      }
      case 'tuplet': {
        const saved = this.tupletFactor;
        const id = ++this.tupletId;
        this.tupletFactor = saved * node.factor;
        const from = this.out.length;
        this.walk(node.music);
        const members = this.out.slice(from).filter((e) => e.kind === 'note' || e.kind === 'rest');
        if (members.length) {
          members[0].tupletStart = { id, num: node.num, den: node.den };
          members[members.length - 1].tupletEnd = id;
          for (const m of members) m.tupletId = id;
        }
        this.tupletFactor = saved;
        return;
      }
      case 'repeat': {
        const from = this.out.length;
        this.push({ kind: 'barline', style: 'repeat-start', tick: this.tick, src: [0, 0] });
        this.walk(node.music);
        this.push({ kind: 'barline', style: 'repeat-end', tick: this.tick, times: node.times, src: [0, 0] });
        if (node.alternatives?.length) {
          node.alternatives.forEach((alt, idx) => {
            this.push({ kind: 'volta', number: idx + 1, phase: 'start', tick: this.tick, src: [0, 0] });
            this.walk(alt);
            this.push({ kind: 'volta', number: idx + 1, phase: 'stop', tick: this.tick, src: [0, 0] });
            if (idx < node.alternatives.length - 1) {
              this.push({ kind: 'barline', style: 'repeat-end', tick: this.tick, src: [0, 0] });
            }
          });
        }
        void from;
        return;
      }
      default: this.event(node);
    }
  }

  event(node) {
    const src = node.src ?? [0, 0];
    switch (node.t) {
      case 'note': {
        if (node.duration) this.dur = node.duration;
        const written = node.duration ?? this.dur;
        const ticks = Math.round(written.ticks * this.tupletFactor);
        const pitches = [];
        let first = null;
        for (const p of node.pitches) {
          const abs = this.resolvePitch(p);
          if (!first) first = abs;
          // Inside a chord each note is relative to the previous chord member.
          if (this.mode === 'relative') this.ref = { step: abs.step, octave: abs.octave };
          pitches.push(abs);
        }
        // ...but what FOLLOWS the chord is relative to its first note.
        if (this.mode === 'relative' && first) this.ref = { step: first.step, octave: first.octave };
        this.push({
          kind: 'note', tick: this.tick, ticks, written: { denom: written.denom, dots: written.dots },
          pitches, chord: !!node.chord, tie: node.tie, slur: node.slur, beam: node.beam,
          artics: node.artics, texts: node.texts, dynamic: node.dynamic, hairpin: node.hairpin,
          phrase: node.phrase, src,
        });
        this.tick += ticks;
        this.lastChord = pitches;
        return;
      }
      case 'repeatChord': {
        if (node.duration) this.dur = node.duration;
        const written = node.duration ?? this.dur;
        const ticks = Math.round(written.ticks * this.tupletFactor);
        this.push({
          kind: 'note', tick: this.tick, ticks, written: { denom: written.denom, dots: written.dots },
          pitches: (this.lastChord ?? []).map((p) => ({ ...p })), chord: true,
          artics: node.artics, texts: node.texts, dynamic: node.dynamic, hairpin: node.hairpin, src,
        });
        this.tick += ticks;
        return;
      }
      case 'rest': {
        if (node.duration) this.dur = node.duration;
        const written = node.duration ?? this.dur;
        const ticks = Math.round(written.ticks * this.tupletFactor);
        this.push({
          kind: 'rest', tick: this.tick, ticks, written: { denom: written.denom, dots: written.dots },
          invisible: node.invisible, fullMeasure: node.fullMeasure,
          artics: node.artics, texts: node.texts, dynamic: node.dynamic, src,
        });
        this.tick += ticks;
        return;
      }
      case 'clef': this.push({ kind: 'clef', value: node.value, tick: this.tick, src }); return;
      case 'key': this.push({ kind: 'key', fifths: node.fifths, tick: this.tick, src }); return;
      case 'time': this.push({ kind: 'time', num: node.num, den: node.den, tick: this.tick, src }); return;
      case 'tempo': this.push({ kind: 'tempo', text: node.text, unit: node.unit, bpm: node.bpm, tick: this.tick, src }); return;
      case 'partial': this.push({ kind: 'partial', ticks: node.ticks, tick: this.tick, src }); return;
      case 'bar': this.push({ kind: 'barline', style: barStyle(node.style), tick: this.tick, src }); return;
      case 'barcheck': this.push({ kind: 'barcheck', tick: this.tick, src }); return;
      case 'break': this.push({ kind: 'break', tick: this.tick, src }); return;
      case 'dynamic': this.push({ kind: 'dynamic', value: node.value, tick: this.tick, src }); return;
      case 'hairpin': this.push({ kind: 'hairpin', dir: node.dir, tick: this.tick, src }); return;
      case 'stemdir': this.push({ kind: 'stemdir', dir: node.dir, tick: this.tick, src }); return;
      case 'voicedir': this.push({ kind: 'voicedir', which: node.which, tick: this.tick, src }); return;
      default: /* nothing to emit */
    }
  }
}

function barStyle(style) {
  switch (style) {
    case '|.': return 'final';
    case '||': return 'double';
    case '.|:': return 'repeat-start';
    case ':|.': case ':|': return 'repeat-end';
    case ':|.|:': case ':..:': return 'repeat-both';
    case '!': return 'dashed';
    case '': return 'invisible';
    default: return 'single';
  }
}

/**
 * Pull the staff structure out of a parse tree.
 *
 * The rule mirrors LilyPond's own: an explicit `\new Staff` makes a staff; a
 * `<< ... >>` whose branches are separated by `\\` makes VOICES within one
 * staff; a `<< ... >>` of `\new Staff`s makes several staves. Music with no
 * context at all is one staff with one voice, which is what a beginner writes
 * and what should therefore work.
 */
function extractStaves(root, reader) {
  const staves = [];

  const asStaff = (node, name) => {
    const voices = [];
    // A `\\` split at the top of a staff's music means parallel voices.
    const branches = splitVoices(node);
    for (const b of branches) {
      const f = new Flattener(reader);
      f.walk(b);
      voices.push(f.out);
    }
    staves.push({ name: name || '', voices: voices.length ? voices : [[]] });
  };

  const visit = (node, inGroup) => {
    if (!node) return false;
    if (node.t === 'staff') { asStaff(node.music, node.name); return true; }
    if (node.t === 'group') return visit(node.music, true);
    if (node.t === 'ref') return visit(node.music, inGroup);
    if (node.t === 'par' && !node.split) {
      let any = false;
      for (const it of node.items) any = visit(it, true) || any;
      return any;
    }
    if (node.t === 'seq') {
      // A sequence whose members are all staves/groups is a container, not music.
      const structural = node.items.filter((i) => i && (i.t === 'staff' || i.t === 'group' || (i.t === 'par' && !i.split)));
      if (structural.length && structural.length === node.items.filter(Boolean).length) {
        let any = false;
        for (const it of node.items) any = visit(it, inGroup) || any;
        return any;
      }
    }
    return false;
  };

  if (!visit(root, false)) asStaff(root, '');
  return staves.length ? staves : [{ name: '', voices: [[]] }];
}

/**
 * Split a staff's music into independent voices.
 *
 * LilyPond writes polyphony on one staff two ways, and both are common:
 *   << {a} \\ {b} >>          — the shorthand
 *   << \new Voice {a} \new Voice {b} >>   — the explicit form
 * Only handling the first is a quiet disaster: the second still parses, but the
 * parts get merged into ONE voice, so the second part's rests are drawn over
 * the first part's notes and every stem points the same way. It looks like a
 * layout bug and is actually a structure bug.
 *
 * The preamble (clef, key, metre) belongs to the staff, not to voice 1, so it
 * is copied into every branch — while the music itself is copied into none of
 * them, which would double it.
 */
function splitVoices(node) {
  if (!node) return [{ t: 'seq', items: [] }];
  if (node.t === 'ref') return splitVoices(node.music);

  if (node.t === 'par') {
    if (node.split) return node.items;
    const voices = node.items.filter((i) => i && i.t === 'voice');
    if (voices.length > 1) {
      const preamble = node.items.filter((i) => i && i.t !== 'voice');
      return voices.map((v, n) => ({
        t: 'seq',
        items: [...(n === 0 ? preamble : preamble.map(directivesOnly)), v],
      }));
    }
    return [node];
  }

  if (node.t === 'seq') {
    // Voices sitting directly in a sequence, whichever route put them there.
    const direct = node.items.filter((i) => i && i.t === 'voice');
    if (direct.length > 1) {
      const preamble = node.items.filter((i) => i && i.t !== 'voice');
      return direct.map((v, n) => ({
        t: 'seq',
        items: [...(n === 0 ? preamble : preamble.map(directivesOnly)), v],
      }));
    }
    const split = node.items.find((i) => i && i.t === 'par' && i.split);
    if (split) {
      const idx = node.items.indexOf(split);
      const before = node.items.slice(0, idx);
      const after = node.items.slice(idx + 1);
      return split.items.map((branch, n) => ({
        t: 'seq',
        items: [...(n === 0 ? before : before.map(directivesOnly)), branch, ...(n === 0 ? after : [])],
      }));
    }
    const nested = node.items.find((i) => i && i.t === 'par'
      && i.items.filter((x) => x && x.t === 'voice').length > 1);
    if (nested) {
      const before = node.items.slice(0, node.items.indexOf(nested));
      return splitVoices(nested).map((branch, n) => ({
        t: 'seq',
        items: [...(n === 0 ? before : before.map(directivesOnly)), branch],
      }));
    }
  }
  return [node];
}

const DIRECTIVES = ['clef', 'key', 'time', 'partial', 'tempo'];

/** A copy of a music node keeping only the marks that set up a staff. */
function directivesOnly(node) {
  if (!node) return { t: 'seq', items: [] };
  if (DIRECTIVES.includes(node.t)) return node;
  if (node.t === 'seq' || node.t === 'par') {
    return { t: 'seq', items: node.items.map(directivesOnly).filter((i) => i && (DIRECTIVES.includes(i.t) || i.items?.length)) };
  }
  if (node.music) return directivesOnly(node.music);
  return { t: 'seq', items: [] };
}

function findTempo(staves) {
  for (const st of staves) {
    for (const v of st.voices) {
      for (const e of v) {
        if (e.kind === 'tempo' && e.bpm) return { bpm: e.bpm, unit: e.unit ?? WHOLE / 4, text: e.text };
        if (e.kind === 'tempo' && e.text) return { bpm: 84, unit: WHOLE / 4, text: e.text };
      }
    }
  }
  return { bpm: 84, unit: WHOLE / 4, text: null };
}

// ------------------------------------------------------------- serialising --

const ACC_SUFFIX = { '-2': 'eses', '-1': 'es', 0: '', 1: 'is', 2: 'isis' };

/** A pitch as LilyPond absolute notation, e.g. { c,1,4 } -> "cis'". */
export function pitchToLily(p) {
  const marks = p.octave - 3;
  const oct = marks >= 0 ? "'".repeat(marks) : ','.repeat(-marks);
  return LETTERS[p.step] + (ACC_SUFFIX[p.alter] ?? '') + oct;
}

/**
 * A pitch written RELATIVE to another — the inverse of the parser's octave rule.
 *
 * The note editor has to write back into whatever mode the file is already in.
 * Emitting absolute pitches into a `\relative` block would move every note after
 * the insertion, so the round trip has to be exact: find the octave the relative
 * rule would have picked on its own, and spell the difference as `'` or `,`.
 */
export function pitchToLilyRelative(p, prev) {
  if (!prev) return pitchToLily(p);
  const prevDia = prev.octave * 7 + prev.step;
  let octave = prev.octave;
  let dia = octave * 7 + p.step;
  while (dia - prevDia > 3) { octave--; dia -= 7; }
  while (prevDia - dia > 3) { octave++; dia += 7; }
  const marks = p.octave - octave;
  const oct = marks >= 0 ? "'".repeat(marks) : ','.repeat(-marks);
  return LETTERS[p.step] + (ACC_SUFFIX[p.alter] ?? '') + oct;
}

/** A duration as LilyPond notation: 4, 8., 16.. — used by the note editor. */
export function durationToLily(ticks) {
  const v = noteValue(ticks);
  if (!v) return '4';
  return String(v.denom === 0.5 ? '\\breve' : v.denom) + '.'.repeat(v.dots);
}

export { PPQ, WHOLE };
