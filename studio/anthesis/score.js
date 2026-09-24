// score.js — "Anthesis", for piano. The music, and the clock the plant grows by.
//
// This file is the single source of time for the piece. The animation never
// keeps its own schedule: every stage of growth (the seed swelling, the root
// breaking out, the hook clearing the soil, each leaf, the bud, each petal) is
// a CUE below, and each cue is pinned to a beat of the score. The piano and the
// plant agree because there is only one of them to disagree with.
//
// Pure data and arithmetic. No DOM, no audio; node imports it for the selftest.
//
// THE PIECE, section by section (bars of 4/4):
//
//   1–4    Dormancy.     Open fifths very low, and single high notes, one at a
//                        time, like water finding a seed. D dorian.
//   5–8    Germination.  A left-hand ostinato starts to move. A three-note
//                        figure (D–E–A: a step, then a leap) appears in the
//                        right hand. That figure is the plant; it comes back.
//   9–16   Leaves.       The melody. The harmony brightens bar by bar, from
//                        B-flat through G major (the dorian sixth) to B minor
//                        and E minor, never quite landing on D major.
//   17–20  Bud.          Pulsing octaves; the figure is sequenced upward; a
//                        borrowed G minor, then A7(b9), pushed and then held.
//   21–22  Bloom.        D major, at last, with a raised fourth (G#) in it: an
//                        eight-note cascade, one note per stage of opening.
//   23–26  Coda.         Falling high notes, slowing. The figure returns once,
//                        complete, and the last chord is left to ring.

// ------------------------------------------------------------------ tempo --

// [beat, bpm] keyframes; bpm is linearly interpolated between them.
const TEMPO = [
  [0, 60], [14, 62], [18, 72],        // dormancy is slower; waking up
  [66, 72], [76, 78],                  // the bud pushes
  [78.5, 64], [80, 52],                // and holds its breath
  [80.01, 68], [88, 66],               // bloom, a tempo
  [96, 60], [104, 48], [112, 44],      // the coda lets go
];

function bpmAt(b) {
  if (b <= TEMPO[0][0]) return TEMPO[0][1];
  for (let i = 1; i < TEMPO.length; i++) {
    const [b1, v1] = TEMPO[i];
    const [b0, v0] = TEMPO[i - 1];
    if (b <= b1) return v0 + (v1 - v0) * ((b - b0) / (b1 - b0));
  }
  return TEMPO[TEMPO.length - 1][1];
}

// Beat -> seconds, integrated once into a table.
const STEP = 1 / 64;
const TABLE = (() => {
  const n = Math.ceil(120 / STEP) + 1;
  const t = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const mid = (i - 0.5) * STEP;
    t[i] = t[i - 1] + (60 / bpmAt(mid)) * STEP;
  }
  return t;
})();

export function sec(beat) {
  const x = Math.max(0, beat) / STEP;
  const i = Math.min(TABLE.length - 2, Math.floor(x));
  return TABLE[i] + (TABLE[i + 1] - TABLE[i]) * (x - i);
}

/** Bar (1-based) and beat (0-based within it) to an absolute beat. */
const B = (bar, beat = 0) => (bar - 1) * 4 + beat;

// ------------------------------------------------------------------ notes --

// Note names, for legibility: 'D5' -> 74. Sharps with '#', flats with 'b'.
const STEPS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function m(name) {
  const r = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!r) throw new Error(`bad note ${name}`);
  return 12 * (Number(r[3]) + 1) + STEPS[r[1]] + (r[2] === '#' ? 1 : r[2] === 'b' ? -1 : 0);
}

const raw = [];   // { beat, dur (beats), midi, vel, tag?, i? }
function n(bar, beat, dur, names, vel, tag, i) {
  for (const nm of [].concat(names)) raw.push({ beat: B(bar, beat), dur, midi: m(nm), vel, tag, i });
}

