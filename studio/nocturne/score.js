// score.js — "Nocturne", for piano. The music, and the city it lights.
//
// Every note in this file is a window. Time runs left to right along the
// street — one building per bar, one column of windows per eighth note — and
// pitch is height, one floor per semitone. So the melody lights the tops of the
// towers, the left hand's arpeggios the busy lower floors, and bass notes below
// the city switch on the lamps along the quay. The skyline itself is drawn from
// the music: each building is as tall as the highest note in its bar.
//
//   1–8    A        D-flat major. The left hand alone for a bar (dusk: the pen
//                   draws), then the melody: a turn around A-flat, a leap to F.
//   9–16   A′       the melody an octave up, varied; F7 at the end turns to
//   17–24  B        B-flat minor: the melody in octaves, climbing by sequence to
//                   the piece's highest note (G-flat 6, bar 22 — the tallest
//                   tower), then falling back to A-flat 7.
//   25–32  A″       the return, as at first.
//   33–37  coda     chiming chords over a held D-flat, a darker G-flat minor
//                   colour, then everything rolled into one wide chord.

import { m, B, tempoMap, perform } from '../lib/score-kit.js';

export const sec = tempoMap([
  [0, 60], [4, 66],
  [64, 66], [68, 70], [84, 72],          // B: pushing
  [90, 66], [95, 56], [96.01, 64],        // and the breath before the return
  [128, 62], [140, 54], [148, 44], [156, 40],
]);

const raw = [];
function n(bar, beat, dur, names, vel, tag, extra) {
  for (const nm of [].concat(names)) raw.push({ beat: B(bar, beat), dur, midi: m(nm), name: nm, vel, tag, ...extra });
}
/** Left hand: eight eighths over [root, fifth, octave, tenth, twelfth]. */
function lh(bar, v, vel, half) {
  const pat = [0, 1, 2, 3, 4, 3, 2, 1];
  pat.forEach((p, j) => {
    const voicing = half && j >= 4 ? half : v;
    n(bar, j * 0.5, 0.5, voicing[p], vel + (j === 0 || (half && j === 4) ? 0.06 : 0), 'lh');
  });
}
const mel = (bar, notes, vel, tag = 'mel', octave = false) => notes.forEach(([beat, dur, nm], j) => {
  const v = vel + (j === 0 ? 0.04 : 0) + (dur >= 1.5 ? 0.03 : 0);
  n(bar, beat, dur, nm, v, tag);
  if (octave) n(bar, beat, dur, nm.replace(/-?\d$/, (d) => String(Number(d) - 1)), v * 0.7, tag);
});

// Voicings
const V = {
  Db: ['Db2', 'Ab2', 'Db3', 'F3', 'Ab3'],
  GbDb: ['Db2', 'Bb2', 'Db3', 'Gb3', 'Bb3'],
  Ab7: ['Ab1', 'Eb2', 'Gb2', 'C3', 'Eb3'],
  DbF: ['F2', 'Ab2', 'Db3', 'F3', 'Ab3'],
  Bbm: ['Bb1', 'F2', 'Bb2', 'Db3', 'F3'],
  Ebm7: ['Eb2', 'Bb2', 'Db3', 'Gb3', 'Bb3'],
  F7: ['F1', 'C2', 'Eb2', 'A2', 'C3'],
  Gb: ['Gb1', 'Db2', 'Gb2', 'Bb2', 'Db3'],
  Gbmaj7: ['Gb1', 'Db2', 'F2', 'Bb2', 'Db3'],
  Ebm: ['Eb2', 'Bb2', 'Eb3', 'Gb3', 'Bb3'],
  Ebm9: ['Eb2', 'Bb2', 'Db3', 'F3', 'Gb3'],
};

