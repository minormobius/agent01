// model.js — the vocabulary of Western notation, as data.
//
// Everything downstream (parser, engraver, synth, MIDI writer) speaks these
// types. There are only three ideas here and they are worth stating plainly,
// because conflating any two of them is how notation software goes wrong:
//
//   1. A PITCH is (step, alter, octave) — a *spelling*. C-sharp and D-flat are
//      different pitches that happen to sound the same. The engraver needs the
//      spelling (it decides which line the notehead sits on); the synth needs
//      only the sounding MIDI number. Keep both, derive the second.
//   2. A DURATION is an integer number of ticks. Never a float: dotted and
//      tuplet arithmetic has to be exact or bar lines drift by a rounding error
//      halfway down a page.
//   3. A STAFF POSITION is a diatonic distance from the middle line, in
//      half-spaces, positive upward. It depends on the clef and NOT on the
//      accidental — which is exactly why (1) stores a spelling.

// Ticks per quarter note. 960 is divisible by 2^6 and by 3 and 5, so every
// duration this notation admits — up to 64th notes, triplets, quintuplets —
// lands on an integer.
export const PPQ = 960;
export const WHOLE = PPQ * 4;

export const STEP_NAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
// Semitones above C for each diatonic step.
export const STEP_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

/** Sounding MIDI number. Middle C (`c'` in LilyPond) is 60. */
export function midiOf(p) {
  return 12 * (p.octave + 1) + STEP_SEMITONES[p.step] + p.alter;
}

/** Diatonic index: counts letter names, ignoring accidentals. C4 -> 28. */
export function diatonicOf(p) {
  return p.octave * 7 + p.step;
}

/** Equal-tempered frequency, A4 = 440. */
export function freqOf(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Pitch back out of a diatonic index (used by click-to-enter note input). */
export function pitchFromDiatonic(dia, alter = 0) {
  const octave = Math.floor(dia / 7);
  return { step: dia - octave * 7, alter, octave };
}

/** Human spelling, e.g. { step:0, alter:1, octave:4 } -> "C♯4". */
export function spell(p) {
  const marks = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };
  return STEP_NAMES[p.step].toUpperCase() + (marks[p.alter] ?? '') + p.octave;
}

// ------------------------------------------------------------------ clefs --
// `middleDia` is the diatonic index of the pitch that sits ON THE MIDDLE LINE.
// That one number is the whole clef, as far as layout is concerned: staff
// position is just `diatonicOf(pitch) - middleDia`.
//
// `sounds` is the transposition in semitones between what is written and what
// is heard — the octave-down treble clef used for tenor voices and guitar is
// written exactly like a treble clef and sounds an octave lower.
export const CLEFS = {
  treble:     { glyph: 'gClef',  line: 2, middleDia: 34, sounds: 0,   label: 'treble' },
  violin:     { glyph: 'gClef',  line: 2, middleDia: 34, sounds: 0,   label: 'treble' },
  G:          { glyph: 'gClef',  line: 2, middleDia: 34, sounds: 0,   label: 'treble' },
  'treble_8': { glyph: 'gClef',  line: 2, middleDia: 34, sounds: -12, label: 'treble 8vb', ottava: -1 },
  tenorG:     { glyph: 'gClef',  line: 2, middleDia: 34, sounds: -12, label: 'treble 8vb', ottava: -1 },
  bass:       { glyph: 'fClef',  line: 4, middleDia: 22, sounds: 0,   label: 'bass' },
  F:          { glyph: 'fClef',  line: 4, middleDia: 22, sounds: 0,   label: 'bass' },
  'bass_8':   { glyph: 'fClef',  line: 4, middleDia: 22, sounds: -12, label: 'bass 8vb', ottava: -1 },
  alto:       { glyph: 'cClef',  line: 3, middleDia: 28, sounds: 0,   label: 'alto' },
  C:          { glyph: 'cClef',  line: 3, middleDia: 28, sounds: 0,   label: 'alto' },
  viola:      { glyph: 'cClef',  line: 3, middleDia: 28, sounds: 0,   label: 'alto' },
  tenor:      { glyph: 'cClef',  line: 4, middleDia: 26, sounds: 0,   label: 'tenor' },
  soprano:    { glyph: 'cClef',  line: 1, middleDia: 30, sounds: 0,   label: 'soprano' },
  mezzosoprano: { glyph: 'cClef', line: 2, middleDia: 29, sounds: 0,  label: 'mezzo-soprano' },
  baritone:   { glyph: 'fClef',  line: 3, middleDia: 24, sounds: 0,   label: 'baritone' },
};