// ---- 1–4  Dormancy ---------------------------------------------------------
n(1, 0, 4, ['D2', 'A2'], 0.30);
n(1, 2, 1, 'A5', 0.22, 'drop');
n(2, 0, 4, ['D2', 'A2'], 0.24);
n(2, 1.5, 1, 'E6', 0.18, 'drop');
n(2, 3, 1, 'D6', 0.20, 'drop');
n(3, 0, 4, ['Bb1', 'F2'], 0.28);
n(3, 1, 1, 'C6', 0.20, 'drop');
n(3, 2.5, 1, 'A5', 0.18, 'drop');
n(4, 0, 4, ['C2', 'G2'], 0.28);
n(4, 1, 1, 'G5', 0.20, 'drop');
n(4, 2, 1, 'E5', 0.21, 'drop');
n(4, 3.5, 0.5, 'D5', 0.24, 'crack');

// ---- 5–8  Germination: ostinato + the figure --------------------------------
const OST = [
  ['D2', 'A2', 'E3', 'A2', 'F3', 'A2', 'E3', 'A2'],
  ['Bb1', 'F2', 'C3', 'F2', 'D3', 'F2', 'C3', 'F2'],
  ['F2', 'C3', 'G3', 'C3', 'A3', 'C3', 'G3', 'C3'],
  ['C2', 'G2', 'D3', 'G2', 'E3', 'G2', 'D3', 'G2'],
];
OST.forEach((row, k) => {
  const base = 0.20 + k * 0.035;
  row.forEach((nm, j) => n(5 + k, j * 0.5, 0.5, nm, base + (j === 0 ? 0.06 : j % 2 ? -0.02 : 0), 'ost'));
});
n(5, 2, 2, 'A4', 0.24);
n(6, 0, 1, 'D5', 0.28, 'figure');
n(6, 1, 1, 'E5', 0.27, 'figure');
n(6, 2, 2, 'A4', 0.25);
n(7, 0, 1, 'C5', 0.29, 'figure');
n(7, 1, 1, 'D5', 0.28, 'figure');
n(7, 2, 2, 'G5', 0.30, 'figure');
n(8, 0, 2, 'E5', 0.31);
n(8, 2, 1, 'D5', 0.28);
n(8, 3, 1, 'C5', 0.27);

// ---- 9–16  Leaves: broken chords + melody -----------------------------------
// Voicings as [root, fifth, tenth, octave]; each bar is eight eighths.
const LH = [
  ['Bb1', 'F2', 'D3', 'Bb2'],   // 9   B-flat
  ['A1', 'F2', 'C3', 'A2'],     // 10  F/A
  ['G1', 'D2', 'B2', 'G2'],     // 11  G major: the dorian sixth, the first light
  ['A1', 'E2', 'C#3', 'A2'],    // 12  A
  ['B1', 'F#2', 'D3', 'B2'],    // 13  B minor 7
  ['G1', 'D2', 'B2', 'G2'],     // 14  G
  ['E2', 'B2', 'G3', 'E3'],     // 15  E minor 7
  ['A1', 'E2', 'D3', 'A2'],     // 16  A sus4
];
const PAT = [0, 1, 2, 1, 3, 2, 1, 2];
LH.forEach((v, k) => {
  PAT.forEach((p, j) => n(9 + k, j * 0.5, 0.5, v[p], (j === 0 ? 0.28 : 0.2) + k * 0.006));
});
const MEL = [
  [9, [[0, 1.5, 'D5'], [1.5, 0.5, 'C5'], [2, 1, 'D5'], [3, 1, 'F5']]],
  [10, [[0, 2, 'E5'], [2, 1, 'C5'], [3, 1, 'A4']]],
  [11, [[0, 1.5, 'B4'], [1.5, 0.5, 'C5'], [2, 1, 'D5'], [3, 1, 'G5']]],
  [12, [[0, 1, 'E5'], [1, 1, 'C#5'], [2, 2, 'A4']]],
  [13, [[0, 1.5, 'D5'], [1.5, 0.5, 'E5'], [2, 1, 'F#5'], [3, 1, 'A5']]],
  [14, [[0, 2, 'G5'], [2, 1, 'F#5'], [3, 1, 'D5']]],
  [15, [[0, 1, 'E5'], [1, 1, 'G5'], [2, 1.5, 'B5'], [3.5, 0.5, 'A5']]],
  [16, [[0, 2, 'A5'], [2, 1, 'G5'], [3, 1, 'E5']]],
];
MEL.forEach(([bar, notes]) => {
  notes.forEach(([beat, dur, nm], j) => {
    // Phrases lean into the bar and ease off; the long notes sing a little more.
    const vel = 0.36 + (j === 0 ? 0.05 : 0) + (dur >= 1.5 ? 0.03 : 0) + (bar - 9) * 0.006;
    n(bar, beat, dur, nm, vel, j === 0 ? 'leaf' : 'mel');
  });
});
// A soft inner third under the second half of the melody.
[[13, 'B4'], [14, 'D5'], [15, 'B4'], [16, 'E5']].forEach(([bar, nm]) => n(bar, 0, 2, nm, 0.2));

