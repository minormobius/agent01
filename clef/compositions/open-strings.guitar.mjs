// open-strings.guitar.mjs — "Open Strings", a piece written for pfsynth's classical guitar (clef's
// Guitar — physical model), as tab: every note a string, a fret and a technique, for
// src/pfguitar.js packTab → renderPacked. Not LilyPond: clef cannot open it as a score; it is here as
// the reference for writing to the guitar directly. G major, 84 bpm, ~2 min: harmonics; Travis
// picking G – D/F# – Em7 – Cadd9 with the top two strings held; strumming with a pull-off; a
// triplet-arpeggio bridge through the F#m7 barre with a hammer-on and a slide; the theme played big;
// a rolled G and harmonics.

export const BPM = 84;
const OPEN = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
const SH = {
  Em9add: [0, 2, 4, 0, 0, 0], Cadd9: [-1, 3, 2, 0, 3, 3], G: [3, 2, 0, 0, 3, 3], DF: [2, -1, 0, 2, 3, 2],
  Em7: [0, 2, 2, 0, 3, 3], Am7: [-1, 0, 2, 0, 1, 0], D: [-1, -1, 0, 2, 3, 2], Dsus4: [-1, -1, 0, 2, 3, 3],
  Bm7: [-1, 2, 4, 2, 3, 2], Em9: [0, 2, 0, 0, 3, 2], Fsm7: [2, 4, 2, 2, 2, 2], Asus2: [-1, 0, 2, 2, 0, 0],
  A: [-1, 0, 2, 2, 2, 0], Cmaj7: [-1, 3, 2, 0, 0, 0],
};
const fret = (shape, s) => shape[6 - s];
// time: bars of 4 beats; the last bars slow down (a ritardando from bar 32)
const BEAT = 60 / BPM, RIT_FROM = 32 * 4;
function T(bar, beat = 0) {
  const b = bar * 4 + beat;
  if (b <= RIT_FROM) return b * BEAT;
  const x = b - RIT_FROM;                       // the beat stretches by up to 45% over 4 bars
  return RIT_FROM * BEAT + BEAT * (x + 0.45 * x * x / 32);
}
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const jit = (ms) => (rnd() - 0.5) * 2 * ms / 1000;
const notes = [];
const add = (n) => { notes.push(n); return n; };
/** One note. */
function pick(at, s, f, velocity, end, extra = {}) { return add({ at: at + jit(6), end, string: s, fret: f, velocity: velocity * (0.94 + 0.12 * rnd()), ...extra }); }
/** A strum: down = low string to high, up = high to low (top strings only). Spread is the pick's sweep. */
function strum(at, shape, dir, velocity, end, { top = 6, spread = 0.011 } = {}) {
  const strs = [6, 5, 4, 3, 2, 1].filter((s) => s <= top && fret(shape, s) >= 0);
  const order = dir === 'down' ? strs : [...strs].reverse();
  order.forEach((s, i) => pick(at + i * spread * (0.8 + 0.4 * rnd()), s, fret(shape, s), velocity * (dir === 'down' ? 1 - 0.04 * i : 0.85), end));
}
const bassOf = (shape) => [6, 5, 4].find((s) => fret(shape, s) >= 0);

// ---- intro: natural harmonics, then open-string arpeggios ----
[6, 5, 4, 3].forEach((s, i) => pick(T(0, i), s, 0, 125, T(2, 2), { art: 'harmonic', artParam: 12 }));
[4, 3, 2].forEach((s, i) => pick(T(1, i), s, 0, 120, T(2, 3), { art: 'harmonic', artParam: 7 }));
pick(T(1, 3), 1, 0, 85, T(3), { art: 'harmonic', artParam: 12 });
for (const [bar, shape] of [[2, SH.Em9add], [3, SH.Cadd9]]) {
  const seq = [bassOf(shape), 4, 3, 2, 1, 2, 3, 2];
  seq.forEach((s, i) => pick(T(bar, i * 0.5), s, fret(shape, s), i === 0 ? 100 : 72 + 6 * (i % 3), T(bar + 1, 0.5)));
}

