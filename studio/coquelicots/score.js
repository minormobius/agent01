// score.js — "Coquelicots", for piano. The music, and the clock the painting keeps.
//
// A variation on Anthesis, and the same rule holds: every event in the picture
// is a cue pinned to a beat here, and the sketch reads nothing else.
//
// What is new is that the TEXTURE is the form. The painting starts as one ink
// dot on blank paper and the world is painted outward from it: soil, then the
// ground line, the field, the sky, the far trees, clouds, other poppies, and at
// the bloom the whole field flowers. The music adds a layer for each:
//
//   1–4    seed        one voice. High single notes; each is a drop of water.
//   5–8    soil        + a bass. Open fifths, very low, one per bar.
//   9–12   the ground  + a tenor ostinato in eighths, and the three-note figure
//                        (D–E–A: a step, then a leap) that is the plant.
//   13–20  the field   + the melody over broken chords. One leaf per bar.
//   21–26  the sky     + the melody doubled at the octave, a tenor counter-line,
//                        wider arpeggios. Trees, clouds, the other poppies.
//   27–28  the bud     pulsing chords; a borrowed G minor; A7(b9), held back.
//   29–34  bloom       everything: bass octaves, sweeping two-octave arpeggios,
//                        the melody in octaves, an eight-note cascade — D major
//                        at last, with a raised fourth in it. The field flowers.
//   35–41  coda        falling high notes (birds), the figure once more, and a
//                        wide last chord left to ring. The painter signs.

import { m, B, tempoMap, perform } from '../lib/score-kit.js';

const sec = tempoMap([
  [0, 56], [16, 58], [18, 64],        // seed and soil: slow
  [48, 66], [52, 70],                 // the field
  [104, 70], [110, 74],               // the bud pushes
  [110.5, 66], [112, 50],             // and holds its breath
  [112.01, 66], [134, 66],            // bloom
  [138, 60], [152, 54], [160, 44], [168, 40],
]);
export { sec };

const raw = [];
function n(bar, beat, dur, names, vel, tag, i) {
  for (const nm of [].concat(names)) raw.push({ beat: B(bar, beat), dur, midi: m(nm), vel, tag, i });
}
/** Eight eighths over a bar from a voicing [root, fifth, tenth, octave]. */
function broken(bar, v, vel, pat = [0, 1, 2, 1, 3, 2, 1, 2], tag) {
  pat.forEach((p, j) => n(bar, j * 0.5, 0.5, v[p], vel + (j === 0 ? 0.06 : 0), tag));
}

// ---- 1–4  seed: one voice ------------------------------------------------------
n(1, 2, 1, 'A5', 0.21, 'drop');
n(2, 0.5, 1, 'E6', 0.18, 'drop');
n(2, 2.5, 1, 'D6', 0.2, 'drop');
n(3, 1, 1, 'C6', 0.2, 'drop');
n(3, 3, 1, 'A5', 0.18, 'drop');
n(4, 0.5, 1, 'G5', 0.2, 'drop');
n(4, 2, 1, 'E5', 0.21, 'drop');
n(4, 3, 1, 'D2', 0.24, 'root');            // the first low note: the root goes down

// ---- 5–8  soil: + a bass ----------------------------------------------------------
[['D2', 'A2'], ['Bb1', 'F2'], ['G1', 'D2'], ['A1', 'E2']].forEach((v, k) => n(5 + k, 0, 4, v, 0.27 + k * 0.01, 'bass'));
n(5, 2, 1, 'A5', 0.2, 'drop');
n(6, 1, 1, 'F5', 0.2, 'drop');
n(6, 3, 1, 'D6', 0.19, 'drop');
n(7, 1.5, 1, 'B5', 0.21, 'drop');          // B natural: the dorian sixth, first light
n(8, 2, 2, 'C#6', 0.21, 'drop');