// ---- 17–20  Bud --------------------------------------------------------------
const BUD = [
  { bar: 17, lh: ['B1', 'B2'], chord: ['G4', 'B4', 'D5'], fig: ['D5', 'E5', 'A5'] },
  { bar: 18, lh: ['Bb1', 'Bb2'], chord: ['Bb4', 'D5', 'G5'], fig: ['D5', 'F5', 'Bb5'] },
];
BUD.forEach(({ bar, lh, chord, fig }, k) => {
  const lift = k * 0.06;
  for (let q = 0; q < 4; q++) n(bar, q, 1, lh, 0.26 + lift + q * 0.015, 'pulse');
  n(bar, 0, 2, chord, 0.28 + lift, 'swell');
  fig.forEach((nm, j) => n(bar, 2 + j * 0.5, j === 2 ? 1 : 0.5, nm, 0.32 + lift + j * 0.025, 'figure'));
});
for (let q = 0; q < 4; q++) n(19, q, 1, ['A1', 'A2'], 0.32 + q * 0.015, 'pulse');
[['D5', 'E5', 'A5'], ['E5', 'A5', 'D6'], ['A5', 'D6', 'E6'], ['B5', 'D6', 'E6']]
  .forEach((c, q) => n(19, q, 1, c, 0.35 + q * 0.025, 'swell'));
for (let q = 0; q < 4; q++) n(20, q, 1, ['A1', 'A2'], 0.38 + q * 0.02, 'pulse');
n(20, 0, 2, ['C#5', 'G5', 'Bb5'], 0.46, 'swell');
n(20, 2, 1, ['E5', 'G5', 'C#6'], 0.49, 'swell');
n(20, 3, 1, ['G5', 'Bb5', 'C#6', 'E6'], 0.52, 'swell');

// ---- 21–22  Bloom ------------------------------------------------------------
n(21, 0, 8, ['D1', 'A1', 'D2'], 0.66, 'bloom');
n(21, 0, 4, ['F#3', 'A3', 'D4', 'E4'], 0.52);
n(21, 0, 2, ['F#5', 'A5'], 0.56);
// The cascade: eight notes, eight stages of opening. `i` is the stage.
['D5', 'E5', 'F#5', 'G#5', 'A5', 'C#6', 'E6', 'F#6'].forEach((nm, i) => {
  const beat = 1 + i * 0.5;                       // bar 21 beat 1 .. bar 22 beat 0.5
  const bar = beat >= 4 ? 22 : 21;
  n(bar, beat % 4, 1, nm, 0.46 + i * 0.026, 'petal', i);
});
n(22, 0, 4, ['D2', 'A2'], 0.34);
n(22, 2, 0.5, 'E6', 0.26, 'shimmer');
n(22, 2.5, 0.5, 'C#6', 0.24, 'shimmer');
n(22, 3, 1, 'A5', 0.24, 'shimmer');

// ---- 23–26  Coda ---------------------------------------------------------------
[
  [23, ['D2', 'A2', 'C#3', 'E3'], ['A6', 'F#6', 'E6', 'C#6']],
  [24, ['D2', 'G2', 'B2', 'F#3'], ['D6', 'B5', 'A5', 'F#5']],
].forEach(([bar, lh, high], k) => {
  lh.forEach((nm, q) => n(bar, q, 1, nm, 0.27 - k * 0.02));
  high.forEach((nm, q) => n(bar, q + 0.5, 1, nm, 0.2 - k * 0.01, 'pollen'));
});
['D2', 'A2', 'E3', 'F#3'].forEach((nm, q) => n(25, q, 1, nm, 0.23));
n(25, 0, 1, 'D5', 0.29, 'figure');
n(25, 1, 1, 'E5', 0.28, 'figure');
n(25, 2, 2, 'A5', 0.30, 'figure');
// The last chord, rolled from the bottom and left to ring.
['D2', 'A2', 'F#3', 'A3', 'D4', 'E4', 'A4', 'F#5'].forEach((nm, j) => {
  raw.push({ beat: B(26, 0) + j * 0.07, dur: 8, midi: m(nm), vel: 0.30 - j * 0.008, tag: 'last' });
});
n(27, 1, 3, 'D6', 0.16, 'drop');

