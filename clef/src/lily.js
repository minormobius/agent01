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

/**
 * NOTE-NAME LANGUAGES.
 *
 * LilyPond's default alphabet is Dutch (`cis`, `bes`), but a large part of the
 * real corpus opens with `\include "english.ly"` and then writes `cs` and `bf`.
 * Reading an English file with the Dutch alphabet does not fail — it QUIETLY
 * PRODUCES DIFFERENT MUSIC: `bf` scans as a B followed by an F, so a B-flat
 * becomes two notes and every bar after it is wrong. That failure mode (silent,
 * plausible, wrong) is the one this whole codebase is built to avoid, so the
 * alphabet is read from the file rather than assumed.
 *
 * Each entry maps a matched suffix run to a semitone alteration. Alternations
 * are ordered longest-first because `ss` must win over `s`, and `flatflat` over
 * `flat`.
 */
const LANGUAGES = {
  nederlands: {
    first: /[a-g]/,
    token: /^([a-g])((?:isis|eses|is|es|ih|eh)*)/,
    part: /isis|eses|is|es|ih|eh/g,
    alter: { is: 1, es: -1, isis: 2, eses: -2, ih: 0, eh: 0 },
  },
  english: {
    first: /[a-g]/,
    // `f` is both the note F and the flat suffix, so the suffix run has to be
    // matched greedily off the FRONT of what follows the letter, longest first.
    token: /^([a-g])((?:sharpsharp|flatflat|sharp|flat|ss|ff|qs|qf|s|f|x)*)/,
    part: /sharpsharp|flatflat|sharp|flat|ss|ff|qs|qf|s|f|x/g,
    alter: { s: 1, sharp: 1, ss: 2, x: 2, sharpsharp: 2, f: -1, flat: -1, ff: -2, flatflat: -2, qs: 0, qf: 0 },
  },
  deutsch: {
    first: /[a-h]/,
    token: /^([a-h])((?:isis|eses|is|es|s)*)/,
    part: /isis|eses|is|es|s/g,
    alter: { is: 1, es: -1, isis: 2, eses: -2, s: -1 },
    // In German, B IS B-flat and H is B natural — the trap that puts one voice
    // of a chorale a semitone out for the whole piece.
    letterStep: { h: 6, b: 6 },
    letterAlter: { b: -1 },
  },
};

/** `english.ly` / `\language "english"` -> the alphabet to read pitches with. */
function languageNamed(name) {
  const key = String(name || '').replace(/\.ly$/, '').toLowerCase();
  if (key in LANGUAGES) return { key, def: LANGUAGES[key] };
  return { key, def: undefined };
}

export class ParseError extends Error {}

class Reader {
  constructor(src) {
    this.src = src;
    this.i = 0;
    this.diagnostics = [];
    this.defs = new Map();      // identifier -> parsed music node
    this.header = {};
    this.depth = 0;
    this.languageName = 'nederlands';
    this.lang = LANGUAGES.nederlands;
  }

