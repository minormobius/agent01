// clef/test/notation.selftest.mjs — certifies the reader, the engraver and the
// two exports, against known answers rather than against themselves.
//
// WHY THESE CHECKS AND NOT OTHERS: almost every bug this code has had was a
// wrong NUMBER that still drew something plausible. A key signature an octave
// low still looks like a key signature. A stem anchored at the middle line
// still looks like a stem. A tie played as two notes still sounds like music.
// None of that shows up in a screenshot, and all of it shows up here.
//
//   1. octaves      — `\relative` is the rule everything else is measured from
//   2. rhythm       — dotted and tuplet arithmetic must be EXACT integers
//   3. structure    — voices, staves, chords survive the shapes real files use
//   4. accidentals  — the bar-local memory, and the key signature under it
//   5. geometry     — staff positions, stem lengths, ledger lines
//   6. bar checks   — the one correctness test the notation itself offers
//   7. round trip   — a pitch written back must read back as the same pitch
//   8. exports      — MIDI header/tick bytes, and tie merging before them
//
// Run: node clef/test/notation.selftest.mjs

import { readFileSync } from 'node:fs';
import { parseLily, pitchToLily, pitchToLilyRelative, durationToLily } from '../src/lily.js';
import { engrave } from '../src/engrave.js';
import { scoreToNotes, performance as buildPerformance, patchForInstrument } from '../src/audio.js';
import { writeMidi } from '../src/midi.js';
import { LIBRARY } from '../src/library.js';
import {
  WHOLE, PPQ, ticksOf, noteValue, midiOf, staffPos, fifthsOf,
  keySignaturePositions, beatGroups, pitchFromDiatonic,
} from '../src/model.js';