// ------------------------------------------------------------------ pedal --

// The sustain pedal, as [downBeat, upBeat) regions. A note struck inside a
// region rings until the pedal lifts, which is what makes a piano sound like a
// piano rather than a sequence of notes that stop. Changes follow the harmony.
const PEDAL = [];
for (let bar = 1; bar <= 16; bar++) PEDAL.push([B(bar), B(bar + 1)]);
for (let bar = 17; bar <= 20; bar++) { PEDAL.push([B(bar), B(bar, 2)]); PEDAL.push([B(bar, 2), B(bar + 1)]); }
PEDAL.push([B(21), B(23)]);
for (let bar = 23; bar <= 25; bar++) PEDAL.push([B(bar), B(bar + 1)]);
PEDAL.push([B(26), B(29)]);

function pedalUp(beat) {
  // The pedal changes a hair after the downbeat, so a note on the downbeat is
  // caught by the NEW pedal rather than cut off by the old one.
  for (const [d, u] of PEDAL) if (beat >= d - 0.05 && beat < u - 0.05) return u;
  return null;
}

// ------------------------------------------------------------- humanising --

// Seeded, so the performance is the same every time: the score is a fixed
// piece, not a generator.
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(0x5eed);

/** The performance: seconds, MIDI, velocity 0..1. Sorted by onset. */
export const events = raw
  .map((e) => {
    const up = pedalUp(e.beat);
    const endBeat = Math.max(e.beat + e.dur, up ?? 0);
    const jitter = (rnd() - 0.5) * 0.018;                 // ±9 ms
    const at = Math.max(0, sec(e.beat) + jitter);
    const end = sec(endBeat) - 0.01;
    return {
      at,
      dur: Math.max(0.05, end - at),
      midi: e.midi,
      velocity: Math.min(0.95, Math.max(0.05, e.vel * (1 + (rnd() - 0.5) * 0.08))),
      tag: e.tag,
      i: e.i,
      beat: e.beat,
    };
  })
  .sort((a, b) => a.at - b.at);

// ------------------------------------------------------------------- cues --

const tagged = (tag) => events.filter((e) => e.tag === tag);
const firstOf = (tag) => tagged(tag)[0].at;
const onsets = (tag) => [...new Set(tagged(tag).map((e) => e.at.toFixed(4)))].map(Number);

/**
 * Everything the plant needs to know, in seconds. The sketch reads only this.
 */
export const cues = {
  drops: tagged('drop').map((e) => ({ at: e.at, midi: e.midi })),
  crack: firstOf('crack'),                 // the seed coat splits
  root: sec(B(5)),                         // the radicle breaks out
  hypocotyl: sec(B(6, 2)),                 // the shoot starts up, hooked
  emerge: sec(B(8, 3.5)),                  // the hook clears the soil
  cotyledons: sec(B(9, 1)),                // the hook straightens; seed leaves open
  coatFalls: sec(B(10, 0)),
  leaves: tagged('leaf').filter((e) => e.beat >= B(11)).map((e) => e.at),  // one true leaf per bar, 11–16
  bud: sec(B(17)),
  swells: onsets('swell'),
  lift: sec(B(20, 2)),                     // the nodding bud lifts its head
  bloom: firstOf('bloom'),
  petals: tagged('petal').sort((a, b) => a.i - b.i).map((e) => e.at),
  pollen: tagged('pollen').map((e) => e.at),
  last: firstOf('last'),
  end: sec(B(28)),                         // the room has gone quiet
};

export const duration = cues.end;
export const title = 'Anthesis';
