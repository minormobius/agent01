// score.js — "Speakeasy": a noir in four flats, for piano, band and noisemakers.
//
// The whole story is here, in bars. The picture reads nothing but this file:
// scene changes are bars, every character moves on its instrument's notes, and
// the story's intertitles are typed one character per TYPEWRITER KEYSTROKE in
// the score — Satie put a typewriter in the pit of Parade (1917), and here it is
// the narrator.
//
//   1–4    overture     behind the curtain: a siren, taxis, the typewriter, a roll
//   5–28   the street   walking bass, brushes; the muted trumpet's theme; the dame
//                       (clarinet); she drops a card. HOTEL MAJESTIC.
//   29–44  the lobby    vibes and a two-feel; the Manager's theme, low sax; the lift
//   45–56  the descent  a chromatic slide, strings bowing tremolo, the cables
//                       ratcheting faster; accelerando to a thud
//   57–84  the club     176 bpm: the band, a sax solo, a trumpet shout chorus
//   85–88  he knows     the band falls away; the Manager again
//   89     the shot     and four seconds of nothing
//   90–94  the raid     whistles, sirens, everything at once
//   95–98  curtain

import { m, B, tempoMap, mulberry32 } from '../lib/score-kit.js';

// ------------------------------------------------------------------ tempo --
const TEMPO = [
  [0, 152], [B(28, 3.9), 152], [B(29), 132],           // the lobby breathes
  [B(44, 3.9), 132], [B(45), 132], [B(57) - 0.1, 176], // the descent accelerates
  [B(88, 3.9), 176], [B(89), 60], [B(90) - 0.01, 60],  // the shot, and the silence after
  [B(90), 190], [B(94, 3.9), 190], [B(95), 150], [B(97), 120], [B(99), 60], [B(101), 50],
];
export const sec = tempoMap(TEMPO, 420);

/** Swing: an off-beat eighth lands two-thirds of the way through its beat. */
const SWING = [[B(5), B(29), 0.66], [B(29), B(45), 0.6], [B(57), B(89), 0.66]];
function sw(b) {
  const f = b - Math.floor(b);
  if (Math.abs(f - 0.5) > 1e-6) return b;
  for (const [a, z, s] of SWING) if (b >= a && b < z) return Math.floor(b) + s;
  return b;
}

// ------------------------------------------------------------ writing it --
const raw = [];      // { beat, dur, midi?, name?, vel, inst, tag?, ...extra }
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const nameOf = (midi) => NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
function n(bar, beat, dur, names, vel, inst, extra = {}) {
  for (const nm of [].concat(names)) {
    const midi = typeof nm === 'number' ? nm : m(nm);
    raw.push({ beat: B(bar, beat), dur, midi, name: typeof nm === 'number' ? nameOf(nm) : nm, vel, inst, ...extra });
  }
}
/** An unpitched event: a drum, a noise. */
function fx(bar, beat, inst, vel, extra = {}) { raw.push({ beat: B(bar, beat), dur: extra.dur ?? 0.5, vel, inst, ...extra }); }

