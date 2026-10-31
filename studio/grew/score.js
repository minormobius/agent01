// score.js — "And Still It Grew" (No. 9): the same world as "Nobody Drew It", in a major key, told more.
//
// The companion to No. 8 (owner: "a different version, in a major key… denser of description, more
// lyrics, more sound, more music theory, a burst of creation"). The same evolved history (Grown's world,
// seed 1), with a fourth moment kept (step 150,000), replayed in real time between time-lapses; the choir
// is still the world itself (grown/sound.js), now with a beat and bells that burst as the music opens up.
//
// This file is the clock. 116 bpm in 4/4 (a bar ≈ 2.07 s), D major, then E major. The harmony, bar by bar:
//
//   1–4      intro       D (add 9), a pedal: arpeggios rising out of nothing
//   5–12     verse 1     I–vi–IV–V twice: the founders ("Nine of us, written by someone's hand…")
//   13–20    chorus 1    I–V⁶–vi–IV–I⁶–IV–V–V⁷: the bass walking down D C♯ B, the big tune ("Grow…")
//   21–24    time-lapse  vi–II⁷–V–I: round the circle of fifths (E7 is V of V), step 0 → 150,000
//   25–32    verse 2     I–vi–IV–V, then I–vi–iv–V: G minor borrowed from D minor for "mouth after mouth"
//   33–40    chorus 2
//   41–44    time-lapse  vi–II⁷–V–I again, 150,000 → 300,000
//   45–52    verse 3     vi–IV–I–V–vi–IV–V/vi–vi: in B minor's shadow, F♯7 its dominant: the biters
//   53–56    bridge      ♭VI–♭VII–I: B♭, C, D, the Aeolian lift ("Nobody drew it… and still, it grew!")
//   57–60    time-lapse  V pedal (A), then B7: the dominant of E, a pivot, 300,000 → 950,000
//   61–68    chorus 3    in E, a whole step up: Quul's world
//   69–76    chorus 4    in E, the words turned outward ("…and the darkness turns gold")
//   77–84    coda        IV–iv–I twice: A, A minor (borrowed), E: a plagal amen, with No. 8's minor in it
//   85       the last chord, E, rolled and left to ring

import { m, tempoMap, perform } from '../lib/score-kit.js';
import { sing } from '../lib/chipsing.js';
import { LEXICON } from './lexicon.js';

export const title = 'And Still It Grew';
export const BPM = 116;
export const B = (bar, beat = 0) => (bar - 1) * 4 + beat;
export const sec = tempoMap([[0, BPM]], B(92));
export const BARS = 85;
const BAR = 240 / BPM;