export function clefDef(name) {
  return CLEFS[name] || CLEFS.treble;
}

/**
 * Staff position in HALF-SPACES above the middle line. The middle line is 0,
 * the space above it is 1, the line above that is 2, and so on downward
 * negatively. Ledger lines are just |position| > 4.
 */
export function staffPos(pitch, clef) {
  return diatonicOf(pitch) - clefDef(clef).middleDia;
}

// --------------------------------------------------------- key signatures --
// Sharps enter in the order F C G D A E B; flats in the reverse, B E A D G C F.
// A key signature is one integer — its count of fifths — and everything else
// (which letters are altered, where the glyphs go) falls out of that.
export const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // f c g d a e b
export const FLAT_ORDER  = [6, 2, 5, 1, 4, 0, 3]; // b e a d g c f

const MAJOR_FIFTHS = {
  ces: -7, ges: -6, des: -5, as: -4, es: -3, bes: -2, f: -1,
  c: 0, g: 1, d: 2, a: 3, e: 4, b: 5, fis: 6, cis: 7,
};
const MINOR_FIFTHS = {
  as: -7, es: -6, bes: -5, f: -4, c: -3, g: -2, d: -1,
  a: 0, e: 1, b: 2, fis: 3, cis: 4, gis: 5, dis: 6, ais: 7,
};
// The church modes are the same seven notes started from a different degree,
// so each is just an offset in fifths from the major of the same tonic.
const MODE_OFFSET = {
  major: 0, ionian: 0, minor: -3, aeolian: -3, dorian: -2,
  phrygian: -4, lydian: 1, mixolydian: -1, locrian: -5,
};

/** `\key es \major` -> -3. Returns null for a tonic this doesn't recognise. */
export function fifthsOf(tonic, mode = 'major') {
  const m = String(mode).replace(/^\\/, '').toLowerCase();
  if (m === 'minor' || m === 'aeolian') {
    return MINOR_FIFTHS[tonic] ?? null;
  }
  const base = MAJOR_FIFTHS[tonic];
  if (base === undefined) return null;
  const off = MODE_OFFSET[m];
  if (off === undefined) return null;
  return base + off;
}

/** Which letters the key signature alters, as step -> alter (+1 or -1). */
export function keyAlterations(fifths) {
  const map = new Map();
  if (fifths > 0) for (let i = 0; i < Math.min(fifths, 7); i++) map.set(SHARP_ORDER[i], 1);
  else for (let i = 0; i < Math.min(-fifths, 7); i++) map.set(FLAT_ORDER[i], -1);
  return map;
}

/**
 * Where the key signature's accidentals sit, in staff positions, for a clef.
 *
 * Engraving convention is not "put it on any octave" — the accidentals occupy a
 * fixed band so the signature reads as one shape. The rule used here is the
 * traditional one: start from a reference position per clef family and step by
 * the interval pattern, folding an accidental down an octave when it would
 * climb above the top line (or, for flats, below the bottom).
 */
export function keySignaturePositions(fifths, clefName) {
  const clef = clefDef(clefName);
  const out = [];
  const n = Math.min(Math.abs(fifths), 7);
  const order = fifths > 0 ? SHARP_ORDER : FLAT_ORDER;
  // Highest octave whose accidentals still fit comfortably on the staff.
  for (let i = 0; i < n; i++) {
    const step = order[i];
    // Pick the octave putting this letter nearest the middle line, then bias
    // upward for sharps and downward for flats — matching engraved practice.
    let pos = ((step - clef.middleDia) % 7 + 7) % 7;      // 0..6 above middle line
    if (fifths > 0) { if (pos > 4) pos -= 7; }             // sharps live -3..+4
    else { if (pos > 3) pos -= 7; }                        // flats live -4..+3
    out.push({ step, alter: fifths > 0 ? 1 : -1, pos });
  }
  // Successive accidentals must never leap more than a fifth apart, or the
  // signature looks scattered. Nudge any outlier by an octave toward its
  // neighbour. This is the "fold" that makes B-major and D-flat-major read.
  for (let i = 1; i < out.length; i++) {
    while (out[i].pos - out[i - 1].pos > 4) out[i].pos -= 7;
    while (out[i - 1].pos - out[i].pos > 4) out[i].pos += 7;
  }
  return out;
}

