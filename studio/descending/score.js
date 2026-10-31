// score.js — "Descending": Daisy Bell, sung by arithmetic, for piano and voice.
//
// The first song a computer sang (an IBM 7094 at Bell Labs, 1961) sung by the voice this studio
// built out of arithmetic (lib/chipvoice.js, lib/chipsing.js). It comes in fractured, a chip
// singing in shards, and ends embodied: one `embody` curve, here, moves the voice (lib/chipsing.js)
// and the picture together. The picture is a figure descending a staircase, after Duchamp (1912):
// many exposures at the top of the stairs, gathering into one body at the foot.
//
// This file is the clock, as in every studio piece: the piano, the voice and the picture all read it.
// Pure data and arithmetic: node imports it for the selftest.
//
//   1–8      intro      the tune on the piano, high and far off, a music box
//   9–44     chorus 1   the voice as a chip; the piano only marks the bars
//   45–48    interlude
//   49–84    chorus 2   the voice finding breath; the waltz
//   85–88    interlude  a turn toward G (the voice's third chorus is a tone higher)
//   89–124   chorus 3   embodied; broadening at the end
//   125–130  coda       the last phrase on the piano, and the chord left to ring
//
// Daisy Bell: words and music by Harry Dacre (1892), public domain.

import { m, tempoMap, perform } from '../lib/score-kit.js';
import { sing } from '../lib/chipsing.js';
import { LEXICON } from './lexicon.js';

// ------------------------------------------------------------------ time --
export const BEATS_PER_BAR = 3;
export const B = (bar, beat = 0) => (bar - 1) * 3 + beat;
const TEMPO = [
  [0, 120], [B(8, 2), 128],                    // the music box, a little slower
  [B(9), 138], [B(119), 138], [B(123), 104], [B(124, 2.9), 84],   // chorus 3 broadens into "two"
  [B(125), 112], [B(128), 104], [B(130), 70],
];
export const sec = tempoMap(TEMPO, B(132));
export const BARS = 130;

// ------------------------------------------------------------- the tune --
// Daisy Bell's chorus in F: [lyric, notes] per line, notes as 'NAME:beats' (chipsing.js's format)
const LINES = [
  ['Dai-sy, Dai-sy, give me your an-swer, do.', 'C5:3 A4:3 F4:3 C4:3 D4 E4 F4 D4:2 F4 C4:5 r:1'],
  ["I'm half cra-zy, all for the love of you.", 'G4:3 C5:3 A4:3 F4:3 D4 E4 F4 G4:2 A4 G4:5 r:1'],
  ["It won't be a sty-lish mar-riage, I can't af-ford a car-riage,", 'A4 Bb4 A4 G4:2 C5 A4:2 G4 F4:5 r:1 G4:2 A4 F4:2 D4 F4:2 D4 C4:5 r:1'],
  ["But you'll look sweet up-on the seat of a bi-cy-cle built for two.", 'C4 F4:2 A4 G4:2 C4 F4:2 A4 G4:2 A4 Bb4 C5 A4:2 F4 G4:3 C4:3 F4:6'],
];
// its harmony, one chord a bar (36 bars)
const CHORDS = ('F F F F Bb Bb F F  C7 C7 F F Gm C7 C7 C7  F C7 F F F C7 Dm Bb C7 C7  F C7 F C7 F F Gm7 C7 F F').split(/\s+/);
const CHORUS = [9, 49, 89];
const KEY = [0, 0, 2];                             // the third chorus, a tone up: G