  /**
   * Adopt a note-name alphabet. An UNKNOWN one is refused rather than guessed
   * at: carrying on in Dutch would read every pitch in the file wrongly and
   * report nothing, which is the one outcome worth failing loudly for.
   */
  setLanguage(name, at) {
    const { key, def } = languageNamed(name);
    if (def) { this.languageName = key; this.lang = def; return; }
    if (/^(?:italiano|espanol|catalan|portugues|francais|norsk|suomi|svenska|vlaams)$/.test(key)) {
      this.warn(`note-name language "${key}" is not supported — pitches in this file `
        + 'would be read wrongly, so it has been left unread', at, 'error');
      this.lang = null;
    }
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

  /**
   * A bare word: an identifier, context name or keyword.
   *
   * A hyphen may appear INSIDE a name but never at the end of one, because
   * `\\f-.` is a forte followed by a staccato dot — read greedily it becomes a
   * command called `f-` and the articulation disappears.
   */
  word() {
    this.ws();
    const m = /^[A-Za-z](?:[A-Za-z0-9_-]*[A-Za-z0-9])?/.exec(this.src.slice(this.i));
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
      if (cmd === 'version') { r.string(); continue; }
      if (cmd === 'language' || cmd === 'include') {
        // The note-name alphabet, which has to be known before ANY pitch is
        // read. `\include "english.ly"` is the older spelling and is still the
        // commonest one in the wild.
        const named = r.string();
        if (named !== null && (cmd === 'language' || /\.ly$/i.test(named))) r.setLanguage(named, at);
        continue;
      }
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
    language: r.languageName,
    diagnostics: r.diagnostics,
  };
}

function parseAssignable(r) {
  r.ws();
  if (r.peek() === '"') return { t: 'text', value: r.string() };
  if (r.src.startsWith('\\markup', r.i)) { r.command(); return { t: 'text', value: flattenMarkup(r) }; }
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

/**
 * Consume one `\\override`/`\\set`/`\\tweak` statement and nothing more.
 *
 * Shape: a property path (words, dots, `#'symbols`), then optionally `= value`.
 * Anything that is not part of that — a note, a brace, a `>>` — ends it.
 */
function skipTweak(r, hasValue) {
  let guard = 0;
  while (!r.done && guard++ < 64) {
    r.ws();
    const c = r.peek();
    if (c === '#') { skipScheme(r); continue; }
    if (c === '.' || c === ',') { r.i++; continue; }
    if (c === '=') {
      r.i++;
      if (hasValue) skipValue(r);
      return;
    }
    if (c === '"') { r.string(); continue; }
    if (/[A-Za-z]/.test(c)) {
      const m = /^[A-Za-z][A-Za-z0-9_.-]*/.exec(r.src.slice(r.i));
      // A bare word could be the next NOTE rather than more of the property
      // path. Property names are capitalised contexts (`Script`, `Staff`) or
      // dotted paths; a lone lower-case word that is a legal pitch is not ours.
      if (!m) return;
      if (!hasValue && guard > 1) return;
      r.i += m[0].length;
      continue;
    }
    return;
  }
}

function skipValue(r) {
  r.ws();
  if (r.peek() === '#') { skipScheme(r); return; }
  if (r.peek() === '"') { r.string(); return; }
  const m = /^-?[\d.]+|^[A-Za-z][A-Za-z0-9_.-]*/.exec(r.src.slice(r.i));
  if (m) r.i += m[0].length;
}

function skipScheme(r) {
  // `#'symbol`, `#(function ...)`, `#42` — consumed and ignored. Layout tweaks
  // are exactly the part of LilyPond this reader does not implement.
  r.i++; // '#'
  r.ws();
  // `#'(…)` and `` #`(…) `` are quoted lists: the quote comes BEFORE the paren,
  // so it has to be stepped over or the list is read as a bare token and its
  // contents spill out as garbage.
  while (r.peek() === "'" || r.peek() === '`' || r.peek() === ',') r.i++;
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
      // `\\book { \\score {…} \\score {…} }` — a multi-movement file. Without
      // this the second score is read as music inside the first.
      if (cmd === 'score' || cmd === 'bookpart' || cmd === 'book') {
        const nested = parseScoreBlock(r);
        if (nested) items.push(nested);
        continue;
      }
      if (cmd === 'markup') { flattenMarkup(r); continue; }
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
        // Grace notes are ORNAMENTS: they are drawn small, before the beat, and
        // they take no time from the bar. Dropping them (as this once did) is
        // the wrong trade — an ornamented Baroque piece is mostly ornament, and
        // silently deleting a third of the notes on the page is worse than
        // drawing them at the wrong size.
        return { t: 'grace', kind: cmd, music: parseOneMusic(r) };
      }
      case 'transpose': {
        const from = tryPitch(r);
        const to = tryPitch(r);
        const music = parseMusic(r);
        if (!from || !to) {
          r.warn('\\transpose needs two pitches', at);
          return music;
        }
        return { t: 'transpose', from, to, music };
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

/**
 * Exactly ONE music expression: a braced block, or a single note.
 *
 * `\\appoggiatura g16 c4 d e f` ornaments the `c4` with a single G — the grace
 * group is one note. Falling through to the implicit-sequence parser here eats
 * the rest of the bar and turns every note in it into an ornament, which is a
 * spectacular way to lose a piece.
 */
function parseOneMusic(r) {
  r.ws();
  if (r.peek() === '{' || (r.peek() === '<' && r.peek(1) === '<')) return parseMusic(r);
  const item = parseItem(r);
  if (!item) return { t: 'seq', items: [] };
  return { t: 'seq', items: Array.isArray(item) ? item : [item] };
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
      // Nothing consumed: unknown syntax. Report once and step past it — but
      // stay quiet if the alphabet itself was refused, since every character
      // after that is unreadable for one reason already stated.
      if (r.lang) r.warn(`skipped ${JSON.stringify(r.src.slice(r.i, r.i + 12))}`, r.i);
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
  // The set of letters that can START a pitch is the LANGUAGE's, not a fixed
  // `a-g`: German writes B natural as `h`, and a hard-coded class silently
  // drops every one of them without so much as a diagnostic.
  if ((r.lang?.first ?? /[a-g]/).test(c) || /[srRq]/.test(c)) return parseNoteLike(r, at);

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
    // Page-breaking hints. This site lays out to the width of a browser pane,
    // so they have nothing to act on — but they are perfectly valid input and
    // reporting them as unsupported buries the diagnostics that matter.
    case 'noPageBreak': case 'pageBreak': case 'noBreak':
    case 'allowPageTurn': case 'pageTurn': case 'noPageTurn':
    case 'bar-line': case 'small': case 'normalsize': case 'tiny': case 'large':
      return null;
    case 'mark': { r.ws(); if (r.peek() === '#') skipScheme(r); else r.string(); return null; }
    case 'voiceOne': case 'voiceTwo': case 'voiceThree': case 'voiceFour':
      return { t: 'voicedir', which: cmd, src: [at, r.i] };
    case 'oneVoice': return { t: 'voicedir', which: 'oneVoice', src: [at, r.i] };
    case 'stemUp': case 'stemDown': case 'stemNeutral':
      return { t: 'stemdir', dir: cmd === 'stemUp' ? 1 : cmd === 'stemDown' ? -1 : 0, src: [at, r.i] };
    case 'cresc': return { t: 'hairpin', dir: 'cresc', src: [at, r.i] };
    case 'decresc': case 'dim': return { t: 'hairpin', dir: 'dim', src: [at, r.i] };
    case 'set': case 'override': case 'unset': case 'revert': case 'tweak': {
      // A layout instruction, consumed and ignored — that is the part of
      // LilyPond this reader is not. But it must be consumed EXACTLY, one
      // statement, not "to the end of the line": these appear mid-bar, as in
      //
      //   << { b8( } { s16 \\once \\override Script #'padding = #2.5 s16 } >> f'8)
      //
      // and eating the rest of that line takes the closing `}` and `>>` with
      // it. Every brace after that is then mismatched, the piece parses as one
      // runaway block, and the damage shows up hundreds of bars later as
      // nonsense rather than as an error here.
      skipTweak(r, cmd === 'set' || cmd === 'override' || cmd === 'tweak');
      return null;
    }
    case 'once': return null;  // a modifier on the statement that follows it
    default: {
      if (r.defs.has(cmd)) return { t: 'ref', name: cmd, music: r.defs.get(cmd), src: [at, r.i] };
      if (cmd === 'markup') { flattenMarkup(r); return null; }
      if (DYNAMICS.has(cmd)) return { t: 'dynamic', value: cmd, src: [at, r.i] };
      if (NAMED_ARTIC.has(cmd)) return { t: 'artic', value: cmd, src: [at, r.i] };
      r.warn(`\\${cmd} is not supported`, at);
      return null;
    }
  }
}

/**
 * A pitch NAME only, for `\key es \major`.
 *
 * Returned in CANONICAL Dutch regardless of the file's alphabet, because that
 * is what `fifthsOf` keys off — so `\key bf \major` in an English file and
 * `\key bes \major` in a Dutch one land on the same two flats.
 */
function tryPitchName(r) {
  const p = tryPitch(r, /* octaveMarks */ false);
  if (!p) return null;
  return canonicalName(p.step, p.alter);
}

const ACC_CANON = { '-2': 'eses', '-1': 'es', 0: '', 1: 'is', 2: 'isis' };
function canonicalName(step, alter) {
  // `aes` and `ees` are spelled `as` and `es` in the key names model.js knows.
  const letter = LETTERS[step];
  if (alter === -1 && (letter === 'a' || letter === 'e')) return letter === 'a' ? 'as' : 'es';
  return letter + (ACC_CANON[alter] ?? '');
}

/**
 * Parse a pitch token: letter, accidental suffixes, octave marks.
 *
 * The alphabet comes from the file (see LANGUAGES). Everything downstream works
 * in step/alter, so the rest of the program never learns which language the
 * source was written in.
 */
function tryPitch(r, octaveMarks = true) {
  r.ws();
  const lang = r.lang;
  if (!lang) return null;              // unreadable alphabet, already reported
  const rest = r.src.slice(r.i);
  const m = lang.token.exec(rest);
  if (!m) return null;

  const letter = m[1];
  const step = lang.letterStep?.[letter] ?? LETTERS.indexOf(letter);
  if (step < 0) return null;
  let alter = lang.letterAlter?.[letter] ?? 0;
  for (const acc of m[2].match(lang.part) ?? []) alter += lang.alter[acc] ?? 0;
  // Quarter-tones are read so the file parses, then rounded to the nearest
  // semitone — this notation has no quarter-tone glyphs to draw them with.

  let consumed = m[0].length;
  let q = 0;
  let forced = false;
  let cautionary = false;
  if (octaveMarks) {
    const tail = /^((?:'|,)*)(!?)(\??)/.exec(rest.slice(consumed));
    for (const ch of tail[1]) q += ch === "'" ? 1 : -1;
    forced = tail[2] === '!';
    cautionary = tail[3] === '?';
    consumed += tail[0].length;
  }
  r.i += consumed;
  return { step, alter, octave: 3 + q, marks: q, forced, cautionary };
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
  if ((c === 'r' || c === 'R' || c === 's') && !(r.lang?.first ?? /[a-g]/).test(c)) {
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

const STEP_SEMI = [0, 2, 4, 5, 7, 9, 11];
// Where each letter sits on the circle of fifths. A sharp is seven steps
// clockwise, which is why an accidental is worth 7 here.
const FIFTH_POS = [0, 2, 4, -1, 1, 3, 5];

const pitchSemitones = (p) => 12 * (p.octave + 1) + STEP_SEMI[p.step] + p.alter;
const fifthPosition = (p) => FIFTH_POS[p.step] + 7 * p.alter;
const composeTransposition = (a, b) => (a
  ? { dia: a.dia + b.dia, semi: a.semi + b.semi, fifths: a.fifths + b.fifths }
  : b);

/**
 * Move a pitch by an interval, KEEPING ITS SPELLING RIGHT.
 *
 * The diatonic distance decides the letter and the octave; the semitone
 * distance then decides the accidental that makes the arithmetic come out. Do
 * it in semitones alone and a transposed F sharp becomes a G flat, which reads
 * as a different note in a different key.
 */
function transposePitch(p, t) {
  if (!t) return p;
  const dia = p.octave * 7 + p.step + t.dia;
  const octave = Math.floor(dia / 7);
  const step = dia - octave * 7;
  const semi = pitchSemitones(p) + t.semi;
  return { ...p, step, octave, alter: semi - (12 * (octave + 1) + STEP_SEMI[step]) };
}

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
    this.transposition = null;
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
      case 'grace': {
        // The clock does not advance. Every note inside is marked so the
        // engraver can draw it small and the synth can play it as a flick.
        const at = this.tick;
        const from = this.out.length;
        this.walk(node.music);
        for (const e of this.out.slice(from)) {
          if (e.kind !== 'note' && e.kind !== 'rest') continue;
          e.grace = node.kind;
          e.graceTicks = e.ticks;
          e.ticks = 0;
          e.tick = at;
        }
        this.tick = at;
        return;
      }
      case 'transpose': {
        // Applied AFTER relative resolution, which is the order LilyPond uses:
        // `\\transpose c c'' \\relative { … }` means "read it relatively, then
        // move it". Doing it the other way round changes which octave each
        // relative note lands in.
        const saved = this.transposition;
        const step = ((node.to.step - node.from.step) % 7 + 7) % 7;
        this.transposition = composeTransposition(saved, {
          dia: (node.to.octave * 7 + node.to.step) - (node.from.octave * 7 + node.from.step),
          semi: pitchSemitones(node.to) - pitchSemitones(node.from),
          fifths: fifthPosition(node.to) - fifthPosition(node.from),
        });
        void step;
        this.walk(node.music);
        this.transposition = saved;
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
          // Resolve FIRST, and let the resolved-but-UNTRANSPOSED pitch be the
          // reference for what follows. Feeding the transposed pitch back makes
          // the interval compound on every note, so a piece transposed up an
          // octave climbs an extra octave per note.
          const written = this.resolvePitch(p);
          if (!first) first = written;
          // Inside a chord each note is relative to the previous chord member.
          if (this.mode === 'relative') this.ref = { step: written.step, octave: written.octave };
          pitches.push(transposePitch(written, this.transposition));
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
      case 'key':
        // A key signature moves with the music. Transposing up a fifth adds a
        // sharp; up two octaves changes nothing, which is the common case and
        // exactly what `fifths: 0` gives.
        this.push({
          kind: 'key',
          fifths: node.fifths + (this.transposition?.fifths ?? 0),
          tick: this.tick, src,
        });
        return;
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