// Chords: root name + quality.
const Q = { m6: [0, 3, 7, 9], m7: [0, 3, 7, 10], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7b5: [0, 3, 6, 10], '7b9': [0, 4, 7, 10, 13], dim7: [0, 3, 6, 9], mmaj7: [0, 3, 7, 11], m: [0, 3, 7] };
function chord(sym) {
  const r = /^([A-G](?:b|#)?)(.*)$/.exec(sym);
  const root = m(r[1] + '2') % 12;
  return { root, q: Q[r[2]] || Q.m7, sym };
}
/** Rootless piano voicing, kept between D3 and G4. */
function voicing(c) {
  const pick = c.q.length > 4 ? [4, 10, 13] : c.q[3] === 11 ? [4, 11, 14] : c.q[1] === 3 && c.q[3] === 9 ? [3, 9, 14] : c.q[2] === 6 ? [3, 6, 10] : [c.q[1], c.q[3] ?? 7, 14];
  return pick.map((iv) => { let x = 48 + ((c.root + iv) % 12); while (x < 50) x += 12; while (x > 67) x -= 12; return x; }).sort((a, b) => a - b);
}
/** A walking bass bar: root, a chord tone, another, and a step into the next root. */
function walk(bar, c, next, vel, k) {
  const lo = (pc) => { let x = 36 + pc; if (x > 47) x -= 12; return x; };
  const root = lo(c.root);
  const third = root + c.q[1], fifth = root + c.q[2];
  const nextRoot = lo(next.root);
  const approach = nextRoot + (k % 2 ? 1 : -1);
  [root, k % 2 ? fifth : third, k % 2 ? third + 12 > 52 ? third : third + 12 : fifth, approach].forEach((x, j) => n(bar, j, 1, x, vel + (j === 0 ? 0.08 : 0), 'bass'));
}
/** Charleston comping on the piano. */
function comp(bar, c, vel, k) {
  const v = voicing(c);
  const hits = k % 3 === 2 ? [[0, 0.5], [2.5, 0.5]] : k % 3 === 1 ? [[0.5, 1], [2.5, 0.5]] : [[0, 0.5], [1.5, 0.5]];
  for (const [b, d] of hits) n(bar, b, d, v, vel, 'piano', { tag: 'comp' });
}
const mel = (bar, notes, vel, inst, extra = {}) => notes.forEach(([b, d, nm, o]) => n(bar, b, d, nm, vel + (b === 0 ? 0.04 : 0), inst, { tag: 'mel', ...extra, ...(o || {}) }));

/** Down a diatonic third in C harmonic minor: a second voice for the theme. */
const SCALE = [0, 2, 3, 5, 7, 8, 11];
function thirdBelow(nm) {
  const x = m(nm), pc = x % 12;
  let i = SCALE.indexOf(pc);
  if (i < 0) return x - 3;
  const j = (i - 2 + 7) % 7;
  let y = Math.floor(x / 12) * 12 + SCALE[j];
  if (y >= x) y -= 12;
  return y;
}

// The theme, and the chords under it.
const THEME = ['Cm6', 'Cm6', 'Fm7', 'Bb7', 'Ebmaj7', 'Ab7', 'Dm7b5', 'G7b9'].map(chord);
const T = [
  [[0, 1, 'G4'], [1, 1.5, 'Eb5'], [2.5, 0.5, 'D5'], [3, 1, 'C5']],
  [[0, 2, 'B4'], [3, 0.5, 'C5'], [3.5, 0.5, 'D5']],
  [[0, 1.5, 'Eb5'], [1.5, 0.5, 'F5'], [2, 1, 'Ab5'], [3, 1, 'G5']],
  [[0, 2, 'F5'], [2, 1, 'D5'], [3, 1, 'Bb4']],
  [[0, 1.5, 'G5'], [1.5, 0.5, 'F5'], [2, 1, 'Eb5'], [3, 1, 'D5']],
  [[0, 1, 'C5'], [1, 1, 'Eb5'], [2, 1.5, 'Gb5'], [3.5, 0.5, 'F5']],
  [[0, 1, 'Ab5'], [1, 1, 'F5'], [2, 1, 'D5'], [3, 1, 'C5']],
  [[0, 3, 'B4'], [3.5, 0.5, 'G4']],
];
const DAME = [
  [[0, 1.5, 'Eb5'], [1.5, 0.5, 'D5'], [2, 1, 'Db5'], [3, 1, 'C5']],
  [[0, 3, 'G4'], [3, 1, 'Ab4']],
  [[0, 1, 'C5'], [1, 1, 'Eb5'], [2, 1, 'F5'], [3, 1, 'Ab5']],
  [[0, 2, 'G5'], [2, 1, 'F5'], [3, 1, 'D5']],
  [[0, 1.5, 'Bb5'], [1.5, 0.5, 'G5'], [2, 1, 'Eb5'], [3, 1, 'D5']],
  [[0, 2, 'Eb5'], [2, 1, 'C5'], [3, 1, 'Gb4']],
  [[0, 1, 'F4'], [1, 1, 'Ab4'], [2, 1, 'C5'], [3, 1, 'Eb5']],
  [[0, 2, 'D5'], [2, 1, 'B4'], [3, 1, 'G4']],
];

/** Brushes: a swish on 1 and 3, a tap on 2 and 4, the foot on the hi-hat. */
function brushes(bar, vel) {
  fx(bar, 0, 'swish', vel, { dur: 1.8 }); fx(bar, 2, 'swish', vel * 0.9, { dur: 1.8 });
  fx(bar, 1, 'snare', vel * 0.8); fx(bar, 3, 'snare', vel * 0.85);
  fx(bar, 1, 'hat', vel * 0.6); fx(bar, 3, 'hat', vel * 0.6);
  for (let q = 0; q < 4; q++) fx(bar, q, 'kick', 0.18);
}
/** Sticks on the ride: the swing pattern, the hat on 2 and 4, comping on the snare. */
const drumR = mulberry32(99);
function kit(bar, vel, fill = false) {
  for (const b of [0, 1, 1.5, 2, 3, 3.5]) fx(bar, b, 'ride', vel * (b % 1 ? 0.7 : 1));
  fx(bar, 1, 'hat', vel * 0.8); fx(bar, 3, 'hat', vel * 0.8);
  for (let q = 0; q < 4; q++) fx(bar, q, 'kick', 0.22);
  if (fill) { for (let b = 2; b < 4; b += 0.5) fx(bar, b, 'snare', vel * (0.7 + (b - 2) * 0.2)); return; }
  for (const b of [0.5, 1.5, 2.5, 3.5]) if (drumR() < 0.3) fx(bar, b, 'snare', vel * 0.55);
}

// ---- the typewriter: the story, one keystroke per character -------------------
const LINES = [];
function typeLine(bar, beat, text, step = 0.5, vel = 0.7) {
  LINES.push({ beat: B(bar, beat), text });
  [...text].forEach((ch, i) => { if (ch !== ' ') fx(bar, beat + i * step, 'type', vel, { char: i, line: LINES.length - 1 }); });
  fx(bar, beat + text.length * step, 'carriage', 0.6, { line: LINES.length - 1 });
}

// =============================== 1–4  overture =================================
typeLine(1, 0, 'NEW YORK. NIGHT.', 0.25, 0.8);
fx(1, 0, 'siren', 0.8, { dur: 6, period: 2.4 });
fx(2, 1, 'horn', 0.8, { dur: 0.35 }); fx(2, 1.75, 'horn', 0.7, { dur: 0.2 });
fx(3, 0, 'ratchet', 0.8, { dur: 2, from: 8, to: 20 });
fx(3, 2.5, 'horn', 0.7, { dur: 0.3 });
for (let b = 0; b < 4; b += 0.25) fx(4, b, 'snare', 0.3 + b * 0.12);
[...'C2 Db2 D2 Eb2 E2 F2 Gb2 G2'.split(' ')].forEach((nm, j) => n(3, 2 + j * 0.25, 0.25, [nm, m(nm) + 12], 0.35 + j * 0.03, 'piano'));
n(4, 3.5, 0.5, ['C2', 'C3', 'Eb4', 'G4', 'B4', 'D5'], 0.7, 'piano', { tag: 'stab' });
fx(4, 3.5, 'crash', 0.8);

// =============================== 5–28  the street =============================
for (let k = 0; k < 24; k++) {
  const bar = 5 + k, c = THEME[k % 8], next = THEME[(k + 1) % 8];
  walk(bar, c, next, 0.52, k);
  comp(bar, c, 0.3, k);
  brushes(bar, 0.5);
  for (let q = 0; q < 4; q++) fx(bar, q, 'step', 0.35, { tag: 'step' });
}
T.forEach((notes, k) => mel(5 + k, notes, 0.55, 'trumpet'));
DAME.forEach((notes, k) => mel(13 + k, notes, 0.5, 'clarinet', { tag: 'dame' }));
T.forEach((notes, k) => {
  mel(21 + k, notes, 0.55, 'trumpet');
  notes.forEach(([b, d, nm]) => n(21 + k, b, d, thirdBelow(nm), 0.44, 'clarinet', { tag: 'mel' }));
});
fx(10, 2, 'horn', 0.7, { dur: 0.3, tag: 'taxi' }); fx(10, 2.75, 'horn', 0.6, { dur: 0.2 });
fx(19, 0, 'horn', 0.6, { dur: 0.45, tag: 'taxi' });
fx(26, 1, 'horn', 0.7, { dur: 0.3, tag: 'taxi' }); fx(26, 1.75, 'horn', 0.65, { dur: 0.25 });
typeLine(5, 2, 'A MAN IN A HAT.');
typeLine(13, 2, 'A DAME IN RED.');
typeLine(17, 2, 'SHE DROPS A CARD.');
typeLine(22, 0, 'HOTEL MAJESTIC.');
typeLine(25, 0, 'ASK FOR THE CELLAR.');
fx(17, 0, 'glass', 0.5, { tag: 'card' });            // the card lands

// =============================== 29–44  the lobby =============================
const LOBBY = ['Ebmaj7', 'Cm7', 'Fm7', 'Bb7', 'Ebmaj7', 'C7b9', 'Fm7', 'Bb7', 'Cm', 'Db7', 'Cm', 'Db7', 'Ab7', 'G7b9', 'Ab7', 'G7b9'].map(chord);
LOBBY.forEach((c, k) => {
  const bar = 29 + k;
  const root = (() => { let x = 36 + c.root; if (x > 47) x -= 12; return x; })();
  n(bar, 0, 2, root, 0.5, 'bass'); n(bar, 2, 2, root + c.q[2] - (root + c.q[2] > 50 ? 12 : 0), 0.44, 'bass');
  const v = voicing(c);
  n(bar, 0, 1.5, v, 0.26, 'piano', { tag: 'comp' }); n(bar, 2.5, 1, v, 0.22, 'piano', { tag: 'comp' });
  fx(bar, 0, 'swish', 0.3, { dur: 3.6 }); fx(bar, 1, 'hat', 0.3); fx(bar, 3, 'hat', 0.3);
  fx(bar, 0, 'kick', 0.2); fx(bar, 2, 'kick', 0.16);
});
[
  [[0, 1.5, 'G5'], [1.5, 0.5, 'F5'], [2, 2, 'Eb5']],
  [[0, 1, 'G5'], [1, 1, 'Bb5'], [2, 2, 'D6']],
  [[0, 1.5, 'C6'], [1.5, 0.5, 'Ab5'], [2, 2, 'F5']],
  [[0, 1, 'D5'], [1, 1, 'F5'], [2, 1, 'Ab5'], [3, 1, 'D6']],
  [[0, 2, 'Eb6'], [2, 1, 'D6'], [3, 1, 'Bb5']],
  [[0, 1, 'G5'], [1, 1, 'E5'], [2, 1, 'Db6'], [3, 1, 'Bb5']],
  [[0, 2, 'Ab5'], [2, 1, 'C6'], [3, 1, 'F5']],
  [[0, 2, 'Bb5'], [2, 2, 'Ab5']],
].forEach((notes, k) => mel(29 + k, notes, 0.5, 'vibes'));
['Bb4', 'G4', 'Ab4', 'F4', 'G4', 'Bb4', 'C5', 'D5'].forEach((nm, k) => n(29 + k, 0, 4, nm, 0.3, 'clarinet', { tag: 'counter' }));
fx(29, 0, 'ding', 0.6, { midi: 88, tag: 'desk' });
// the Manager: low sax and the bass in unison, half a step of menace
const MANAGER = [
  [[0, 1.5, 'C3'], [1.5, 0.5, 'Db3'], [2, 2, 'C3']],
  [[0, 1, 'Gb2'], [1, 1, 'G2'], [2, 2, 'Ab2']],
  [[0, 1.5, 'C3'], [1.5, 0.5, 'Eb3'], [2, 1, 'D3'], [3, 1, 'Db3']],
  [[0, 4, 'C3', { growl: true }]],
];
MANAGER.forEach((notes, k) => mel(37 + k, notes, 0.62, 'sax', { tag: 'manager' }));
fx(33, 0, 'ding', 0.5, { midi: 84, tag: 'lift' }); fx(33, 0.5, 'ding', 0.45, { midi: 88 });
fx(41, 0, 'ding', 0.55, { midi: 84, tag: 'lift' }); fx(41, 0.5, 'ding', 0.5, { midi: 88 });
typeLine(29, 2, 'THE MAJESTIC.');
typeLine(36, 0, 'THE MANAGER.', 0.5, 0.8);
typeLine(42, 0, 'GOING DOWN.');

// =============================== 45–56  the descent ============================
for (let k = 0; k < 12; k++) {
  const bar = 45 + k, top = 48 - k;
  for (let q = 0; q < 4; q++) n(bar, q, 1, top - q, 0.45 + k * 0.012, 'bass');
  const base = 60 - k;
  n(bar, 0, 4, [base, base + 3, base + 6, base + 9], 0.32 + k * 0.012, 'strings', { trem: true });
  n(bar, 0, 0.5, base + 9 + 12, 0.45, 'trumpet', { tag: 'stab' });
  n(bar, 0, 0.5, base - 6, 0.45, 'sax', { tag: 'stab' });
  for (let e = 0; e < 8; e++) fx(bar, e * 0.5, 'hat', 0.25 + k * 0.02);
  fx(bar, 0, 'kick', 0.4); fx(bar, 2, 'kick', 0.35);
}
fx(45, 0, 'ratchet', 0.6, { dur: 12 * 4 * 60 / 150, from: 6, to: 24, tag: 'cables' });
[[45, 88, 'B1'], [48, 84, 'B2'], [51, 81, 'B3'], [54, 77, '?']].forEach(([bar, mid, label]) => fx(bar, 0, 'ding', 0.5, { midi: mid, tag: 'floor', label }));
typeLine(45, 1, 'DOWN.', 0.5);
typeLine(49, 0, 'FURTHER DOWN.', 0.25);
typeLine(53, 0, 'BELOW THE CITY...', 0.25);

// =============================== 57–84  the club ===============================
fx(57, 0, 'thud', 0.9, { tag: 'arrive' });
fx(57, 0, 'crash', 0.7);
fx(57, 0, 'crowd', 0.9, { dur: 44, seed: 5 });
const CLUB = [...THEME, ...THEME, ...THEME, ...['Cm6', 'Cm6', 'G7b9', 'G7b9'].map(chord)];
CLUB.forEach((c, k) => {
  const bar = 57 + k;
  if (bar >= 81) return;
  walk(bar, c, CLUB[k + 1] || c, 0.6, k);
  comp(bar, c, 0.36, k);
  kit(bar, 0.5, k % 8 === 7);
  if (k % 8 === 0) fx(bar, 0, 'crash', 0.5);
});
// the head, in the band: trumpet and sax a third apart
T.forEach((notes, k) => {
  mel(57 + k, notes, 0.66, 'trumpet', { open: true });
  notes.forEach(([b, d, nm]) => n(57 + k, b, d, thirdBelow(nm), 0.58, 'sax', { tag: 'mel' }));
});
// the sax solo
[
  [[0, 0.5, 'G4'], [0.5, 0.5, 'Ab4'], [1, 0.5, 'A4'], [1.5, 0.5, 'Bb4'], [2, 0.5, 'B4'], [2.5, 0.5, 'C5'], [3, 0.5, 'Eb5'], [3.5, 0.5, 'G5']],
  [[0, 1.5, 'F5'], [1.5, 0.5, 'Eb5'], [2, 0.5, 'C5'], [2.5, 0.5, 'A4'], [3, 1, 'G4']],
  [[0, 0.5, 'Ab4'], [0.5, 0.5, 'C5'], [1, 0.5, 'Eb5'], [1.5, 0.5, 'F5'], [2, 1, 'Ab5'], [3, 0.5, 'G5'], [3.5, 0.5, 'F5']],
  [[0, 2, 'D5', { growl: true }], [2, 0.5, 'F5'], [2.5, 0.5, 'Ab5'], [3, 1, 'Bb5']],
  [[0, 1, 'G5'], [1, 0.5, 'F5'], [1.5, 0.5, 'Eb5'], [2, 0.5, 'D5'], [2.5, 0.5, 'Bb4'], [3, 1, 'G4']],
  [[0, 0.5, 'Gb4'], [0.5, 0.5, 'Ab4'], [1, 0.5, 'C5'], [1.5, 0.5, 'Eb5'], [2, 2, 'Gb5', { growl: true }]],
  [[0, 0.5, 'F5'], [0.5, 0.5, 'D5'], [1, 0.5, 'Ab4'], [1.5, 0.5, 'C5'], [2, 0.5, 'B4'], [2.5, 0.5, 'D5'], [3, 0.5, 'F5'], [3.5, 0.5, 'Ab5']],
  [[0, 3, 'G5', { growl: true }]],
].forEach((notes, k) => mel(65 + k, notes, 0.66, 'sax', { tag: 'solo' }));
// the trumpet's shout chorus: riffs built on each chord, the sax answering
THEME.forEach((c, k) => {
  const bar = 73 + k;
  const top = (iv) => { let x = 72 + ((c.root + iv) % 12); if (x < 74) x += 12; if (x > 86) x -= 12; return x; };
  const r5 = top(c.q[2]), r1 = top(0), r7 = top(c.q[3] ?? 10);
  mel(bar, [[0, 0.5, r5], [0.5, 1, r1], [1.5, 0.5, r1], [2, 1.5, r7], [3.5, 0.5, r5]], 0.72, 'trumpet', { open: true, tag: 'shout' });
  mel(bar, [[2, 0.5, r5 - 12], [2.5, 1, r7 - 12]], 0.6, 'sax');
});
// the break: stop-time hits, then the drums alone
for (const [bar, beat] of [[81, 0], [82, 0], [83, 0], [84, 2.5]]) {
  const c = chord(bar < 83 ? 'Cm6' : 'G7b9');
  n(bar, beat, 0.5, voicing(c).map((x) => x + 12), 0.6, 'piano', { tag: 'stab' });
  n(bar, beat, 0.5, (c.root + 36) % 12 + 36, 0.7, 'bass');
  n(bar, beat, 0.5, c.root === 0 ? 'Eb6' : 'Ab5', 0.7, 'trumpet', { tag: 'stab' });
  n(bar, beat, 0.5, c.root === 0 ? 'G4' : 'F4', 0.65, 'sax', { tag: 'stab' });
  fx(bar, beat, 'crash', 0.6); fx(bar, beat, 'kick', 0.8);
}
for (let b = 1; b < 4; b += 0.5) fx(83, b, 'snare', 0.4 + b * 0.08);
for (let b = 0; b < 2.5; b += 0.25) fx(84, b, 'snare', 0.5 + b * 0.1);
for (const [bar, beat] of [[59, 1.5], [62, 3.5], [66, 2.5], [70, 0.5], [75, 3.5], [78, 1.5]]) fx(bar, beat, 'glass', 0.4, { tag: 'clink' });
typeLine(58, 0, 'THE CLUB.', 0.25);
typeLine(65, 0, 'SMOKE. A SAXOPHONE.', 0.25);
typeLine(77, 0, 'THE DAME SINGS NOTHING.', 0.25);

// =============================== 85–88  he knows ================================
for (let k = 0; k < 4; k++) {
  const bar = 85 + k;
  ['C2', 'Db2', 'C2', 'B1'].forEach((nm, q) => n(bar, q, 1, nm, 0.6, 'bass'));
  n(bar, 0, 4, ['C4', 'Db4', 'Gb4', 'G4'], 0.36 + k * 0.04, 'strings', { trem: true });
  for (let e = 0; e < 8; e++) n(bar, e * 0.5, 0.5, e % 2 ? 'G1' : 'C1', 0.2 + k * 0.03, 'piano', { tag: 'rumble' });
  fx(bar, 0, 'kick', 0.55); fx(bar, 0.4, 'kick', 0.4);          // a heartbeat
  fx(bar, 2, 'kick', 0.55); fx(bar, 2.4, 'kick', 0.4);
}
MANAGER.forEach((notes, k) => mel(85 + k, notes, 0.7, 'sax', { tag: 'manager' }));
typeLine(85, 0, 'HE KNOWS.', 0.5, 0.8);

// =============================== 89  the shot ===================================
fx(89, 0, 'shot', 1, { tag: 'shot', wet: 0.95 });

// =============================== 90–94  the raid ================================
fx(90, 0, 'siren', 0.9, { dur: 7, period: 1.6, tag: 'siren' });
fx(90, 0.5, 'whistle', 0.8, { dur: 0.6 }); fx(91, 2, 'whistle', 0.8, { dur: 0.8 }); fx(93, 1, 'whistle', 0.8, { dur: 0.5 }); fx(93, 1.75, 'whistle', 0.7, { dur: 0.5 });
const chaos = mulberry32(1917);
for (let bar = 90; bar <= 94; bar++) {
  fx(bar, 0, 'crash', 0.7);
  for (let b = 0; b < 4; b += 0.25) fx(bar, b, 'snare', 0.26 + (bar - 90) * 0.03);
  for (let b = 0; b < 4; b += 0.5) n(bar, b, 0.5, 30 + Math.floor(chaos() * 20), 0.45, 'bass');
  for (const b of [0.5, 1.5, 3, 3.5]) {
    const lo = 55 + Math.floor(chaos() * 14);
    n(bar, b, 0.25, [lo, lo + 1, lo + 6, lo + 7], 0.42, 'piano', { tag: 'cluster' });
  }
  for (let b = 0; b < 4; b += 0.25) n(bar, b, 0.25, (b * 4) % 2 ? 'C6' : 'Db6', 0.36, 'trumpet', { tag: 'scream' });
  for (let b = 0; b < 4; b += 0.25) n(bar, b, 0.25, (b * 4) % 2 ? 'Gb4' : 'G4', 0.36, 'sax', { tag: 'scream' });
}
typeLine(90, 0, 'RAID!', 0.25, 0.9);
typeLine(92, 0, 'RAID! RAID!', 0.25, 0.9);

// =============================== 95–98  curtain ==================================
for (const [bar, beat] of [[95, 0], [95, 2.5], [96, 1], [96, 3]]) {
  n(bar, beat, 0.5, ['G2'], 0.7, 'bass');
  n(bar, beat, 0.5, ['B3', 'F4', 'Ab4', 'Eb5'], 0.62, 'piano', { tag: 'stab' });
  n(bar, beat, 0.5, 'Ab5', 0.7, 'trumpet', { tag: 'stab' }); n(bar, beat, 0.5, 'F4', 0.65, 'sax', { tag: 'stab' });
  fx(bar, beat, 'kick', 0.7); fx(bar, beat, 'snare', 0.6);
}
n(97, 0, 8, ['C2', 'G2'], 0.7, 'bass', { tag: 'last' });
n(97, 0, 8, ['C3', 'Eb4', 'G4', 'B4', 'D5'], 0.62, 'piano', { tag: 'last' });
n(97, 0, 6, 'D6', 0.6, 'trumpet', { tag: 'last' }); n(97, 0, 6, 'B4', 0.55, 'sax', { tag: 'last' });
n(97, 0, 6, 'G5', 0.5, 'clarinet', { tag: 'last' }); n(97, 0, 6, ['Eb5', 'G5'], 0.5, 'vibes', { tag: 'last' });
n(97, 0, 7, ['C4', 'G4', 'Eb5'], 0.4, 'strings', { tag: 'last' });
fx(97, 0, 'crash', 0.9); fx(97, 0, 'kick', 0.9);
n(99, 0, 3, ['C1', 'C2'], 0.4, 'piano', { tag: 'fin' });
typeLine(97, 0, 'FIN.', 0.5, 0.8);

// ------------------------------------------------------------ performing --
const lobbyPedal = [];
for (let bar = 29; bar < 45; bar++) lobbyPedal.push([B(bar), B(bar + 1)]);
const PEDAL = [...lobbyPedal, [B(97), B(101)]];
const swung = raw.map((e) => {
  const b0 = sw(e.beat), b1 = sw(e.beat + e.dur);
  return { ...e, beat: b0, dur: Math.max(0.1, b1 - b0) };
});

// Every event timed from the tempo map (swing already applied), with a hair of
// human looseness — none for the typewriter, which is a machine.
const jr = mulberry32(0x7a11);
export const events = swung.map((e) => {
  const at = Math.max(0, sec(e.beat) + (e.inst === 'type' || e.inst === 'carriage' ? 0 : (jr() - 0.5) * 0.012));
  let end = sec(e.beat + e.dur) - 0.01;
  if (e.inst === 'piano') for (const [a, z] of PEDAL) if (e.beat >= a - 0.05 && e.beat < z - 0.05) end = Math.max(end, sec(z) - 0.01);
  return {
    ...e,
    at,
    dur: Math.max(0.03, end - at),
    velocity: Math.min(0.95, Math.max(0.05, e.vel * (1 + (jr() - 0.5) * 0.06))),
  };
}).sort((a, b) => a.at - b.at);

export const pianoEvents = events.filter((e) => e.inst === 'piano');
export const bandEvents = events.filter((e) => e.inst !== 'piano');

// ------------------------------------------------------------------ rooms --
// The reverb send, scene by scene: the street's night air (and a slapback off
// the buildings), the lobby's marble, a dry cellar, a low smoky room.
export function wet(t) {
  if (t < sec(B(5))) return 0.25;
  if (t < sec(B(29))) return 0.18;
  if (t < sec(B(45))) return 0.5;
  if (t < sec(B(57))) return 0.3;
  if (t < sec(B(89))) return 0.14;
  if (t < sec(B(90))) return 0.9;
  return 0.35;
}
export function slap(t) { return t >= sec(B(5)) && t < sec(B(29)) ? 0.35 : 0; }

// ------------------------------------------------------------------- cues --
export const BARS = 98;
export const bar = (b, beat = 0) => sec(sw(B(b, beat)));
export const cues = {
  curtainUp: [bar(4, 2), bar(5)],
  street: bar(5), dame: [bar(13), bar(21)], card: bar(17), pick: bar(21),
  flyToLobby: [bar(28), bar(29)], lobby: bar(29), managerIn: bar(36), manager: bar(37),
  dameLift: [bar(33), bar(35)], lift: [bar(41), bar(44, 3)],
  descent: [bar(45), bar(57)], arrive: bar(57), club: bar(57), solo: bar(65), shout: bar(73), brk: bar(81),
  knows: bar(85), shot: bar(89), raid: [bar(90), bar(95)], curtain: [bar(95), bar(97)], fin: bar(97),
  end: sec(B(99)) + 4.5,
};
export const LINES_TYPED = LINES.map((l) => ({ ...l, at: sec(sw(l.beat)) }));
export const duration = cues.end;
export const title = 'Speakeasy';

// ---- for the score clef opens: a short score, the melody instruments over the bass
export const written = raw.filter((e) => ['trumpet', 'clarinet', 'sax', 'vibes', 'bass'].includes(e.inst) && e.midi)
  .map((e) => ({ ...e, tag: e.inst === 'bass' || e.midi < 55 ? 'tenor' : e.tag }))
  .filter((e) => e.beat < B(99));
export const notation = {
  bars: 98,
  keys: [[1, 'c', 'minor'], [29, 'ees', 'major'], [45, 'c', 'minor']],
  tempos: [[1, 152], [29, 132], [45, 150], [57, 176], [89, 60], [90, 190], [95, 150]],
  sections: [[1, 'overture'], [5, 'the street'], [29, 'the lobby'], [45, 'the descent'], [57, 'the club'], [85, 'he knows'], [89, 'the shot'], [90, 'the raid'], [95, 'curtain']],
};