// ------------------------------------------------------------- the harmony --
// a chord: its root's pitch class, its four tones (as intervals), and the bass under it (a pitch class)
const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const SHAPES = { '': [0, 4, 7, 14], m: [0, 3, 7, 14], 7: [0, 4, 7, 10], sus2: [0, 2, 7, 14], sus4: [0, 5, 7, 14] };
const CHORD = {};
function chord(sym) {
  if (CHORD[sym]) return CHORD[sym];
  const [head, over] = sym.split('/'), r = head.match(/^([A-G][#b]?)(.*)$/), root = PC[r[1]], iv = SHAPES[r[2]], bass = over ? PC[over] : root;
  // the choir's tones: each interval placed at or above A2 (−5 semitones from D3) — the engine's space
  const tones = iv.map((x) => { const pc = (root + x) % 12; let s = pc - 2; while (s < -5) s += 12; while (s > 7) s -= 12; return s + (x >= 12 ? 12 : 0); });
  return (CHORD[sym] = { sym, root: ((bass - 2 + 12) % 12) - 12, tones, rootPc: root, bassPc: bass, iv });
}
const PROG = [
  'Dsus2 Dsus2 D D',
  'D Bm G A D Bm G A',
  'D A/C# Bm G D/F# G A A7',
  'Bm E7 A D',
  'D Bm G A D Bm Gm A',
  'D A/C# Bm G D/F# G A A7',
  'Bm E7 A D',
  'Bm G D A Bm G F#7 Bm',
  'Bb C D D',
  'A A B7 B7',
  'E B/D# C#m A E/G# A B B7',
  'E B/D# C#m A E/G# A B B7',
  'A Am E E A Am E E',
  'E E E',
].join(' ').split(' ');
export const chordAt = (bar) => chord(PROG[Math.max(0, Math.min(PROG.length - 1, bar - 1))]);
/** The harmony at second t, for the choir (grown/sound.js): the same object while the chord lasts. */
export const harmony = (t) => chordAt(Math.floor(t / BAR) + 1);
/** How hard the music drives at second t (the choir's beat and bells): by section. */
export function drive(t) {
  const bar = t / BAR + 1;
  const K = [[1, 0], [5, 0.3], [12.5, 0.45], [13, 0.9], [21, 0.6], [25, 0.45], [32.5, 0.5], [33, 0.92], [41, 0.62], [45, 0.5], [53, 0.75], [57, 0.8], [60.5, 0.9], [61, 1], [77, 0.45], [81, 0.25], [85, 0]];
  let v = 0; for (const [b, d] of K) if (bar >= b) v = d; return v;
}

// --------------------------------------------------------------- the song --
// [bar, lyric, notes]: each line two bars, written an octave above where it is sung. `harm`: a second
// voice a diatonic third below it (the choruses)
const LINES = [
  // verse 1: the founders
  [5, 'Nine of us, writ-ten by some-one\'s hand,', 'r:0.5 F#4:0.5 F#4:0.5 A4:0.5 A4:0.5 B4:0.5 A4:0.5 F#4:0.5 E4:0.5 D4:3.5'],
  [7, 'each one a mouth and a rule and a plan;', 'r:0.5 G4:0.5 G4:0.5 B4:0.5 B4:0.5 A4:0.5 G4:0.5 B4:0.5 A4:0.5 A4:0.5 E4:3'],
  [9, 'grow me a gut when the wa-ter is kind,', 'r:0.5 F#4:0.5 A4:0.5 D5:0.5 D5:0.5 C#5:0.5 B4:0.5 A4:0.5 F#4:0.5 A4:0.5 B4:3'],
  [11, 'grow me a fin, leave the hun-ger be-hind.', 'r:0.5 G4:0.5 B4:0.5 D5:0.5 D5:0.5 E5:0.5 D5:0.5 B4:0.5 A4:0.5 C#5:0.5 A4:3'],
  // chorus 1
  [13, 'Grow, and the wa-ter turns gold;', 'D5:1.5 A4:0.5 B4:0.5 C#5:0.5 D5:0.5 F#5:0.5 E5:4', 'D'],
  [15, 'grow, and the sto-ry is told', 'F#5:1.5 E5:0.5 D5:0.5 D5:0.5 C#5:0.5 B4:0.5 D5:4', 'D'],
  [17, 'by the ones who were fed, by the ones who were bred,', 'r:0.5 A4:0.5 A4:0.5 D5:0.5 D5:0.5 C#5:0.5 D5:1 A4:0.5 A4:0.5 D5:0.5 D5:0.5 E5:0.5 G5:1.5', 'D'],
  [19, 'and no-bod-y drew them at all!', 'r:0.5 E5:0.5 E5:0.5 F#5:0.5 E5:0.5 D5:0.5 C#5:0.5 D5:0.5 E5:4', 'D'],
  // time-lapse: 0 → 150,000
  [21, 'Ev-er-y child a lit-tle new,', 'r:0.5 F#4:0.5 F#4:0.5 F#4:0.5 B4:1 A4:0.5 G#4:0.5 A4:0.5 B4:3.5'],
  [23, 'ev-er-y name a thing that grew.', 'r:0.5 E4:0.5 E4:0.5 E4:0.5 A4:1 G4:0.5 F#4:0.5 E4:0.5 D4:3.5'],
  // verse 2: step 150,000
  [25, 'Some of us lost what the found-ers had made,', 'r:0.5 F#4:0.5 F#4:0.5 A4:0.5 A4:0.5 B4:0.5 A4:0.5 F#4:0.5 E4:0.5 E4:0.5 D4:3'],
  [27, 'gave up the gut for a fin and a blade;', 'r:0.5 G4:0.5 G4:0.5 B4:0.5 B4:0.5 A4:0.5 G4:0.5 B4:0.5 A4:0.5 A4:0.5 E4:3'],
  [29, 'some of us grew like a stair, like a chain,', 'r:0.5 F#4:0.5 A4:0.5 D5:0.5 D5:0.5 C#5:0.5 B4:0.5 A4:0.5 F#4:0.5 A4:0.5 B4:3'],
  [31, 'mouth af-ter mouth af-ter mouth, a-gain.', 'r:0.5 G4:0.5 Bb4:0.5 D5:0.5 G4:0.5 Bb4:0.5 D5:0.5 Bb4:0.5 A4:0.5 C#5:3.5'],
  // chorus 2
  [33, 'Grow, and the wa-ter turns gold;', 'D5:1.5 A4:0.5 B4:0.5 C#5:0.5 D5:0.5 F#5:0.5 E5:4', 'D'],
  [35, 'grow, and the sto-ry is told', 'F#5:1.5 E5:0.5 D5:0.5 D5:0.5 C#5:0.5 B4:0.5 D5:4', 'D'],
  [37, 'by the ones who were fed, by the ones who were bred,', 'r:0.5 A4:0.5 A4:0.5 D5:0.5 D5:0.5 C#5:0.5 D5:1 A4:0.5 A4:0.5 D5:0.5 D5:0.5 E5:0.5 G5:1.5', 'D'],
  [39, 'and no-bod-y drew them at all!', 'r:0.5 E5:0.5 E5:0.5 F#5:0.5 E5:0.5 D5:0.5 C#5:0.5 D5:0.5 E5:4', 'D'],
  // time-lapse: 150,000 → 300,000
  [41, 'Mouths that were learn-ing to bite,', 'r:0.5 F#4:0.5 F#4:0.5 B4:1 A4:0.5 G#4:0.5 A4:0.5 B4:4'],
  [43, 'sens-es that learned to take flight.', 'r:0.5 E4:0.5 E4:0.5 A4:1 G4:0.5 F#4:0.5 E4:0.5 D4:4'],
  // verse 3: step 300,000, the biters
  [45, 'Now when a mouth meets a strang-er, it bites;', 'r:0.5 B4:0.5 B4:0.5 D5:0.5 D5:0.5 C#5:0.5 B4:0.5 A4:0.5 G4:0.5 A4:0.5 B4:3'],
  [47, 'ar-mour for some, and for oth-ers, the flights;', 'r:0.5 A4:0.5 A4:0.5 F#4:0.5 A4:0.5 D5:0.5 C#5:0.5 B4:0.5 A4:0.5 A4:0.5 E4:3'],
  [49, 'one was a gut and a fin and a bud', 'r:0.5 B4:0.5 B4:0.5 D5:0.5 D5:0.5 C#5:0.5 B4:0.5 A4:0.5 G4:0.5 A4:0.5 B4:3'],
  [51, 'trail-ing four mouths through the gold and the mud.', 'r:0.5 A#4:0.5 A#4:0.5 C#5:0.5 C#5:0.5 E5:0.5 D5:0.5 C#5:0.5 A#4:0.5 C#5:0.5 B4:3'],
  // bridge: B♭, C, D
  [53, 'No-bod-y drew it,', 'r:1 D5:0.5 D5:0.5 D5:1 F5:3 E5:2'],
  [55, 'and still, it grew!', 'r:1 A4:1 B4:1 C#5:1 D5:4'],
  // time-lapse: 300,000 → 950,000, the dominant pedal and the pivot
  [57, 'A thou-sand life-times, a thou-sand names,', 'r:0.5 E4:0.5 A4:0.5 A4:0.5 C#5:0.5 B4:0.5 A4:0.5 A4:0.5 C#5:0.5 E5:3.5'],
  [59, 'ev-er-y one of them hun-gry the same,', 'r:0.5 D#4:0.5 D#4:0.5 D#4:0.5 F#4:0.5 A4:0.5 B4:0.5 A4:0.5 F#4:0.5 A4:0.5 B4:3'],
  // chorus 3, in E
  [61, 'Grow, and the wa-ter turns gold;', 'E5:1.5 B4:0.5 C#5:0.5 D#5:0.5 E5:0.5 G#5:0.5 F#5:4', 'E'],
  [63, 'grow, and the sto-ry is told', 'G#5:1.5 F#5:0.5 E5:0.5 E5:0.5 D#5:0.5 C#5:0.5 E5:4', 'E'],
  [65, 'by the ones who were fed, by the ones who were bred,', 'r:0.5 B4:0.5 B4:0.5 E5:0.5 E5:0.5 D#5:0.5 E5:1 B4:0.5 B4:0.5 E5:0.5 E5:0.5 F#5:0.5 A5:1.5', 'E'],
  [67, 'and no-bod-y drew them at all!', 'r:0.5 F#5:0.5 F#5:0.5 G#5:0.5 F#5:0.5 E5:0.5 D#5:0.5 E5:0.5 F#5:4', 'E'],
  // chorus 4, the words turned outward
  [69, 'Grow, and the dark-ness turns gold;', 'E5:1.5 B4:0.5 C#5:0.5 D#5:0.5 E5:0.5 G#5:0.5 F#5:4', 'E'],
  [71, 'grow, till the whole world is told', 'G#5:1.5 F#5:0.5 E5:0.5 E5:0.5 D#5:0.5 C#5:0.5 E5:4', 'E'],
  [73, 'by the mouths and the fins, by the buds and the kin,', 'r:0.5 B4:0.5 B4:0.5 E5:0.5 E5:0.5 D#5:0.5 E5:1 B4:0.5 B4:0.5 E5:0.5 E5:0.5 F#5:0.5 A5:1.5', 'E'],
  [75, 'and no-bod-y drew it at all!', 'r:0.5 F#5:0.5 F#5:0.5 G#5:0.5 F#5:0.5 E5:0.5 D#5:0.5 E5:0.5 F#5:4', 'E'],
  // coda: IV–iv–I
  [77, 'What eats will bud,', 'r:1 C#5:1 B4:1 A4:1 E5:4'],
  [79, 'what buds will grow;', 'r:1 B4:1 G#4:1 F#4:1 E4:4'],
  [81, 'and no-bod-y drew it,', 'r:1 C#5:0.5 C#5:0.5 C#5:1 E5:1 C5:0.5 B4:3.5'],
  [83, 'and still it grew.', 'r:1 G#4:1 B4:1 F#4:1 E4:4'],
];
// a diatonic third below each note, in the line's key (the choruses' second voice)
const SCALE = { D: [2, 4, 6, 7, 9, 11, 1], E: [4, 6, 8, 9, 11, 1, 3] };
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function thirdBelow(notes, key) {
  const sc = SCALE[key];
  return notes.split(/\s+/).map((tok) => {
    const [p, b] = tok.split(':'); if (p === 'r') return tok;
    const v = m(p), pc = ((v % 12) + 12) % 12, i = sc.indexOf(pc);
    if (i < 0) return tok;
    let w = v - 1; while (((w % 12) + 12) % 12 !== sc[(i + 5) % 7]) w--;   // two scale steps down
    return `${NAMES[w % 12]}${Math.floor(w / 12) - 1}${b ? `:${b}` : ''}`;
  }).join(' ');
}
export const song = { title, sec, transpose: -12, lines: LINES.map(([bar, lyric, notes]) => ({ lyric, notes, beat: B(bar) })) };
export const harmonySong = { title, sec, transpose: -12, lines: LINES.filter((l) => l[3]).map(([bar, lyric, notes, key]) => ({ lyric, notes: thirdBelow(notes, key), beat: B(bar) })) };
/** The lyric on screen: each line from its first sung beat to the end of its two bars. */
export const lyric = LINES.map(([bar, text]) => ({ text: text.replace(/-/g, ''), from: sec(B(bar)) + 0.2, to: sec(B(bar + 2)) - 0.12 }));

// --------------------------------------------------------------- the piano --
const raw = [], PEDAL = [];
const nm = (pc, oct) => `${NAMES[pc]}${oct}`;
function n(bar, beat, dur, names, vel, tag) { for (const x of [].concat(names)) raw.push({ beat: B(bar, beat), dur, midi: m(x), name: x, vel, tag }); }
/** The chord's notes in an octave from `lo` (a MIDI number) upward. */
const voice = (c, lo, k = 4) => c.iv.slice(0, k).map((x) => { let v = c.rootPc + (x % 12); while (v < lo) v += 12; return v; }).sort((a, b) => a - b);
const name = (v) => `${NAMES[v % 12]}${Math.floor(v / 12) - 1}`;
const SECTION = (bar) => (bar <= 4 ? 'intro' : bar <= 12 || (bar >= 25 && bar <= 32) || (bar >= 45 && bar <= 52) ? 'verse' : (bar >= 13 && bar <= 20) || (bar >= 33 && bar <= 40) || (bar >= 61 && bar <= 76) ? 'chorus' : (bar >= 21 && bar <= 24) || (bar >= 41 && bar <= 44) ? 'circle' : bar <= 56 ? 'bridge' : bar <= 60 ? 'pedal' : bar <= 84 ? 'coda' : 'last');
for (let bar = 1; bar <= 84; bar++) {
  const c = chordAt(bar), sec_ = SECTION(bar), lift = bar >= 61 ? 0.03 : 0;
  const bass = (oct) => name(c.bassPc + 12 * (oct + 1)), rh = voice(c, m('F#3')).map(name);
  if (sec_ === 'intro') {                       // out of nothing: the chord rising in sixteenths, louder bar by bar
    n(bar, 0, 4, [bass(1), bass(2)], 0.12 + 0.02 * bar, 'pedal');
    const up = [...voice(c, m('D4')), ...voice(c, m('D5'))];
    for (let k = 0; k < 16; k++) n(bar, k * 0.25, 0.25, name(up[k % up.length] + (k >= up.length ? 0 : 0)), 0.1 + 0.015 * bar + 0.01 * (k % 4 === 0), 'rise');
  } else if (sec_ === 'verse') {                // a left hand in eighths (root, fifth, octave, fifth) and chords on the off-beats
    const r = c.bassPc + 36, f5 = c.rootPc + 43;
    [r, f5, r + 12, f5].forEach((v, k) => { n(bar, k, 0.5, name(v), 0.17 + lift, 'lh'); n(bar, k + 0.5, 0.5, name(k % 2 ? r + 12 : f5), 0.13, 'lh'); });
    n(bar, 1.5, 0.5, rh, 0.14, 'stab'); n(bar, 3.5, 0.5, rh, 0.13, 'stab');
  } else if (sec_ === 'chorus') {               // the walking bass in octaves; full chords on 1, the and of 2, and 4
    n(bar, 0, 2.5, [bass(1), bass(2)], 0.26 + lift, 'bass'); n(bar, 2.5, 1.5, bass(2), 0.2 + lift, 'bass');
    const full = [...voice(c, m('A3')), ...voice(c, m('A4'), 3)].map(name);
    n(bar, 0, 1.5, full, 0.22 + lift, 'chord'); n(bar, 1.5, 1.5, full, 0.19 + lift, 'chord'); n(bar, 3, 1, full, 0.2 + lift, 'chord');
  } else if (sec_ === 'circle') {               // round the circle of fifths: each chord a two-octave run up and back in sixteenths
    n(bar, 0, 4, [bass(1), bass(2)], 0.2, 'bass');
    const up = [...voice(c, m('D4')), ...voice(c, m('D5'))], seq = [...up, ...up.slice(0, -1).reverse()];
    for (let k = 0; k < 16; k++) n(bar, k * 0.25, 0.25, name(seq[k % seq.length]), 0.15 + 0.004 * k, 'run');
  } else if (sec_ === 'bridge') {               // B♭, C, D: blocks in octaves, a crescendo
    const v = 0.2 + 0.03 * (bar - 53);
    n(bar, 0, 4, [bass(1), bass(2)], v + 0.04, 'bass');
    [0, 1, 2, 3].forEach((k) => n(bar, k, k === 3 ? 1 : 0.9, [...voice(c, m('D4')), ...voice(c, m('D5'), 3)].map(name), v - 0.02 * (k % 2), 'block'));
  } else if (sec_ === 'pedal') {                // the dominant pedal: A in repeated eighths, the chords climbing above it, then the pivot
    for (let k = 0; k < 8; k++) n(bar, k * 0.5, 0.5, bar <= 58 ? 'A1' : name(c.bassPc + 24), 0.18 + 0.01 * k + 0.02 * (bar - 57), 'pedal');
    const up = voice(c, m('E4') + (bar - 57) * 2); up.forEach((v, k) => n(bar, k, 1, name(v), 0.16 + 0.02 * (bar - 57), 'climb'));
  } else if (sec_ === 'coda') {                 // IV–iv–I: slow, the chord held, one arpeggio down
    const v = bar >= 81 ? 0.16 : 0.2;
    n(bar, 0, 4, [bass(1), bass(2)], v, 'bass');
    const ch = [...voice(c, m('G#3')), ...voice(c, m('G#4'), 3)];
    ch.slice().reverse().forEach((x, k) => n(bar, k * 0.5, 4 - k * 0.5, name(x), v - 0.01 * k, 'arp'));
  }
  PEDAL.push([B(bar), B(bar + 1)]);
}
// the last chord: E, rolled up the keys, and left to ring
n(85, 0, 8, ['E1', 'E2'], 0.26, 'last');
['B2', 'E3', 'G#3', 'B3', 'E4', 'F#4', 'G#4', 'B4', 'E5', 'F#5', 'B5', 'E6'].forEach((x, j) => n(85, 0.02 + j * 0.12, 8 - j * 0.12, x, 0.21 - 0.004 * j, 'last'));
PEDAL.push([B(85), B(88)]);

export const events = perform(raw, sec, PEDAL, 0x6e3e);
export const cues = {
  title: 0, founders: sec(B(5)), chorus1: sec(B(13)), lapse1: sec(B(21)), step150: sec(B(25)), lapse2: sec(B(41)),
  biters: sec(B(45)), bridge: sec(B(53)), lapse3: sec(B(57)), quul: sec(B(61)), coda: sec(B(77)), last: sec(B(85)), end: sec(B(88)) + 0.5,
};
export const duration = cues.end;

// ------------------------------------------------ the voices and the choir, as the band --
export const bandEvents = [];
/** The lead, the second voice in the choruses, and the choir (world.js replays the history), in one track. */
export async function vocal(sampleRate) {
  const { choir } = await import('./world.js');
  const lead = sing(song, LEXICON, { rate: sampleRate }), second = sing(harmonySong, LEXICON, { rate: sampleRate });
  const c = choir(sampleRate, duration), out = new Float32Array(c.length);
  for (let i = 0; i < c.length; i++) out[i] = c[i] * 0.55;
  for (const [r, g] of [[lead, 0.6], [second, 0.34]]) { const at = Math.round(r.t0 * sampleRate); for (let i = 0; i < r.audio.length; i++) { const j = at + i; if (j >= 0 && j < out.length) out[j] += r.audio[i] * g; } }
  return { audio: out, at: 0, gain: 1, notes: lead.notes };
}

export const notation = {
  bars: BARS, time: [4, 4], keys: [[1, 'd', 'major'], [61, 'e', 'major']], tempos: [[1, BPM]],
  sections: [[1, 'intro'], [5, 'verse 1'], [13, 'chorus'], [21, 'time-lapse'], [25, 'verse 2'], [33, 'chorus'], [41, 'time-lapse'], [45, 'verse 3'], [53, 'bridge'], [57, 'time-lapse'], [61, 'chorus in E'], [69, 'chorus'], [77, 'coda']],
};