// ---- 9–12  the ground: + tenor ostinato, the figure -----------------------------
const OST = [
  ['D3', 'A3', 'E4', 'A3', 'F4', 'A3', 'E4', 'A3'],
  ['Bb2', 'F3', 'C4', 'F3', 'D4', 'F3', 'C4', 'F3'],
  ['F2', 'C3', 'G3', 'C3', 'A3', 'C3', 'G3', 'C3'],
  ['C3', 'G3', 'D4', 'G3', 'E4', 'G3', 'D4', 'G3'],
];
OST.forEach((row, k) => {
  row.forEach((nm, j) => n(9 + k, j * 0.5, 0.5, nm, 0.17 + k * 0.012 + (j === 0 ? 0.04 : 0), 'ost'));
});
[['D2'], ['Bb1'], ['F1', 'F2'], ['C2']].forEach((v, k) => n(9 + k, 0, 4, v, 0.26, 'bass'));
n(9, 2, 2, 'A4', 0.24, 'emerge');
n(10, 0, 1, 'D5', 0.28, 'figure');
n(10, 1, 1, 'E5', 0.27, 'figure');
n(10, 2, 2, 'A4', 0.25);
n(11, 0, 1, 'C5', 0.29, 'figure');
n(11, 1, 1, 'D5', 0.28, 'figure');
n(11, 2, 2, 'G5', 0.3, 'figure');
n(12, 0, 2, 'E5', 0.3);
n(12, 2, 1, 'D5', 0.28);
n(12, 3, 1, 'C5', 0.27);

// ---- 13–20  the field: melody over broken chords --------------------------------
const FIELD = [
  ['Bb1', 'F2', 'D3', 'Bb2'], ['A1', 'F2', 'C3', 'A2'], ['G1', 'D2', 'B2', 'G2'], ['A1', 'E2', 'C#3', 'A2'],
  ['B1', 'F#2', 'D3', 'B2'], ['G1', 'D2', 'B2', 'G2'], ['E2', 'B2', 'G3', 'E3'], ['A1', 'E2', 'D3', 'A2'],
];
FIELD.forEach((v, k) => broken(13 + k, v, 0.2 + k * 0.005));
const MEL1 = [
  [[0, 1.5, 'D5'], [1.5, 0.5, 'C5'], [2, 1, 'D5'], [3, 1, 'F5']],
  [[0, 2, 'E5'], [2, 1, 'C5'], [3, 1, 'A4']],
  [[0, 1.5, 'B4'], [1.5, 0.5, 'C5'], [2, 1, 'D5'], [3, 1, 'G5']],
  [[0, 1, 'E5'], [1, 1, 'C#5'], [2, 2, 'A4']],
  [[0, 1.5, 'D5'], [1.5, 0.5, 'E5'], [2, 1, 'F#5'], [3, 1, 'A5']],
  [[0, 2, 'G5'], [2, 1, 'F#5'], [3, 1, 'D5']],
  [[0, 1, 'E5'], [1, 1, 'G5'], [2, 1.5, 'B5'], [3.5, 0.5, 'A5']],
  [[0, 2, 'A5'], [2, 1, 'G5'], [3, 1, 'E5']],
];
MEL1.forEach((notes, k) => notes.forEach(([beat, dur, nm], j) => {
  n(13 + k, beat, dur, nm, 0.35 + (j === 0 ? 0.05 : 0) + (dur >= 1.5 ? 0.03 : 0) + k * 0.005, j === 0 ? 'phrase' : 'mel');
}));

// ---- 21–26  the sky: melody in octaves, tenor counter-line, wider arpeggios ------
const SKY = [
  ['G1', 'D2', 'B2', 'G2', 'D3'], ['A1', 'E2', 'C#3', 'A2', 'E3'], ['F#1', 'C#2', 'A2', 'F#2', 'C#3'],
  ['B1', 'F#2', 'D3', 'B2', 'F#3'], ['E2', 'B2', 'G3', 'E3', 'B3'], ['A1', 'E2', 'C#3', 'A2', 'G3'],
];
SKY.forEach((v, k) => broken(21 + k, v, 0.21 + k * 0.008, [0, 1, 3, 2, 4, 2, 3, 1]));
const MEL2 = [
  [[0, 1.5, 'B5'], [1.5, 0.5, 'A5'], [2, 1, 'G5'], [3, 1, 'D6']],
  [[0, 2, 'C#6'], [2, 1, 'B5'], [3, 1, 'A5']],
  [[0, 1.5, 'F#5'], [1.5, 0.5, 'A5'], [2, 1, 'C#6'], [3, 1, 'E6']],
  [[0, 2, 'D6'], [2, 1, 'C#6'], [3, 1, 'B5']],
  [[0, 1, 'G5'], [1, 1, 'B5'], [2, 1.5, 'E6'], [3.5, 0.5, 'D6']],
  [[0, 2, 'E6'], [2, 1, 'D6'], [3, 1, 'C#6']],
];
MEL2.forEach((notes, k) => notes.forEach(([beat, dur, nm], j) => {
  const v = 0.37 + (j === 0 ? 0.05 : 0) + k * 0.01;
  n(21 + k, beat, dur, nm, v, j === 0 ? 'phrase2' : 'mel');
  n(21 + k, beat, dur, nm.replace(/\d$/, (d) => String(Number(d) - 1)), v * 0.62);   // the octave below
}));
const TENOR = [['D4', 'F#4'], ['E4', 'C#4'], ['C#4', 'E4'], ['D4', 'F#4'], ['E4', 'G4'], ['E4', 'G4']];
TENOR.forEach(([a, b], k) => { n(21 + k, 0, 2, a, 0.22); n(21 + k, 2, 2, b, 0.22); });