// ---- A: 1–8 ----------------------------------------------------------------
const A_HARM = [V.Db, V.Db, V.GbDb, V.Ab7, V.Db, V.Bbm, [V.Ebm7, V.Ab7], V.Db];
const A_MEL = [
  null,
  [[0, 1.5, 'Ab4'], [1.5, 0.5, 'Bb4'], [2, 1, 'Ab4'], [3, 1, 'F5']],
  [[0, 2, 'Eb5'], [2, 1, 'Db5'], [3, 1, 'Bb4']],
  [[0, 1.5, 'C5'], [1.5, 0.5, 'Db5'], [2, 1, 'Eb5'], [3, 1, 'Gb5']],
  [[0, 3, 'F5'], [3, 0.5, 'Eb5'], [3.5, 0.5, 'Db5']],
  [[0, 1.5, 'Db5'], [1.5, 0.5, 'C5'], [2, 1, 'Db5'], [3, 1, 'Bb5']],
  [[0, 1, 'Ab5'], [1, 1, 'Gb5'], [2, 1, 'F5'], [3, 1, 'Eb5']],
  [[0, 4, 'Db5']],
];
function sectionA(start, velL, velM, octave = false) {
  A_HARM.forEach((h, k) => {
    const [a, b] = Array.isArray(h[0]) ? h : [h, null];
    lh(start + k, a, velL, b);
  });
  A_MEL.forEach((notes, k) => { if (notes) mel(start + k, notes, velM, k === 1 ? 'phrase' : 'mel', octave); });
}
sectionA(1, 0.2, 0.36);

// ---- A′: 9–16 ---------------------------------------------------------------
[V.Db, V.GbDb, V.Ab7, V.DbF, V.Bbm, [V.Ebm7, V.Ab7], V.Db, V.F7].forEach((h, k) => {
  const [a, b] = Array.isArray(h[0]) ? h : [h, null];
  lh(9 + k, a, 0.22 + k * 0.004, b);
});
[
  [[0, 1.5, 'F5'], [1.5, 0.5, 'Gb5'], [2, 1, 'F5'], [3, 1, 'Db6']],
  [[0, 2, 'Bb5'], [2, 1, 'Ab5'], [3, 1, 'Gb5']],
  [[0, 1.5, 'Gb5'], [1.5, 0.5, 'Ab5'], [2, 1, 'Bb5'], [3, 1, 'C6']],
  [[0, 3, 'Db6'], [3, 0.5, 'C6'], [3.5, 0.5, 'Bb5']],
  [[0, 1.5, 'Bb5'], [1.5, 0.5, 'Ab5'], [2, 1, 'F5'], [3, 1, 'Db6']],
  [[0, 1, 'Eb6'], [1, 1, 'Db6'], [2, 1, 'C6'], [3, 1, 'Bb5']],
  [[0, 2, 'Ab5'], [2, 2, 'F5']],
  [[0, 1, 'A5'], [1, 1, 'C6'], [2, 1, 'Eb6'], [3, 1, 'A5']],
].forEach((notes, k) => mel(9 + k, notes, 0.38 + k * 0.004, k === 0 ? 'phrase' : 'mel'));
// an inner voice under the second half
[[12, ['Ab4', 'Db5']], [13, ['F4', 'Bb4']], [14, ['Gb4', 'C5']], [15, ['F4', 'Ab4']]].forEach(([bar, c]) => n(bar, 0, 2, c, 0.2));

// ---- B: 17–24, B-flat minor, the melody in octaves ------------------------------
[V.Bbm, V.Gb, V.Ebm, V.F7, V.Bbm, V.Gbmaj7, V.Ebm9, V.Ab7].forEach((h, k) => lh(17 + k, h, 0.24 + Math.min(k, 5) * 0.02 - Math.max(0, k - 5) * 0.03));
const B_MEL = [
  [[0, 1, 'F5'], [1, 1, 'Gb5'], [2, 1, 'Ab5'], [3, 1, 'Bb5']],
  [[0, 2, 'Db6'], [2, 1, 'Bb5'], [3, 1, 'Gb5']],
  [[0, 1, 'Gb5'], [1, 1, 'Ab5'], [2, 1, 'Bb5'], [3, 1, 'Db6']],
  [[0, 2, 'C6'], [2, 1, 'A5'], [3, 1, 'F5']],
  [[0, 1, 'F5'], [1, 1, 'Bb5'], [2, 1, 'Db6'], [3, 1, 'F6']],
  [[0, 2, 'Gb6'], [2, 1, 'F6'], [3, 1, 'Db6']],
  [[0, 1.5, 'Eb6'], [1.5, 0.5, 'Db6'], [2, 1, 'Bb5'], [3, 1, 'Gb5']],
  [[0, 1, 'F5'], [1, 1, 'Eb5'], [2, 1, 'C5'], [3, 1, 'Ab4']],
];
const B_VEL = [0.4, 0.42, 0.45, 0.47, 0.5, 0.56, 0.48, 0.4];
B_MEL.forEach((notes, k) => mel(17 + k, notes, B_VEL[k], k === 5 ? 'summit' : k === 0 ? 'phrase' : 'mel', true));
// chords on the off-beats, thickening toward the summit
[[20, ['A4', 'C5', 'Eb5']], [21, ['Bb4', 'Db5', 'F5']], [22, ['Bb4', 'Db5', 'F5']], [23, ['Bb4', 'Db5', 'Gb5']]].forEach(([bar, c]) => {
  n(bar, 1, 1, c, 0.28); n(bar, 3, 1, c, 0.26);
});