// -------------------------------------------------------------- durations --
/** ticksOf(4) is a quarter note; ticksOf(4, 1) a dotted quarter. */
export function ticksOf(denominator, dots = 0) {
  let base = WHOLE / denominator;
  let total = base;
  for (let i = 0; i < dots; i++) { base /= 2; total += base; }
  return Math.round(total);
}

// The note VALUE a duration is drawn with — which is not the same as how long
// it lasts. A dotted quarter is drawn as a quarter (one flag-less stem) plus a
// dot. This table maps undotted tick values to their notational identity.
const NOTE_VALUES = [
  { ticks: WHOLE * 2, denom: 0.5, head: 'breve',  stem: false, flags: 0 },
  { ticks: WHOLE,     denom: 1,   head: 'whole',  stem: false, flags: 0 },
  { ticks: WHOLE / 2, denom: 2,   head: 'half',   stem: true,  flags: 0 },
  { ticks: WHOLE / 4, denom: 4,   head: 'black',  stem: true,  flags: 0 },
  { ticks: WHOLE / 8, denom: 8,   head: 'black',  stem: true,  flags: 1 },
  { ticks: WHOLE / 16, denom: 16, head: 'black',  stem: true,  flags: 2 },
  { ticks: WHOLE / 32, denom: 32, head: 'black',  stem: true,  flags: 3 },
  { ticks: WHOLE / 64, denom: 64, head: 'black',  stem: true,  flags: 4 },
  { ticks: WHOLE / 128, denom: 128, head: 'black', stem: true, flags: 5 },
];

/**
 * Decompose a tick count into how it should be DRAWN: base note value plus
 * dots. Returns null when the duration is not expressible as a dotted value
 * (a triplet eighth, say) — callers pass the written value alongside the
 * played value for those, which is exactly what tuplets are.
 */
export function noteValue(ticks, maxDots = 3) {
  for (const v of NOTE_VALUES) {
    if (v.ticks > ticks) continue;
    let acc = v.ticks;
    let add = v.ticks;
    for (let dots = 0; dots <= maxDots; dots++) {
      if (acc === ticks) return { ...v, dots };
      add /= 2;
      acc += add;
      if (acc > ticks) break;
    }
  }
  return null;
}

/** The written value for a duration, falling back to the nearest smaller one. */
export function noteValueOrNearest(ticks) {
  return noteValue(ticks) || noteValue(NOTE_VALUES.find((v) => v.ticks <= ticks)?.ticks ?? WHOLE / 4) || {
    ticks: WHOLE / 4, denom: 4, head: 'black', stem: true, flags: 0, dots: 0,
  };
}

// ------------------------------------------------------------ time signature --
export function timeTicks(num, den) {
  return Math.round((WHOLE / den) * num);
}

/**
 * Beat groups for beaming, in ticks, for a time signature.
 *
 * Beaming is what makes a rhythm legible at a glance: eighths in 6/8 group in
 * threes because 6/8 has two dotted-quarter beats, and grouping them in twos
 * makes the bar read as 3/4. So this returns the *beat units* a bar divides
 * into, and the beamer never lets a beam cross one.
 */
export function beatGroups(num, den) {
  const beat = WHOLE / den;
  // Compound metres (6/8, 9/8, 12/8) beat in dotted groups of three.
  if (den >= 8 && num % 3 === 0 && num > 3) {
    return Array(num / 3).fill(beat * 3);
  }
  // 3/8 is one beat, not three: its bars are beamed whole. Treating it as three
  // separate eighth beats chops a run of sixteenths into pairs and destroys the
  // shape of the bar — which is exactly what it does to the opening of
  // "Für Elise", where six sixteenths are one gesture.
  if (den >= 8 && num === 3) return [beat * 3];
  if (num === 4 && den === 4) return [beat * 2, beat * 2]; // 4/4 beams in halves
  if (num === 2 && den === 2) return [beat, beat];
  return Array(num).fill(beat);
}