// ---- 27–28  the bud ----------------------------------------------------------------
for (let q = 0; q < 4; q++) n(27, q, 1, ['Bb1', 'Bb2'], 0.3 + q * 0.015, 'pulse');
n(27, 0, 2, ['Bb4', 'D5', 'G5'], 0.34, 'swell');
['D5', 'F5', 'Bb5'].forEach((nm, j) => n(27, 2 + j * 0.5, j === 2 ? 1 : 0.5, nm, 0.36 + j * 0.03, 'figure'));
n(27, 2, 2, ['G3', 'D4'], 0.24);
for (let q = 0; q < 4; q++) n(28, q, 1, ['A1', 'A2'], 0.36 + q * 0.02, 'pulse');
n(28, 0, 2, ['C#5', 'G5', 'Bb5'], 0.44, 'swell');
n(28, 2, 1, ['E5', 'G5', 'C#6'], 0.47, 'swell');
n(28, 3, 1, ['G5', 'Bb5', 'C#6', 'E6'], 0.5, 'swell');
n(28, 0, 4, ['E3', 'G3', 'C#4'], 0.26);

// ---- 29–34  bloom: everything --------------------------------------------------------
n(29, 0, 8, ['D1', 'A1', 'D2'], 0.62, 'bloom');
n(29, 0, 2, ['F#5', 'A5', 'D6'], 0.5);
['D5', 'E5', 'F#5', 'G#5', 'A5', 'C#6', 'E6', 'F#6'].forEach((nm, i) => {
  const beat = 1 + i * 0.5;
  n(beat >= 4 ? 30 : 29, beat % 4, 1, nm, 0.44 + i * 0.024, 'petal', i);
});
// two-octave sweeps in the left hand
const SWEEP = {
  D: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4', 'A3', 'F#3'],
  G: ['G1', 'D2', 'G2', 'B2', 'D3', 'G3', 'D3', 'B2'],
  Bm: ['B1', 'F#2', 'B2', 'D3', 'F#3', 'B3', 'F#3', 'D3'],
  GA: ['G1', 'D2', 'G2', 'B2', 'A1', 'E2', 'A2', 'C#3'],
  Dl: ['D2', 'A2', 'E3', 'G#3', 'A3', 'E4', 'A3', 'E3'],
};
[['D', 29], ['D', 30], ['G', 31], ['Bm', 32], ['GA', 33], ['Dl', 34]].forEach(([k, bar]) => {
  if (bar === 29) return;                     // bar 29 is the cascade over the held bass
  SWEEP[k].forEach((nm, j) => n(bar, j * 0.5, 0.5, nm, 0.27 + (j === 0 ? 0.08 : 0), 'sweep'));
});
[['D1', 'D2'], ['G1', 'G2'], ['B0', 'B1'], ['G1', 'G2']].forEach((v, k) => n(30 + k, 0, 4, v, 0.46, 'bass'));
n(33, 2, 2, ['A1', 'A2'], 0.46, 'bass');
n(34, 0, 4, ['D1', 'A1', 'D2'], 0.52, 'bass');
const MEL3 = [
  [30, [[0, 1.5, 'F#5'], [1.5, 0.5, 'E5'], [2, 1, 'F#5'], [3, 1, 'A5']]],
  [31, [[0, 2, 'B5'], [2, 1, 'A5'], [3, 1, 'F#5']]],
  [32, [[0, 1.5, 'D6'], [1.5, 0.5, 'C#6'], [2, 1, 'B5'], [3, 1, 'F#5']]],
  [33, [[0, 1, 'E5'], [1, 1, 'F#5'], [2, 1, 'G5'], [3, 1, 'A5']]],
];
MEL3.forEach(([bar, notes]) => notes.forEach(([beat, dur, nm], j) => {
  const v = 0.5 + (j === 0 ? 0.04 : 0);
  n(bar, beat, dur, nm, v, 'burst');
  n(bar, beat, dur, nm.replace(/\d$/, (d) => String(Number(d) - 1)), v * 0.7);
}));
// inner chords on the beat
[[30, ['A4', 'D5']], [31, ['B4', 'D5']], [32, ['B4', 'D5']], [33, ['B4', 'C#5']]].forEach(([bar, c]) => {
  n(bar, 1, 1, c, 0.26); n(bar, 3, 1, c, 0.24);
});
// arrival: D with a raised fourth, and glitter falling from the top
n(34, 0, 4, ['F#4', 'A4', 'D5', 'E5', 'A5', 'D6'], 0.46, 'arrive');
['A6', 'F#6', 'E6', 'C#6', 'A5', 'G#5', 'F#5', 'E5', 'C#5', 'A4'].forEach((nm, j) => n(34, 1 + j * 0.25, 0.5, nm, 0.3 - j * 0.008, 'glitter'));

