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

import { parseLily, pitchToLily, pitchToLilyRelative, durationToLily } from '../src/lily.js';
import { engrave } from '../src/engrave.js';
import { scoreToNotes, performance as buildPerformance } from '../src/audio.js';
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

  // Unsupported input must be REPORTED, never silently dropped.
  const g = parseLily(`\\relative c' { \\grace d8 c4 }`);
  ok(g.diagnostics.some((d) => /grace/.test(d.message)), 'grace notes are reported, not swallowed');
  ok(parseLily(LIBRARY[0].source).diagnostics.length === 0, 'valid input produces no diagnostics');
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
  eq(LIBRARY.length, 8, 'the library has eight pieces');
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

// ------------------------------------------------------------------ report --
console.log(`${checks - failures}/${checks} checks passed`);
if (failures) {
  console.error(`${failures} FAILED`);
  process.exit(1);
}
