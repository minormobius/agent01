// score.js — "Nobody Drew It" (No. 8): a lineage's history, sung by the creatures that lived it.
//
// Grown's world (packages/attractor/lib/organism.js), one evolved run recorded (history.js): bodies
// grown from programs, evolving with nothing to score them. The film replays three moments of that
// run in real time (the founders; step 300,000, when mouths had learned to bite; step 950,000, when
// Quul, a gut body trailing four mouths that no rule describes, had filled the world), with the
// history between them as a time-lapse. The choir is the world itself (grown/sound.js): every living
// species sings, as loud as it is common, so what you hear is who is alive. A voice (lib/chipsing.js)
// sings the rules of the world over it, and the piano holds the harmony.
//
// This file is the clock, as in every studio piece. 96 bpm in 4/4, a bar every 2.5 s, and the chords
// are the world's own (grown/sound.js CHORDS): Dm, Bb, F, C, two bars each, from the first bar.
//
//   1–4      title       the water, the founders still
//   5–8      founders    the world begins (the choir enters as they live)
//   9–16     verse 1     "A mouth grows a gut…"
//   17–20    time-lapse  step 0 → 300,000: "And every child a little changed"
//   21–24    biters      the world at 300,000
//   25–32    verse 2     "A mouth that meets a stranger bites…"
//   33–36    time-lapse  300,000 → 950,000: "A thousand lifetimes, a thousand names"
//   37–40    Quul        the world at 950,000
//   41–48    verse 3     "Four mouths in a line that nobody drew…"
//   49–56    coda        "What eats will bud…", then the choir alone
//   57       the last chord

import { m, tempoMap, perform } from '../lib/score-kit.js';
import { sing } from '../lib/chipsing.js';
import { LEXICON } from './lexicon.js';

export const title = 'Nobody Drew It';
export const BPM = 96;
export const B = (bar, beat = 0) => (bar - 1) * 4 + beat;
export const sec = tempoMap([[0, BPM]], B(60));
export const BARS = 57;

// --------------------------------------------------------------- the song --
// [bar, lyric, notes] — each line two bars (8 beats), written an octave above where it is sung
const LINES = [
  [9, 'A mouth grows a gut,', 'r:1 A4 D5:1.5 C5:0.5 A4 F4:3'],
  [11, 'a gut grows a fin;', 'r:1 F4 Bb4:1.5 A4:0.5 F4 D4:3'],
  [13, 'what eats will bud,', 'r:1 C5 A4:1.5 C5:0.5 F5:4'],
  [15, 'what starves goes back in.', 'r:1 E5 D5 C5 G4 E4:2 r:1'],
  [17, 'And ev-er-y child', 'r:1 A4 D5 C5:0.5 C5:0.5 A4:4'],
  [19, 'a lit-tle changed.', 'r:1 F4 Bb4:1.5 A4:0.5 F4:4'],
  [25, 'A mouth that meets', 'r:1 A4 D5:1.5 C5:0.5 A4:4'],
  [27, 'a stran-ger bites;', 'r:1 F4 Bb4:1.5 A4:0.5 F4:4'],
  [29, 'ar-mour for some,', 'r:1 C5 A4:1.5 C5:0.5 F5:4'],
  [31, 'for oth-ers, flight.', 'r:1 E5 D5 C5 E4:3 r:1'],
  [33, 'A thou-sand life-times,', 'r:1 A4 D5:1.5 C5:0.5 A4 F4:3'],
  [35, 'a thou-sand names.', 'r:1 F4 Bb4:1.5 A4:0.5 F4:4'],
  [41, 'Four mouths in a line', 'r:1 A4 D5:1.5 C5:0.5 A4 F4:3'],
  [43, 'that no-bod-y drew;', 'r:1 F4 Bb4:1.5 A4:0.5 F4 D4:3'],
  [45, 'no-bod-y drew it,', 'r:1 C5 A4 C5:0.5 D5:0.5 F5:4'],
  [47, 'and still it grew.', 'r:1 E5 D5 C5 D5:3 r:1'],
  [49, 'What eats will bud;', 'r:1 A4 D5:1.5 C5:0.5 A4:4'],
  [51, 'what starves goes back in.', 'r:1 F4 Bb4:0.5 A4:0.5 F4 D4:4'],
];
export const song = { title, sec, transpose: -12, lines: LINES.map(([bar, lyric, notes]) => ({ lyric, notes, beat: B(bar) })) };
/** The lyric on screen: each line from its first beat to the end of its two bars. */
export const lyric = LINES.map(([bar, text]) => ({ text: text.replace(/-/g, ''), from: sec(B(bar, 1)), to: sec(B(bar + 2)) - 0.15 }));