// ---- 35–41  coda -------------------------------------------------------------------
[
  [35, ['D2', 'A2', 'C#3', 'E3'], ['A6', 'F#6', 'E6', 'C#6'], ['F#4', 'A4']],
  [36, ['D2', 'G2', 'B2', 'F#3'], ['D6', 'B5', 'A5', 'F#5'], ['G4', 'B4']],
  [37, ['D2', 'F#2', 'B2', 'D3'], ['B5', 'A5', 'F#5', 'D5'], ['F#4', 'B4']],
].forEach(([bar, lh, high, mid], k) => {
  lh.forEach((nm, q) => n(bar, q, 1, nm, 0.28 - k * 0.015));
  high.forEach((nm, q) => n(bar, q + 0.5, 1, nm, 0.22 - k * 0.012, 'bird'));
  n(bar, 0, 4, mid, 0.2 - k * 0.01);
});
['D2', 'A2', 'E3', 'F#3'].forEach((nm, q) => n(38, q, 1, nm, 0.23));
n(38, 0, 1, 'D5', 0.3, 'figure');
n(38, 1, 1, 'E5', 0.29, 'figure');
n(38, 2, 2, 'A5', 0.31, 'figure');
// the last chord, rolled from the bottom and wider than Anthesis's
['D1', 'A1', 'D2', 'A2', 'F#3', 'A3', 'D4', 'E4', 'A4', 'F#5', 'A5', 'D6'].forEach((nm, j) => {
  raw.push({ beat: B(39, 0) + j * 0.08, dur: 10, midi: m(nm), vel: 0.34 - j * 0.01, tag: 'last' });
});
n(40, 3, 3, 'A6', 0.14, 'drop');

// ------------------------------------------------------------------ pedal --
const PEDAL = [];
const whole = (a, b) => { for (let bar = a; bar <= b; bar++) PEDAL.push([B(bar), B(bar + 1)]); };
whole(1, 32);
PEDAL.push([B(33), B(33, 2)], [B(33, 2), B(34)]);
whole(34, 38);
PEDAL.push([B(39), B(43)]);

export const events = perform(raw, sec, PEDAL, 0xc0c0);

// ------------------------------------------------------------------- cues --
const tagged = (tag) => events.filter((e) => e.tag === tag);
const first = (tag) => tagged(tag)[0].at;

export const cues = {
  ink: 0.4,                                     // the first mark: the seed, one ink dot
  drops: tagged('drop').map((e) => e.at),
  root: first('root'),
  soil: [sec(B(5)), sec(B(9))],                 // the soil band is painted out from the seed
  hypocotyl: sec(B(7)),
  emerge: sec(B(9)),                            // the ground line is drawn
  cotyledons: sec(B(10)),
  ground: [sec(B(9)), sec(B(13))],              // near ground around the stem
  field: [sec(B(13)), sec(B(19))],
  leaves: tagged('phrase').filter((e) => e.beat >= B(14)).map((e) => e.at).slice(0, 6),
  sky: [sec(B(17)), sec(B(23))],
  trees: [sec(B(19)), sec(B(24))],
  bud: sec(B(21)),
  clouds: [sec(B(21)), sec(B(26))],
  poppies: [sec(B(23)), sec(B(29))],
  swells: [...new Set(tagged('swell').map((e) => +e.at.toFixed(3)))],
  lift: sec(B(28, 2)),
  bloom: first('bloom'),
  petals: tagged('petal').sort((a, b) => a.i - b.i).map((e) => e.at),
  bursts: tagged('burst').map((e) => e.at),     // the field flowers, a wave per melody note
  arrive: first('arrive'),
  glitter: tagged('glitter').map((e) => e.at),
  birds: tagged('bird').map((e) => e.at),
  last: first('last'),
  end: sec(B(42)),
};

export const duration = cues.end;
export const title = 'Coquelicots';