// --------------------------------------------------------------- voice --
// sung an octave below the written tune; the song's clock is this score's
export const song = {
  title: 'Daisy Bell', sec, transpose: -12,
  lines: CHORUS.flatMap((bar, c) => LINES.map(([lyric, notes], k) => ({
    lyric,
    notes: notes.split(/\s+/).map((n) => { const [p, b] = n.split(':'); return p === 'r' ? n : `${shift(p, KEY[c])}${b ? `:${b}` : ''}`; }).join(' '),
    ...(k === 0 ? { beat: B(bar) } : {}),
  }))),
};
function shift(name, st) {
  if (!st) return name;
  const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'], v = m(name) + st;
  return NAMES[v % 12] + (Math.floor(v / 12) - 1);
}
const smooth = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
/** How far the voice (and the figure) has come into a body, 0..1, at second t. */
export function embody(t) {
  const k = [[B(9), 0], [B(40), 0.3], [B(49), 0.34], [B(84), 0.78], [B(89), 0.8], [B(108), 1]].map(([b, v]) => [sec(b), v]);
  if (t <= k[0][0]) return 0;
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * smooth((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
  return 1;
}

// --------------------------------------------------------------- piano --
const raw = [];
function n(bar, beat, dur, names, vel, tag) {
  for (const nm of [].concat(names)) raw.push({ beat: B(bar, beat), dur, midi: m(nm), name: nm, vel, tag });
}
// chords: a bass (and the fifth, alternate bars) and a close voicing around middle C
const VOICING = {
  F: ['F2', 'C2', ['A3', 'C4', 'F4']], Bb: ['Bb1', 'F2', ['Bb3', 'D4', 'F4']], C7: ['C2', 'G2', ['Bb3', 'C4', 'E4']],
  Gm: ['G2', 'D2', ['G3', 'Bb3', 'D4']], Gm7: ['G2', 'D2', ['F3', 'Bb3', 'D4']], Dm: ['D2', 'A2', ['A3', 'D4', 'F4']],
  G: ['G2', 'D2', ['B3', 'D4', 'G4']], C: ['C2', 'G2', ['C4', 'E4', 'G4']], D7: ['D2', 'A2', ['C4', 'D4', 'F#4']],
  Am: ['A2', 'E2', ['A3', 'C4', 'E4']], Em: ['E2', 'B1', ['G3', 'B3', 'E4']], Am7: ['A2', 'E2', ['G3', 'C4', 'E4']],
};
const UP = { F: 'G', Bb: 'C', C7: 'D7', Gm: 'Am', Gm7: 'Am7', Dm: 'Em' };
const PEDAL = [];
/** The waltz: bass on one, the chord on two and three. `sparse`: the bass alone, and a chime on three; `octave`: the bass doubled below. */
function waltz(bar, sym, vel, { sparse = false, octave = false } = {}) {
  const [root, fifth, chord] = VOICING[sym], bass = bar % 2 ? root : fifth;
  n(bar, 0, sparse ? 3 : 1, octave ? [bass, shift(bass, -12)].filter((x) => m(x) >= m('A0')) : bass, vel + 0.06, 'bass');
  if (sparse) n(bar, 2, 1, shift(chord[2], 12), vel - 0.04, 'chime');
  else { n(bar, 1, 0.8, chord, vel - 0.05, 'chord'); n(bar, 2, 0.8, chord, vel - 0.08, 'chord'); }
  PEDAL.push([B(bar), B(bar) + (sparse ? 3 : 1)]);
}
// 1–8: the intro. The tune's first line, high, one note at a time, over open fifths
LINES[0][1].split(/\s+/).reduce((b, tok) => {
  const [p, d] = tok.split(':'), beats = d ? Number(d) : 1;
  if (p !== 'r') raw.push({ beat: b, dur: beats, midi: m(p) + 12, name: shift(p, 12), vel: 0.22, tag: 'box' });
  return b + beats;
}, 0);
for (let bar = 1; bar <= 8; bar++) { n(bar, 0, 3, bar === 5 || bar === 6 ? ['Bb1', 'F2'] : ['F2', 'C3'], 0.16, 'bass'); PEDAL.push([B(bar), B(bar + 1)]); }
// the tune as written, per chorus: [{ bar, beat, beats, name }] (the voice sings it an octave lower)
const tune = (c) => {
  const out = [];
  let b = B(CHORUS[c]);
  for (const [, notes] of LINES) for (const tok of notes.split(/\s+/)) {
    const [p, d] = tok.split(':'), beats = d ? Number(d) : 1;
    if (p !== 'r') out.push({ bar: CHORUS[c] + Math.floor((b - B(CHORUS[c])) / 3), beat: (b - B(CHORUS[c])) % 3, beats, name: shift(p, KEY[c]) });
    b += beats;
  }
  return out;
};
// a bar where the voice sings nothing new (a held note or a rest) is the piano's to answer in
const heldBars = (c) => { const t = tune(c); return CHORDS.map((_, k) => CHORUS[c] + k).filter((bar) => !t.some((x) => x.bar === bar)); };
/** An answer in a held bar: the chord's tones rising in eighths from beat one-and, the last held. */
function arpeggio(bar, sym, vel, top = 5) {
  const [, , chord] = VOICING[sym];
  const up = [...chord.map((c) => shift(c, 12 * (top - 4))), shift(chord[0], 12 * (top - 3))];
  up.forEach((nm, j) => n(bar, 0.5 + j * 0.5, j === up.length - 1 ? 3 - (0.5 + j * 0.5) : 0.5, nm, vel - 0.02 * j + (j === up.length - 1 ? 0.03 : 0), 'fill'));
}
/** A run: a scale from one note to another in even steps across `beats` from (bar, beat). */
function run(bar, beat, beats, from, to, vel, scale = [0, 2, 4, 5, 7, 9, 11]) {
  const a = m(from), z = m(to), dir = Math.sign(z - a), notes = [];
  for (let v = a; dir > 0 ? v <= z : v >= z; v += dir) if (scale.includes(((v % 12) + 12) % 12)) notes.push(v);
  const d = beats / notes.length;
  notes.forEach((v, j) => raw.push({ beat: B(bar, beat) + j * d, dur: d, midi: v, name: '', vel: vel + (0.08 * j) / notes.length, tag: 'run' }));
}
// the choruses: 1 the bass and a chime; 2 the waltz, answering the held notes; 3 the waltz in octaves,
// the tune doubled above the voice, and runs where it holds
CHORUS.forEach((start, c) => {
  const held = new Set(heldBars(c));
  CHORDS.forEach((sym, k) => {
    const bar = start + k, sy = c === 2 ? UP[sym] || sym : sym;
    const vel = [0.2, 0.25, 0.29][c] + (k >= 26 ? 0.03 : 0);
    waltz(bar, sy, vel, { sparse: c === 0, octave: c === 2 });
    if (c === 1 && held.has(bar)) arpeggio(bar, sy, 0.22, 5);
    if (c === 2 && held.has(bar) && k < 34) {
      if (k % 2) arpeggio(bar, sy, 0.26, 5);
      else run(bar, 0.5, 2.5, VOICING[sy][2][2].replace(/\d/, '5'), VOICING[sy][2][2].replace(/\d/, '6'), 0.2, [0, 2, 4, 5, 7, 9, 11].map((x) => (x + 7) % 12));
    }
  });
  if (c === 2) for (const x of tune(2)) n(x.bar, x.beat, x.beats * 0.95, x.name, 0.27 + (x.beats >= 3 ? 0.03 : 0), 'tune');
});
// 45–48 and 85–88: interludes. The first answers the chorus's last line; the second climbs to G
['F', 'Bb', 'F', 'C7'].forEach((s, k) => waltz(45 + k, s, 0.24));
[['A5', 0, 1], ['Bb5', 1, 1], ['C6', 2, 1], ['A5', 0, 2], ['F5', 2, 1], ['G5', 0, 3], ['C5', 0, 2], ['E5', 2, 1]].forEach(([p, beat, dur], k) => n(45 + [0, 0, 0, 1, 1, 2, 3, 3][k], beat, dur, p, 0.24, 'answer'));
['F', 'Bb', 'Am7', 'D7'].forEach((s, k) => waltz(85 + k, s, 0.27, { octave: k >= 2 }));
arpeggio(85, 'F', 0.24, 5); arpeggio(86, 'Bb', 0.26, 5);
run(87, 0, 3, 'E4', 'E5', 0.22);
run(88, 0, 2.5, 'D5', 'D6', 0.26, [0, 2, 4, 6, 7, 9, 11]);       // G major's scale: into the new key
// the coda: the last phrase in octaves over the waltz, then the chord rolled up the keyboard
[['B4', 0, 1], ['C5', 1, 1], ['D5', 2, 1], ['B4', 0, 2], ['G4', 2, 1], ['A4', 0, 3], ['D4', 0, 3], ['G4', 0, 3]].forEach(([p, beat, dur], k) => {
  const bar = 125 + [0, 0, 0, 1, 1, 2, 3, 4][k];
  n(bar, beat, dur, [p, shift(p, 12)], 0.3 - k * 0.01, 'coda');
});
[['G', 125], ['Em', 126], ['Am7', 127], ['D7', 128]].forEach(([s, bar]) => waltz(bar, s, 0.22, { octave: true }));
arpeggio(126, 'Em', 0.2, 5);
run(128, 1, 2, 'A5', 'C5', 0.22, [0, 2, 4, 6, 7, 9, 11]);
n(129, 0, 6, ['G1', 'G2'], 0.26, 'last');
['D3', 'G3', 'B3', 'D4', 'G4', 'B4', 'D5', 'G5', 'B5', 'D6', 'G6'].forEach((nm, j) => n(129, 0.02 + j * 0.16, 6 - j * 0.16, nm, 0.2 + (j === 10 ? 0.05 : 0) - 0.004 * j, 'last'));
PEDAL.push([B(129), B(131)]);

export const events = perform(raw, sec, PEDAL, 0xda15);
export const title = 'Descending';
export const cues = {
  intro: sec(B(1)), chorus1: sec(B(9)), chorus2: sec(B(49)), chorus3: sec(B(89)), coda: sec(B(125)), last: sec(B(129)),
  end: sec(B(131)) + 2,
};
export const duration = cues.end;
export const chorusBars = CHORUS;

// ------------------------------------------------ the voice, as the band --
// lib/band.js mixes it in with the piano (band-worker.js in the page, tools/render.mjs in node)
export const bandEvents = [];
/** The voice, sung at this sample rate: { audio, at } (at: where its first sample falls, in seconds). */
export function vocal(sampleRate) {
  const r = sing(song, LEXICON, { rate: sampleRate, embody });
  return { audio: r.audio, at: r.t0, notes: r.notes, gain: 0.62 };
}

// ------------------------------------------------------------ the page --
export const notation = {
  bars: BARS, time: [3, 4],
  keys: [[1, 'f', 'major'], [85, 'g', 'major']],
  tempos: [[1, 120], [9, 138], [125, 112]],
  sections: [[1, 'intro'], [9, 'chorus 1'], [45, 'interlude'], [49, 'chorus 2'], [85, 'interlude'], [89, 'chorus 3'], [125, 'coda']],
};