// ---- A: Travis picking, G – D/F# – Em7 – Cadd9, twice; hammer-ons the second time ----
const altBass = (shape) => (bassOf(shape) === 6 ? 4 : 4);
function travis(bar, shape, deco) {
  const root = bassOf(shape), alt = root === 6 ? 4 : 4, end = T(bar + 1, 0.3);
  // thumb on the beats (root, alternate, root, alternate), fingers on the off-beats, a pinch on 1
  [[0, root], [1, alt === root ? 5 : alt], [2, root === 5 ? 5 : root], [3, alt]].forEach(([b, s]) => pick(T(bar, b), s, fret(shape, s), 108, end));
  pick(T(bar, 0), 1, fret(shape, 1), 82, end);
  [[0.5, 2], [1.5, 1], [2.5, 3], [3.5, 2]].forEach(([b, s]) => pick(T(bar, b), s, fret(shape, s), 76, end));
  if (deco === 'G') { pick(T(bar, 2.5), 3, 0, 80, T(bar, 2.75)); pick(T(bar, 2.75), 3, 2, 70, end, { art: 'hammer' }); }
  if (deco === 'C') { pick(T(bar, 1), 4, 0, 96, T(bar, 1.25)); pick(T(bar, 1.25), 4, 2, 80, end, { art: 'hammer' }); }
  if (deco === 'Em') { pick(T(bar, 3), 5, 2, 96, T(bar, 3.5)); pick(T(bar, 3.5), 5, 0, 76, end, { art: 'pull' }); }
}
const A = [SH.G, SH.DF, SH.Em7, SH.Cadd9];
for (let k = 0; k < 8; k++) travis(4 + k, A[k % 4], k >= 4 ? ['G', null, 'Em', 'C'][k % 4] : null);

// ---- B: strummed, D DU UDU ----
const B = [SH.Am7, SH.Cadd9, SH.G, SH.D, SH.Em7, SH.Cadd9, SH.G, SH.Dsus4];
B.forEach((shape, k) => {
  const bar = 12 + k, pattern = [[0, 'down', 128], [1, 'down', 112], [1.5, 'up', 96], [2.5, 'up', 98], [3, 'down', 118], [3.5, 'up', 94]];
  pattern.forEach(([b, dir, v], i) => {
    const next = pattern[i + 1] ? T(bar, pattern[i + 1][0]) : T(bar + 1);
    let sh = shape;
    if (k === 7 && b >= 2.5) sh = SH.D;     // Dsus4 resolves to D…
    strum(T(bar, b), sh, dir, v, next + 0.02, { top: dir === 'up' ? 3 : 6 });
  });
  if (k === 7) pick(T(bar, 2.25), 1, 2, 90, T(bar, 2.5), { art: 'pull' });   // …by pulling off the G to F#
});

// ---- C: the bridge, triplet arpeggios, a barre, a hammer-on, a slide ----
const C = [SH.Bm7, SH.Em9, SH.Fsm7, SH.Asus2, SH.Cmaj7, SH.Bm7, SH.Em9, SH.Dsus4];
const UP = [[3, 2], [1, 2], [3, 1], [2, 3]];
C.forEach((shape, k) => {
  const bar = 20 + k, root = bassOf(shape), end = T(bar + 1, 0.2);
  for (let b = 0; b < 4; b++) {
    const bass = b % 2 === 0 ? root : 4;
    pick(T(bar, b), bass, fret(shape, bass), b === 0 ? 104 : 88, end);
    UP[b].forEach((s, j) => pick(T(bar, b + (j + 1) / 3), s, fret(shape, s), 70 + 8 * j, end));
  }
  if (shape === SH.Asus2) { pick(T(bar, 2), 2, 0, 90, T(bar, 2.33)); pick(T(bar, 2.33), 2, 2, 82, end, { art: 'hammer' }); }
  if (k === 6) pick(T(bar, 3), 2, 3, 96, T(bar + 1), { slideTo: 5 });   // a slide up the B string, D to E
  if (k === 7) { pick(T(bar, 3), 1, 3, 92, T(bar, 3.33)); pick(T(bar, 3.33), 1, 2, 80, end, { art: 'pull' }); }
});

// ---- A': the theme played big: bass and strums together ----
const A2 = [SH.G, SH.DF, SH.Em7, SH.Cadd9, SH.Am7, SH.D, SH.G, SH.G];
A2.forEach((shape, k) => {
  const bar = 28 + k, root = bassOf(shape);
  if (k === 7) { strum(T(bar), shape, 'down', 185, T(bar + 1), { spread: 0.02 }); return; }
  const ev = [[0, 'down', 185], [1, 'bass'], [1.5, 'up', 120], [2, 'down', 160], [2.5, 'up', 120], [3, 'bass'], [3.5, 'up', 126]];
  ev.forEach(([b, kind, v], i) => {
    const next = ev[i + 1] ? T(bar, ev[i + 1][0]) : T(bar + 1);
    if (kind === 'bass') pick(T(bar, b), b === 1 ? 4 : root, fret(shape, b === 1 ? 4 : root), 140, T(bar + 1));
    else strum(T(bar, b), shape, kind, v, next + 0.02, { top: kind === 'up' ? 3 : 6 });
  });
});

// ---- coda: a slow rolled G, harmonics on the top strings, a last low G ----
[6, 5, 4, 3, 2, 1].forEach((s, i) => pick(T(36) + i * 0.13, s, fret(SH.G, s), 120 - 6 * i, T(38)));
[3, 2, 1].forEach((s, i) => pick(T(37, 1 + i * 0.75), s, 0, 100, T(39), { art: 'harmonic', artParam: 12 }));
pick(T(38, 1), 6, 3, 92, T(40));

export const TAB = notes.sort((a, b) => a.at - b.at);
export const duration = T(40);