let checks = 0;
let failures = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('  ✗ ' + msg); }
}
function eq(actual, expected, msg) {
  ok(actual === expected, `${msg} — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

const notesOf = (score, staff = 0, voice = 0) =>
  score.staves[staff].voices[voice].filter((e) => e.kind === 'note');
const midiList = (score, staff = 0, voice = 0) =>
  notesOf(score, staff, voice).flatMap((e) => e.pitches.map(midiOf));

// ------------------------------------------------------- 1. relative mode --
{
  // LilyPond's rule: each note takes the octave that puts it within a FOURTH of
  // the one before. `\relative c' { g }` is therefore the G BELOW middle C, not
  // the G above — a distinction that silently transposes a whole piece.
  eq(midiList(parseLily(`\\relative c' { g }`))[0], 55, 'relative c\' g is G3');
  eq(midiList(parseLily(`\\relative c' { c }`))[0], 60, 'relative c\' c is middle C');
  eq(midiList(parseLily(`\\relative c' { g' }`))[0], 67, "an octave mark shifts after the rule, not before");
  eq(midiList(parseLily(`\\relative c' { c d e f g a b c }`)).join(','),
    '60,62,64,65,67,69,71,72', 'an ascending scale stays in one octave');
  eq(midiList(parseLily(`\\relative c'' { a bes c d e f }`)).join(','),
    '69,70,72,74,76,77', 'Für Elise\'s opening register');

  // Inside a chord each note is relative to the PREVIOUS CHORD MEMBER, but what
  // follows the chord is relative to its FIRST note. Getting the second half of
  // that wrong is invisible until a later note jumps an octave.
  const ch = parseLily(`\\relative c' { <c e g> d }`);
  eq(midiList(ch).join(','), '60,64,67,62', 'chord members chain; the next note follows the root');

  eq(midiList(parseLily(`{ c d e }`)).join(','), '48,50,52', 'absolute mode: bare c is C3');
  eq(midiList(parseLily(`\\fixed c' { c g c }`)).join(','), '60,67,60', '\\fixed pins the octave');
  eq(midiList(parseLily(`\\relative c' { cis des }`)).join(','), '61,61',
    'enharmonics sound alike and are spelled differently');
}

// -------------------------------------------------------------- 2. rhythm --
{
  eq(ticksOf(4), 960, 'a quarter note is 960 ticks');
  eq(ticksOf(4, 1), 1440, 'a dotted quarter is 1.5 quarters');
  eq(ticksOf(4, 2), 1680, 'a double-dotted quarter is 1.75 quarters');
  eq(ticksOf(1), WHOLE, 'a whole note is four quarters');

  const t = parseLily(`\\relative c' { \\tuplet 3/2 { c8 d e } }`);
  const ticks = notesOf(t).map((e) => e.ticks);
  eq(ticks.join(','), '320,320,320', 'three eighths in the time of two are exact');
  eq(ticks.reduce((a, b) => a + b, 0), 960, 'and they sum to a quarter with no remainder');

  const x = parseLily(`\\relative c' { \\times 2/3 { c8 d e } }`);
  eq(notesOf(x).map((e) => e.ticks).join(','), '320,320,320', '\\times is the same tuplet, written as a factor');

  // Sticky durations: a bare note keeps the last one written.
  eq(parseLily(`\\relative c' { c8 d e f }`).staves[0].voices[0]
    .filter((e) => e.kind === 'note').map((e) => e.ticks).join(','),
  '480,480,480,480', 'a duration persists until the next one');

  eq(noteValue(1440).dots, 1, '1440 ticks is drawn as a dotted quarter');
  eq(noteValue(1440).denom, 4, '...with a quarter-note head');
  eq(noteValue(320), null, 'a triplet eighth has no dotted spelling — that is what tuplets are for');
}

// ----------------------------------------------------------- 3. structure --
{
  const two = parseLily(`\\new Staff { << { c'4 } \\\\ { e4 } >> }`);
  eq(two.staves[0].voices.length, 2, '<< a \\\\ b >> is two voices');

  // The explicit spelling of the same thing. This one regressed: without `\\`
  // both parts were merged into one voice, which draws as one part with the
  // other part's rests on top of it.
  const exp = parseLily(`\\new Staff << \\new Voice { c'4 } \\new Voice { e4 } >>`);
  eq(exp.staves[0].voices.length, 2, '<< \\new Voice … \\new Voice … >> is also two voices');

  // ...and with a preamble in front of them, which is how a real file is written.
  const pre = parseLily(
    `\\new Staff << \\clef bass \\key f \\major \\time 3/4\n`
    + `  \\new Voice { c4 d e }\n  \\new Voice { g,4 g, g, } >>`);
  eq(pre.staves[0].voices.length, 2, 'a preamble does not swallow the voices after it');
  ok(pre.staves[0].voices.every((v) => v.some((e) => e.kind === 'clef' && e.value === 'bass')),
    'and every voice inherits the clef');

  const grand = parseLily(`\\new PianoStaff << \\new Staff { c'4 } \\new Staff { \\clef bass c4 } >>`);
  eq(grand.staves.length, 2, '\\new PianoStaff makes two staves');

  const def = parseLily(`melody = \\relative c' { c4 d }\n\\score { \\new Staff \\melody }`);
  eq(midiList(def).join(','), '60,62', 'a \\variable expands where it is used');

  const hdr = parseLily(`\\header { title = "T" composer = "C" }\n{ c4 }`);
  eq(hdr.title, 'T', 'the title is read');
  eq(hdr.composer, 'C', 'the composer is read');
  eq(parseLily(`\\tempo 4 = 132 { c4 }`).tempo.bpm, 132, 'the tempo is read');

  ok(parseLily(LIBRARY[0].source).diagnostics.length === 0, 'valid input produces no diagnostics');
}

// ------------------------------------------------------- 3b. note languages --
// A large part of the real LilyPond corpus opens `\include "english.ly"`. Read
// with the Dutch alphabet, `bf` scans as B followed by F — so a B flat becomes
// TWO notes, the bar overflows, and everything after it is wrong. Silent,
// plausible, wrong: the exact failure this suite exists to catch.
{
  const midiOfSrc = (src) => midiList(parseLily(src));
  eq(parseLily(`{ c }`).language, 'nederlands', 'the default alphabet is Dutch');
  eq(parseLily(`\\language "english"\n{ c }`).language, 'english', '\\language is read');
  eq(parseLily(`\\include "english.ly"\n{ c }`).language, 'english', '\\include "english.ly" is read too');

  eq(midiOfSrc(`{ c bes cis aes }`).join(','), '48,58,49,56', 'Dutch: bes cis aes');
  eq(midiOfSrc(`\\language "english"\n{ c bf cs af }`).join(','), '48,58,49,56',
    'English: bf cs af are the same three pitches');
  eq(midiOfSrc(`\\language "english"\n{ css bff }`).join(','), '50,57',
    'English doubles: css is C double sharp, bff is B double flat');
  eq(midiOfSrc(`\\language "english"\n{ f ff fs }`).join(','), '53,52,54',
    'English: f is F, ff is F flat, fs is F sharp — the ambiguity that needs longest-match');

  // German B/H is the trap that puts one voice a semitone out for a whole piece.
  eq(midiOfSrc(`\\language "deutsch"\n{ b h es fis }`).join(','), '58,59,51,54',
    'German: b is B FLAT, h is B natural');

  eq(parseLily(`\\language "english"\n{ \\key bf \\major c }`)
    .staves[0].voices[0].find((e) => e.kind === 'key').fifths, -2,
  'a key signature written in English resolves to the same two flats');

  // An alphabet this cannot read must REFUSE, not guess. Reading on in Dutch
  // would produce a plausible, entirely wrong piece and say nothing.
  const it = parseLily(`\\language "italiano"\n{ do re mi }`);
  ok(it.diagnostics.some((d) => d.severity === 'error' && /italiano/.test(d.message)),
    'an unsupported alphabet is refused with an error');
  eq(it.staves[0].voices[0].filter((e) => e.kind === 'note').length, 0,
    '...and nothing is invented from it');
  eq(it.diagnostics.length, 1, '...once, without a per-character cascade');
}

// ---------------------------------------------------- 3bb. transposition --
// `\transpose c c''` is how a lot of the real corpus is written: the notes are
// entered in a comfortable octave and moved. Ignoring it does not fail — it
// draws the whole piece two octaves low, on a hedge of ledger lines.
{
  const m = (src) => midiList(parseLily(src));
  eq(m(`\\transpose c c'' { c e g }`).join(','), '72,76,79', 'two octaves up');
  eq(m(`\\transpose c g { c e g }`).join(','), '55,59,62', 'up a perfect fifth');
  eq(m(`\\transpose d c { d fis a }`).join(','), '48,52,55', 'down a major second');
  eq(m(`\\transpose c c' \\relative c' { g a b }`).join(','), '67,69,71',
    'applied AFTER relative resolution, which is the order that decides octaves');

  // Spelling, not just pitch: a transposed F sharp is a G sharp, never an A flat.
  const sp = parseLily(`\\transpose c d { fis }`).staves[0].voices[0].find((e) => e.kind === 'note');
  eq(sp.pitches[0].step, 4, 'F sharp up a second is spelled on G');
  eq(sp.pitches[0].alter, 1, '...as G sharp');

  // The key signature moves with the music.
  const key = (src) => parseLily(src).staves[0].voices[0].find((e) => e.kind === 'key').fifths;
  eq(key(`\\transpose c g { \\key c \\major c }`), 1, 'up a fifth adds a sharp');
  eq(key(`\\transpose c f { \\key c \\major c }`), -1, 'up a fourth adds a flat');
  eq(key(`\\transpose c c'' { \\key a \\minor c }`), 0, 'an octave changes no signature');
}

// ------------------------------------------------- 3bc. surviving real files --
// Everything here is a shape taken from actual Mutopia sources. Each one used
// to break the parse for the whole rest of the file, and each failed SILENTLY:
// the damage surfaced hundreds of bars later as nonsense rather than as an
// error where the problem was.
{
  const bars = (src) => engrave(parseLily(src), { width: 900, grandStaff: false });

  // `\override` mid-bar must consume ONE STATEMENT, not the rest of the line —
  // otherwise it eats the closing `}` and `>>` and every brace after it is
  // mismatched.
  const ov = parseLily(
    `\\relative c'' { \\time 3/8 d,8 << { b8( } `
    + `{ s16 \\once \\override Script #'padding = #2.5 s16 } >> f'8) | }`);
  eq(ov.diagnostics.length, 0, '\\override inside a bar does not break the bar');
  eq(bars(`\\relative c' { \\time 4/4 \\override NoteHead.color = #red c4 d e f | }`).warnings.length, 0,
    '...and the bar still adds up after it');
  eq(parseLily(`\\relative c' { \\override Beam #'(-0.6 . 0.0) c4 }`).diagnostics.length, 0,
    "a quoted Scheme list #'(…) is consumed whole");

  // `\f-.` is a forte and a staccato, not a command called `f-`.
  const fd = parseLily(`\\relative c' { c4\\f-. d }`).staves[0].voices[0].filter((e) => e.kind === 'note');
  eq(fd[0].dynamic, 'f', 'the dynamic is read');
  eq(fd[0].artics.length, 1, '...and the articulation after it is not swallowed');

  // A multi-movement file: `\book { \score {…} \score {…} }`.
  const bk = parseLily(`\\book { \\score { \\new Staff { c'4 } } \\score { \\new Staff { e'4 } } }`);
  eq(bk.diagnostics.length, 0, 'a \\book of several \\scores parses');

  // Page hints are valid input with nothing to act on here, and must not be
  // reported as unsupported — a hundred of those bury the real diagnostics.
  eq(parseLily(`\\relative c' { c4 \\noPageBreak d e f }`).diagnostics.length, 0,
    'page-break hints are silently ignored');

  eq(parseLily(`piece = \\markup { \\bold "Adagio" }\n{ c4 }`).diagnostics.length, 0,
    'a \\markup-valued definition parses');
}

// ------------------------------------------------------------ 3c. ornaments --
// Grace notes take NO time from the bar and are drawn small. The previous
// behaviour — dropping them with a warning — was the wrong trade: an ornamented
// Baroque piece is mostly ornament.
{
  const one = parseLily(`\\relative c' { \\appoggiatura g16 c4 d e f }`);
  const notes = notesOf(one);
  eq(notes.length, 5, 'the ornament is kept alongside the four real notes');
  eq(notes[0].ticks, 0, 'a grace note takes no time');
  eq(notes[0].grace, 'appoggiatura', '...and is marked as what it is');
  eq(notes.slice(1).map((n) => n.tick).join(','), '0,960,1920,2880',
    'the bar is unchanged: \\appoggiatura takes ONE note, not the rest of the bar');

  const braced = notesOf(parseLily(`\\relative c' { \\grace { g16 a } c4 d }`));
  eq(braced.filter((n) => n.grace).length, 2, 'a braced grace group keeps all its notes');
  eq(braced.filter((n) => !n.grace).length, 2, '...and does not swallow the notes after it');

  // Drawn small, and never beamed into the beat it decorates.
  const lay = engrave(parseLily(`\\relative c' { \\time 4/4 \\grace g16 c4 d e f }`), { width: 700, staffSpace: 8 });
  eq(lay.warnings.length, 0, 'a bar with an ornament still adds up');
  ok(/cf-grace/.test(lay.svg), 'the ornament is drawn');
  const scales = [...lay.svg.matchAll(/class="cf-note cf-grace"[^>]*scale\(([\d.]+)/g)]
    .concat([...lay.svg.matchAll(/scale\(([\d.]+),[\d.]+\)"[^>]*class="cf-note cf-grace"/g)]);
  const graceG = lay.svg.match(/<g transform="translate\([^)]*\) scale\(([\d.]+),[\d.]+\)" class="cf-note cf-grace"/);
  ok(graceG && Number(graceG[1]) < 8, `an ornament is drawn smaller than a full note (got ${graceG && graceG[1]})`);
  void scales;
}

// ---------------------------------------------------------- 4. accidentals --
{
  eq(fifthsOf('g', 'major'), 1, 'G major has one sharp');
  eq(fifthsOf('es', 'major'), -3, 'E-flat major has three flats');
  eq(fifthsOf('a', 'minor'), 0, 'A minor has none');
  eq(fifthsOf('d', 'dorian'), 0, 'D dorian is the white notes');

  const acc = (src) => engrave(parseLily(src), { width: 900 })
    .events.filter((e) => !e.rest).map((e) => (e.spelled.accidental === null ? '.' : 'A')).join('');

  // A written accidental holds for the rest of the bar and then lapses.
  // A.A. and not A..A: the sharp is shown, the repeat is not, the natural that
  // CANCELS it must be shown, and the note after that inherits the natural.
  eq(acc(`\\relative c' { \\key c \\major \\time 4/4 cis4 cis c c }`), 'A.A.',
    'a sharp holds through its bar, the cancelling natural is shown, and it holds too');
  eq(acc(`\\relative c' { \\key c \\major \\time 4/4 cis4 c | cis4 c }`), 'AAAA',
    'the memory is wiped at the bar line');
  // ...and the key signature is what "no accidental" means.
  eq(acc(`\\relative c' { \\key g \\major \\time 4/4 fis4 fis f fis }`), '..AA',
    'in G major an F sharp is unmarked; an F natural is marked, and the sharp after it too');
}

// ------------------------------------------------------------- 5. geometry --
{
  // Staff position: 0 is the middle line, +1 per half space, upward.
  eq(staffPos({ step: 6, alter: 0, octave: 4 }, 'treble'), 0, 'B4 is the middle line in treble');
  eq(staffPos({ step: 1, alter: 0, octave: 3 }, 'bass'), 0, 'D3 is the middle line in bass');
  eq(staffPos({ step: 0, alter: 0, octave: 4 }, 'alto'), 0, 'middle C is the middle line in alto');
  eq(staffPos({ step: 0, alter: 0, octave: 4 }, 'treble'), -6, 'middle C sits a ledger line below treble');

  // A key signature must land on the staff, in the traditional band. This is
  // the check that catches a signature drawn an octave out — which still looks
  // like a key signature, just the wrong one.
  for (const [clef, fifths] of [['treble', 1], ['treble', -3], ['bass', 1], ['bass', -3],
    ['bass', 5], ['alto', -6], ['tenor', 4]]) {
    const ps = keySignaturePositions(fifths, clef);
    eq(ps.length, Math.abs(fifths), `${clef} ${fifths} draws ${Math.abs(fifths)} accidentals`);
    ok(ps.every((a) => a.pos >= -5 && a.pos <= 5),
      `${clef} ${fifths}: every accidental stays on or beside the staff (got ${ps.map((a) => a.pos)})`);
    for (let i = 1; i < ps.length; i++) {
      ok(Math.abs(ps[i].pos - ps[i - 1].pos) <= 4,
        `${clef} ${fifths}: the signature reads as one shape, no leap past a fifth`);
    }
  }

  // Stems: 3.5 staff spaces from the notehead, and started AT the note rather
  // than at the middle line.
  const sp = 8;
  const st = engrave(parseLily(`\\relative c'' { \\time 4/4 e4 f g a }`), { width: 700, staffSpace: sp });
  const stems = [...st.svg.matchAll(/<line class="cf-stem"[^>]*y1="([\d.]+)"[^>]*y2="([\d.]+)"/g)];
  eq(stems.length, 4, 'four unbeamed notes have four stems');
  ok(stems.every(([, a, b]) => Math.abs(Math.abs(Number(b) - Number(a)) - 3.5 * sp) < 0.01),
    'every stem is exactly 3.5 staff spaces');

  // Ledger lines appear only beyond the staff, and one per line crossed.
  const low = engrave(parseLily(`{ \\clef treble c,4 }`), { width: 500, staffSpace: sp });
  const ledgers = (low.svg.match(/class="cf-ledger"/g) || []).length;
  ok(ledgers >= 4, `C2 in treble needs several ledger lines (got ${ledgers})`);
  eq((engrave(parseLily(`\\relative c'' { b4 }`), { width: 500 }).svg.match(/cf-ledger/g) || []).length, 0,
    'B4, the middle line in treble, needs none');
  eq((engrave(parseLily(`\\relative c' { b4 }`), { width: 500 }).svg.match(/cf-ledger/g) || []).length, 1,
    'B3, one step below the staff, needs exactly one');

  // Beaming groups by beat and never across one.
  eq(beatGroups(4, 4).length, 2, '4/4 beams in halves');
  eq(beatGroups(6, 8).length, 2, '6/8 beams in two dotted groups');
  eq(beatGroups(3, 8).length, 1, '3/8 is one beat, so its bar beams whole');
  eq(beatGroups(3, 4).length, 3, '3/4 beams in three');

  const beams = (src, opts) => (engrave(parseLily(src), { width: 900, ...opts }).svg.match(/class="cf-beam"/g) || []).length;
  eq(beams(`\\relative c' { \\time 4/4 c8 d e f g a b c }`), 2, '4/4 eighths make two beams, not one');
  eq(beams(`\\relative c' { \\time 3/8 c16 d e f g a }`), 2, '3/8 sixteenths make one primary and one secondary beam');
  eq(beams(`\\relative c' { \\time 4/4 c4 d e f }`), 0, 'quarter notes are never beamed');

  // Two voices point their stems apart. Without this they overprint.
  const v2 = engrave(parseLily(`\\new Staff { << { g'2 a' } \\\\ { c'4 d' e' c' } >> }`), { width: 500, staffSpace: sp });
  const dirs = [...v2.svg.matchAll(/<line class="cf-stem"[^>]*y1="([\d.]+)"[^>]*y2="([\d.]+)"/g)]
    .map(([, a, b]) => (Number(b) < Number(a) ? 'up' : 'down'));
  eq(dirs.slice(0, 2).join(','), 'up,up', 'the upper voice stems up');
  eq(dirs.slice(2).join(','), 'down,down,down,down', 'the lower voice stems down');

  // Columns: every voice and staff shares one x per onset, which is what makes
  // the hands line up.
  const gs = engrave(parseLily(
    `\\new PianoStaff << \\new Staff { \\time 4/4 c''4 d'' e'' f'' } `
    + `\\new Staff { \\clef bass \\time 4/4 c4 d e f } >>`), { width: 800, staffSpace: sp });
  const xs = gs.events.filter((e) => !e.rest).map((e) => `${e.tick}@${Math.round(e.x)}`);
  const byTick = new Map();
  for (const s of xs) {
    const [t, x] = s.split('@');
    if (!byTick.has(t)) byTick.set(t, new Set());
    byTick.get(t).add(x);
  }
  ok([...byTick.values()].every((set) => set.size === 1),
    'notes that sound together are drawn at the same x on every staff');

  // Hit-test regions exist for note entry, one per staff per system.
  ok(gs.regions.length >= 2, 'the engraving exposes a clickable region per staff');
  ok(gs.regions.every((r) => r.hitBottom > r.hitTop && r.right > r.left && r.clef),
    'every region has a real box and a clef to read pitches against');
}

// ----------------------------------------------------------- 6. bar checks --
{
  const warn = (src) => engrave(parseLily(src), { width: 900 }).warnings;
  eq(warn(`\\relative c' { \\time 4/4 c4 d e f | g1 }`).length, 0, 'correct bars pass their checks');
  eq(warn(`\\relative c' { \\time 4/4 c4 d e | g1 }`).length, 1, 'a short bar is caught');
  eq(warn(`\\relative c' { \\time 3/4 \\partial 4 d4 | g2 b4 | }`).length, 0,
    'an upbeat makes the first bar short on purpose');
  eq(warn(`\\relative c' { \\time 4/4 c1 | \\time 3/4 c2. | }`).length, 0, 'a metre change moves the bar lines');
}

// ------------------------------------------------------------ 7. round trip --
{
  // The note editor writes pitches back into the source. If that spelling does
  // not read back as the same pitch, editing one note moves the rest of the
  // piece — which is exactly the bug this pins down.
  for (let dia = 14; dia <= 45; dia++) {
    for (const alter of [-1, 0, 1]) {
      const p = { ...pitchFromDiatonic(dia), alter };
      const back = midiList(parseLily(`{ ${pitchToLily(p)}4 }`))[0];
      eq(back, midiOf(p), `absolute round trip for ${pitchToLily(p)}`);

      // ...and the relative spelling, against every plausible reference. The
      // block's own argument IS the reference for its first note, so nothing
      // may intervene: an extra note in this fixture re-anchors the one under
      // test and turns a passing check into a meaningless one.
      for (const refDia of [dia - 5, dia - 1, dia, dia + 1, dia + 5]) {
        const ref = pitchFromDiatonic(refDia);
        const rel = pitchToLilyRelative(p, ref);
        const got = midiList(parseLily(`\\relative ${pitchToLily(ref)} { ${rel}4 }`));
        eq(got[0], midiOf(p), `relative round trip: ${rel} after ${pitchToLily(ref)}`);
      }
    }
  }
  eq(durationToLily(ticksOf(4, 1)), '4.', 'a dotted quarter writes back as 4.');
  eq(durationToLily(ticksOf(16)), '16', 'a sixteenth writes back as 16');
}

// --------------------------------------------------------------- 8. export --
{
  const score = parseLily(`\\relative c' { \\time 4/4 \\tempo 4 = 120 c4 d e f | g1 }`);
  const flat = scoreToNotes(score);
  const bytes = writeMidi(score, flat, { patch: 'piano' });
  eq(String.fromCharCode(...bytes.slice(0, 4)), 'MThd', 'the file starts with a MIDI header chunk');
  eq((bytes[8] << 8) | bytes[9], 1, 'format 1');
  eq((bytes[12] << 8) | bytes[13], PPQ, 'the tick division matches the engine, so nothing is requantised');
  ok(bytes.length > 60, 'the file has actual events in it');

  // A tie is ONE sound written as two notes. Playing it as two is the most
  // audible way to get a preview wrong.
  const tied = scoreToNotes(parseLily(`\\relative c' { \\time 4/4 c2 ~ c2 }`));
  eq(tied.notes.length, 1, 'two tied halves are one note');
  eq(tied.notes[0].ticks, WHOLE, '...lasting a whole note');

  const untied = scoreToNotes(parseLily(`\\relative c' { \\time 4/4 c2 c2 }`));
  eq(untied.notes.length, 2, 'two untied halves are two notes');

  // Repeats are expanded for playback, so the preview is the performance.
  const rep = scoreToNotes(parseLily(`\\relative c' { \\time 4/4 \\repeat volta 2 { c4 d e f } g1 }`));
  const played = buildPerformance(rep, { bpm: 120, unit: WHOLE / 4 }).events.length;
  eq(played, 9, 'a repeated bar of four plus a whole note plays nine notes');

  // Dynamics carry forward until the next mark, per voice.
  const dyn = scoreToNotes(parseLily(`\\relative c' { c4\\pp d e f\\ff g }`));
  ok(dyn.notes[0].velocity < dyn.notes[1].velocity + 0.001
     && dyn.notes[1].velocity === dyn.notes[0].velocity, 'a dynamic holds until the next one');
  ok(dyn.notes[4].velocity > dyn.notes[0].velocity, 'and ff is louder than pp');
}

// ------------------------------------------------------------- 9. library ---
// The bundled pieces are the site's front door and also its widest test: eight
// scores exercising upbeats, grand staves, four voices, 3/8, tuplets, mid-piece
// clef and key changes. Each must parse with no complaint AND satisfy its own
// bar checks — a transcription whose bars do not add up is a bug in the
// transcription, and `|` is what finds it.
{
  eq(LIBRARY.length, 9, 'the library has nine pieces');
  for (const piece of LIBRARY) {
    const score = parseLily(piece.source);
    eq(score.diagnostics.length, 0,
      `${piece.id}: parses with no diagnostics (${score.diagnostics.map((d) => d.message).join('; ')})`);
    const layout = engrave(score, { width: 900, staffSpace: 8 });
    eq(layout.warnings.length, 0,
      `${piece.id}: every bar check passes (${layout.warnings.map((w) => w.message).join('; ')})`);
    ok(layout.events.length > 0, `${piece.id}: engraves at least one note`);
    ok(layout.svg.startsWith('<svg') && layout.svg.endsWith('</svg>'), `${piece.id}: produces a whole SVG`);
    // The name in the picker has to be derivable from the score itself, or the
    // two drift and the list starts lying about what it opens.
    const headerName = score.subtitle ? `${score.title} (${score.subtitle})` : score.title;
    eq(headerName, piece.title, `${piece.id}: the picker label matches the score's own header`);

    const flat = scoreToNotes(score);
    ok(flat.notes.length > 0, `${piece.id}: has something to play`);
    ok(flat.notes.every((n) => n.midi >= 21 && n.midi <= 108),
      `${piece.id}: every note is inside a piano keyboard — an octave slip shows up here`);
    ok(writeMidi(score, flat, {}).length > 40, `${piece.id}: exports as MIDI`);
  }
  // Every piece must be reachable from the picker and carry its own blurb.
  ok(new Set(LIBRARY.map((p) => p.id)).size === LIBRARY.length, 'piece ids are unique');
  ok(LIBRARY.every((p) => p.blurb && p.title && p.composer), 'every piece is described');
}

// ------------------------------------------------------- 9. ensembles --
//
// A score with more than one player is not a taller keyboard score. What it
// adds is STRUCTURE — who plays which staves, what binds them, whose bars run
// together — and every part of that is invisible in a screenshot of the notes.
{
  const quartet = parseLily(String.raw`
\score { \new StaffGroup <<
  \new Staff \with { instrumentName = "Violin I" shortInstrumentName = "Vn. I" midiInstrument = "violin" }
    { \clef treble \key g \major c''4 d'' e'' f'' | g''2 g'' | }
  \new Staff \with { instrumentName = "Viola" shortInstrumentName = "Va." midiInstrument = "viola" }
    { \clef alto \key g \major g4 a b c' | d'2 d' | }
  \new Staff \with { instrumentName = "Cello" shortInstrumentName = "Vc." midiInstrument = "cello" }
    { \clef bass \key g \major c4 d e f | g2 g | }
>> }`);

  eq(quartet.staves.length, 3, 'ensemble: three \\new Staff make three staves');
  eq(quartet.diagnostics.length, 0, 'ensemble: a \\with block parses without complaint');
  // Several properties share one line; a greedy value match swallows the next
  // key and its value into the name.
  eq(quartet.staves[0].name, 'Violin I', 'ensemble: instrumentName stops at its own value');
  eq(quartet.staves[0].shortName, 'Vn. I', 'ensemble: shortInstrumentName is separate');
  eq(quartet.staves[1].midi, 'viola', 'ensemble: midiInstrument is separate');
  eq(JSON.stringify(quartet.groups), JSON.stringify([
    { kind: 'StaffGroup', from: 0, to: 2, name: '', shortName: '', midi: '' },
  ]), 'ensemble: the StaffGroup spans every staff it contains');

  // Notes must still be tagged with the staff they came from, or per-staff
  // timbre has nothing to key on and every part plays as a piano.
  const flat = scoreToNotes(quartet);
  eq(new Set(flat.notes.map((n) => n.staff)).size, 3, 'ensemble: notes carry their own staff');

  // The \markup form of a name, and the \set spelling, both occur in the wild.
  const markup = parseLily(String.raw`\score { << \new Staff \with {
    instrumentName = \markup { \column { "Violin" "I" } } } { c4 } >> }`);
  eq(markup.staves[0].name, 'Violin I', 'ensemble: a \\markup name is read');
  const viaSet = parseLily(String.raw`\score { << \new Staff {
    \set Staff.instrumentName = "Oboe" \set Staff.midiInstrument = "oboe" c4 d e f } >> }`);
  eq(viaSet.staves[0].name, 'Oboe', 'ensemble: \\set Staff.instrumentName is read');
  eq(viaSet.staves[0].midi, 'oboe', 'ensemble: \\set Staff.midiInstrument is read');
  eq(viaSet.staves[0].voices[0].filter((e) => e.kind === 'note').length, 4,
    'ensemble: recognising a \\set does not eat the notes after it');
}

// Nesting: a piano trio is the case that distinguishes a bracket from a brace.
{
  const trio = parseLily(String.raw`
\score { \new StaffGroup <<
  \new Staff \with { instrumentName = "Violin" } { \clef treble c'4 d' e' f' | }
  \new Staff \with { instrumentName = "Cello" } { \clef bass c4 d e f | }
  \new PianoStaff \with { instrumentName = "Piano" } <<
    \new Staff { \clef treble e'4 f' g' a' | }
    \new Staff { \clef bass c,4 d, e, f, | }
  >>
>> }`);
  eq(trio.staves.length, 4, 'trio: four staves');
  eq(trio.groups.length, 2, 'trio: two groups');
  const piano = trio.groups.find((g) => g.kind === 'PianoStaff');
  const outer = trio.groups.find((g) => g.kind === 'StaffGroup');
  eq(`${piano.from}-${piano.to}`, '2-3', 'trio: the PianoStaff covers only the pianist');
  eq(`${outer.from}-${outer.to}`, '0-3', 'trio: the StaffGroup covers everyone');
  eq(piano.name, 'Piano', 'trio: a group carries its own name');

  const layout = engrave(trio, { width: 900 });
  ok(layout.svg.includes('cf-bracket'), 'trio: a StaffGroup draws a bracket');
  ok(layout.svg.includes('cf-brace'), 'trio: a PianoStaff draws a brace');
  ok(layout.svg.includes('Piano'), 'trio: the group name is drawn');
  ok(layout.svg.includes('Violin'), 'trio: staff names are drawn');

  // Nesting must read the right way round: the innermost group sits CLOSEST to
  // the staves. Drawn the other way, the page says the ensemble is inside the
  // piano.
  const xOf = (cls) => {
    const m = new RegExp(`<path class="${cls}" d="M(-?[0-9.]+),`).exec(layout.svg);
    return m ? Number(m[1]) : NaN;
  };
  ok(xOf('cf-brace') > xOf('cf-bracket'),
    'trio: the brace is inside the bracket, not outside it');
}

// Bar lines: whether one crosses the gap between two staves is a statement
// about whether they share a bar, and the three group kinds differ.
{
  const src = (ctx) => String.raw`\score { \new ${ctx} <<
    \new Staff { \clef treble c'4 d' e' f' | g'1 | }
    \new Staff { \clef bass c4 d e f | g1 | }
  >> }`;
  const spanCount = (ctx) => {
    const layout = engrave(parseLily(src(ctx)), { width: 900 });
    const all = [...layout.svg.matchAll(
      /<line class="cf-barline" x1="([0-9.]+)" y1="([0-9.]+)" x2="[^"]*" y2="([0-9.]+)"/g)]
      .map(([, x, a, b]) => ({ x: Number(x), h: Number(b) - Number(a) }));
    // Ignore the line down the system's LEFT EDGE. That one joins every staff
    // in the system whatever the group kind — it is what says "these staves
    // sound together" — so measuring it answers no question. The bar lines
    // that distinguish the group kinds are the ones inside the system.
    const edge = Math.min(...all.map((l) => l.x));
    return Math.max(...all.filter((l) => l.x > edge).map((l) => l.h));
  };
  const staffOnly = 4 * 8; // four staff spaces at the default staffSpace
  ok(spanCount('StaffGroup') > staffOnly * 1.5,
    'barlines: a StaffGroup runs its bar lines through the gap');
  ok(spanCount('PianoStaff') > staffOnly * 1.5,
    'barlines: a PianoStaff runs its bar lines through the gap');
  eq(spanCount('ChoirStaff'), staffOnly,
    'barlines: a ChoirStaff does NOT — vocal staves are barred independently');
}

// A keyboard score must be untouched by all of the above.
{
  const piano = parseLily(String.raw`\score { \new PianoStaff <<
    \new Staff { \clef treble c'4 d' e' f' | }
    \new Staff { \clef bass c4 d e f | }
  >> }`);
  const layout = engrave(piano, { width: 900 });
  ok(layout.svg.includes('cf-brace'), 'keyboard: still braced');
  ok(!layout.svg.includes('cf-bracket'), 'keyboard: not bracketed');
  ok(!layout.svg.includes('cf-instrument'), 'keyboard: no name column when nothing is named');
}

// The GM name -> patch map. A lossy map is fine; a WRONG one is not, and the
// substring matching makes it easy to have "double bass" find "bass drum".
{
  eq(patchForInstrument('violin'), 'strings', 'patch: violin -> strings');
  eq(patchForInstrument('cello'), 'strings', 'patch: cello -> strings');
  eq(patchForInstrument('string ensemble 1'), 'strings', 'patch: a full GM name still matches');
  eq(patchForInstrument('acoustic grand piano'), 'piano', 'patch: grand piano -> piano');
  eq(patchForInstrument('harpsichord'), 'harpsichord', 'patch: harpsichord -> itself');
  eq(patchForInstrument('church organ'), 'organ', 'patch: organ -> organ');
  eq(patchForInstrument('clarinet'), 'flute', 'patch: winds land on the one wind we have');
  eq(patchForInstrument('trumpet'), 'flute', 'patch: brass too');
  eq(patchForInstrument(''), null, 'patch: nothing named means nothing chosen');
  eq(patchForInstrument('kazoo'), null, 'patch: an unknown instrument is refused, not guessed');
}

// ------------------------------------------- 10. the physical model --
//
// The committed pfsynth.wasm is a BINARY in the tree: nothing else in this repo
// would notice if it went stale, was truncated by a bad merge, or was built
// from different sources. It is also the one thing here that cannot be read to
// check. So it is exercised: loaded, run, and the audio it produces measured.
{
  const wasmPath = new URL('../vendor/pfsynth/pfsynth.wasm', import.meta.url);
  let bytes = null;
  try { bytes = readFileSync(wasmPath); } catch { /* reported below */ }
  ok(bytes && bytes.length > 1000, 'pfsynth: the built module is committed');

  // A truncated or wrong-architecture binary throws from the WebAssembly
  // constructors. Caught, so it is reported as this check failing rather than
  // as a stack trace that also cancels every check after it.
  let X = null;
  try {
    const mod = new WebAssembly.Module(bytes);
    // It must need NOTHING from the host. An import would mean the build picked
    // up WASI after all, and it would fail in a browser rather than here.
    eq(WebAssembly.Module.imports(mod).length, 0,
      'pfsynth: the module imports nothing, so it loads in a plain browser');
    X = new WebAssembly.Instance(mod, {}).exports;
  } catch (err) {
    ok(false, `pfsynth: the committed module loads — ${err.message}`);
  }

  const EXPORTS = ['pfw_begin', 'pfw_render', 'pfw_active', 'pfw_notes_ptr',
                   'pfw_out_ptr', 'pfw_max_notes', 'pfw_block'];
  const complete = X && EXPORTS.every((fn) => typeof X[fn] === 'function');
  for (const fn of EXPORTS) ok(X && typeof X[fn] === 'function', `pfsynth: exports ${fn}`);

  if (complete) {

    const sr = 44100;
    const block = X.pfw_block();
    const dv = new DataView(X.memory.buffer);
    const notes = X.pfw_notes_ptr();
    // A middle-C triad held for a second: enough voices to exercise the mix.
    const chord = [60, 64, 67];
    chord.forEach((midi, i) => {
      const p = notes + i * 16;
      dv.setInt32(p, 0, true);
      dv.setInt32(p + 4, sr, true);
      dv.setFloat32(p + 8, midi, true);
      dv.setFloat32(p + 12, 0.7, true);
    });
    X.pfw_begin(sr, chord.length, 110);

    const out = X.pfw_out_ptr();
    let peak = 0;
    let energy = 0;
    let frames = 0;
    let firstBlockPeak = 0;
    let finite = true;
    for (let b = 0; b < 40; b++) {
      const got = X.pfw_render(block);
      const buf = new Float32Array(X.memory.buffer, out, got * 2);
      let bp = 0;
      for (let i = 0; i < buf.length; i++) {
        const a = Math.abs(buf[i]);
        if (a > bp) bp = a;
        energy += buf[i] * buf[i];
        if (!Number.isFinite(buf[i])) { finite = false; }
      }
      if (b === 0) firstBlockPeak = bp;
      if (bp > peak) peak = bp;
      frames += got;
      if (!X.pfw_active()) break;
    }
    ok(frames > sr, 'pfsynth: renders at least a second of audio');
    // A struck string is loud at the strike and quieter later. Both halves
    // matter: silence means the hammer never fired, and a flat envelope means
    // the loop gain is wrong.
    ok(peak > 0.05, `pfsynth: the strike makes sound (peak ${peak.toFixed(3)})`);
    ok(peak <= 1.0001, 'pfsynth: the output stays inside the tanh limit');
    ok(firstBlockPeak > 0.01, 'pfsynth: the attack is in the FIRST block, not late');
    ok(energy > 0, 'pfsynth: the render carries energy');
    // A NaN anywhere is the classic failure of an unstable filter loop, and it
    // is silent: the WAV writer clamps it to zero and you hear a gap.
    ok(finite, 'pfsynth: every sample is finite — no NaN from an unstable loop');
  }
}

// ------------------------------------------------------------------ report --
console.log(`${checks - failures}/${checks} checks passed`);
if (failures) {
  console.error(`${failures} FAILED`);
  process.exit(1);
}