// --------------------------------------------------------------- the piano --
// the world's chords (grown/sound.js): Dm, Bb, F, C, two bars each, with their ninths
const CHORD = (bar) => ['Dm', 'Bb', 'F', 'C'][Math.floor((bar - 1) / 2) % 4];
const VOICING = {
  Dm: ['D2', 'A2', ['F3', 'A3', 'D4', 'E4']], Bb: ['Bb1', 'F2', ['D3', 'F3', 'Bb3', 'C4']],
  F: ['F2', 'C3', ['A3', 'C4', 'F4', 'G4']], C: ['C2', 'G2', ['E3', 'G3', 'C4', 'D4']],
};
const raw = [], PEDAL = [];
function n(bar, beat, dur, names, vel, tag) { for (const nm of [].concat(names)) raw.push({ beat: B(bar, beat), dur, midi: m(nm), name: nm, vel, tag }); }
const up = (nm, o) => nm.replace(/(-?\d)$/, (d) => String(Number(d) + o));
for (let bar = 1; bar <= 56; bar++) {
  const [root, fifth, chord] = VOICING[CHORD(bar)], first = bar % 2 === 1;
  if (bar <= 4) { if (first) n(bar, 0, 8, [root, fifth], 0.13, 'open'); }                          // the title: open fifths, far off
  else if ((bar >= 17 && bar <= 20) || (bar >= 33 && bar <= 36)) {                                  // time-lapses: the chord rising in eighths
    n(bar, 0, 4, root, 0.17, 'bass');
    [...chord, ...chord.map((c) => up(c, 1))].forEach((c, j) => n(bar, j * 0.5, 0.5, up(c, 1), 0.12 + 0.012 * j, 'lapse'));
  } else {                                                                                           // the verses: a bass, the chord on the off-beats
    const v = bar >= 41 ? 0.2 : bar >= 25 ? 0.18 : 0.16;
    if (first) n(bar, 0, 8, [root, bar >= 41 ? up(root, -1) : root].filter((x, i, a) => a.indexOf(x) === i && m(x) >= m('A0')), v + 0.03, 'bass');
    else n(bar, 0, 4, fifth, v, 'bass');
    n(bar, 1.5, 1, chord, v - 0.04, 'chord'); n(bar, 3, 1, chord, v - 0.06, 'chord');
  }
  PEDAL.push([B(bar), B(bar + 1)]);
}
// the last chord, rolled up the keys, and left to ring
n(57, 0, 8, ['D1', 'D2'], 0.24, 'last');
['A2', 'D3', 'F3', 'A3', 'D4', 'E4', 'F4', 'A4', 'D5', 'E5', 'A5'].forEach((nm, j) => n(57, 0.02 + j * 0.14, 8 - j * 0.14, nm, 0.2 - 0.004 * j, 'last'));
PEDAL.push([B(57), B(60)]);

export const events = perform(raw, sec, PEDAL, 0x0b0d);
export const cues = {
  title: 0, founders: sec(B(5)), verse1: sec(B(9)), lapse1: sec(B(17)), biters: sec(B(21)), verse2: sec(B(25)),
  lapse2: sec(B(33)), quul: sec(B(37)), verse3: sec(B(41)), coda: sec(B(49)), last: sec(B(57)), end: sec(B(59)) + 1,
};
export const duration = cues.end;

// ------------------------------------------------ the voice and the choir, as the band --
export const bandEvents = [];
/**
 * The voice (lib/chipsing.js) and the choir (the world, heard through grown/sound.js: world.js replays
 * the same history the picture shows), mixed into one track from second 0.
 */
export async function vocal(sampleRate) {
  const { choir } = await import('./world.js');
  const r = sing(song, LEXICON, { rate: sampleRate });
  const c = choir(sampleRate, duration), out = new Float32Array(c.length);
  for (let i = 0; i < c.length; i++) out[i] = c[i] * 0.6;
  const at = Math.round(r.t0 * sampleRate);
  for (let i = 0; i < r.audio.length; i++) { const j = at + i; if (j >= 0 && j < out.length) out[j] += r.audio[i] * 0.62; }
  return { audio: out, at: 0, gain: 1, notes: r.notes };
}

export const notation = {
  bars: BARS, time: [4, 4], keys: [[1, 'd', 'minor']], tempos: [[1, BPM]],
  sections: [[1, 'title'], [5, 'founders'], [9, 'verse 1'], [17, 'time-lapse'], [21, 'biters'], [25, 'verse 2'], [33, 'time-lapse'], [37, 'Quul'], [41, 'verse 3'], [49, 'coda']],
};