// ---- A″: 25–32 ------------------------------------------------------------------
sectionA(25, 0.2, 0.38);
n(32, 0, 4, ['Ab4', 'F4'], 0.2);

// ---- coda: 33–37 ------------------------------------------------------------------
[33, 34, 35, 36].forEach((bar, k) => n(bar, 0, 4, ['Db1', 'Db2'], 0.34 - k * 0.03, 'lamp'));
[
  [33, ['Ab5', 'Db6', 'F6'], ['Gb5', 'Bb5', 'Eb6']],
  [34, ['F5', 'Ab5', 'Db6'], ['Eb5', 'Gb5', 'C6']],
  [35, ['Db5', 'Gb5', 'A5'], ['C5', 'F5', 'Ab5']],
  [36, ['Bb4', 'Db5', 'F5'], ['Ab4', 'C5', 'Eb5']],
].forEach(([bar, a, b], k) => {
  n(bar, 0, 2, a, 0.34 - k * 0.03, 'chime');
  n(bar, 2, 2, b, 0.3 - k * 0.03, 'chime');
  n(bar, 1, 1, 'Ab3', 0.16);
  n(bar, 3, 1, 'F3', 0.15);
});
['Db1', 'Ab1', 'Db2', 'Ab2', 'F3', 'Ab3', 'Db4', 'F4', 'Ab4', 'Db5', 'F5', 'Ab5', 'Db6'].forEach((nm, j) => {
  raw.push({ beat: B(37, 0) + j * 0.07, dur: 8, midi: m(nm), name: nm, vel: 0.3 - j * 0.006, tag: 'last', written: B(37, 0), roll: true });
});
n(38, 2, 2, 'Ab6', 0.14, 'star');

// ------------------------------------------------------------------ pedal --
const PEDAL = [];
for (let bar = 1; bar <= 36; bar++) {
  if (bar === 7 || bar === 14 || bar === 31) { PEDAL.push([B(bar), B(bar, 2)], [B(bar, 2), B(bar + 1)]); continue; }
  PEDAL.push([B(bar), B(bar + 1)]);
}
PEDAL.push([B(37), B(41)]);

export const events = perform(raw, sec, PEDAL, 0x0c7e);

// ------------------------------------------------------------------- cues --
export const BARS = 38;
export const cues = {
  melody: events.find((e) => e.tag === 'phrase').at,
  summit: events.find((e) => e.tag === 'summit').at,
  ret: sec(B(25)),
  coda: sec(B(33)),
  last: events.find((e) => e.tag === 'last').at,
  star: events.find((e) => e.tag === 'star').at,
  end: sec(B(40)),
};
export const duration = cues.end;
export const title = 'Nocturne';

/** The notes as WRITTEN, for the city (one window each) and for the score. */
export const written = raw;
export const notation = {
  bars: BARS,
  keys: [[1, 'des', 'major'], [17, 'bes', 'minor'], [25, 'des', 'major']],
  tempos: [[1, 60], [2, 66], [17, 70], [25, 64], [33, 62]],
  sections: [[1, 'dusk'], [9, 'the lights come on'], [17, 'the city at full height'], [25, 'late'], [33, 'the last lights']],
};
