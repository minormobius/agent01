// Convergence (track 5, Modulo 11-24). A tempo canon after Conlon Nancarrow, for the player piano.
// Nine voices play one melody. Voice r (r = 4..12) is pitched at harmonic r of C1 and plays at tempo r:
// its pitch ratio and its tempo ratio to any other voice are the same number, as in the rhythmicon.
// The melody is a palindrome (pitches and inter-onset gaps), and every voice is placed so that its middle
// note falls at the same instant T. Before T the slow voices lead; after T the fast ones pull away.
// Every note is h/8 of its voice's base with h in 8..16, so every pitch is a whole multiple of C1/8.
// node make-score.mjs > score.json   (deterministic; no randomness)
const C1 = 24;                 // midi of C1, 32.703 Hz
const VOICES = [4, 5, 6, 7, 8, 9, 10, 11, 12];
const SPAN4 = 180;             // seconds the slowest voice (4) takes to play the whole melody
// first half: [h, gap to the next note in units]. The middle note is h=16; the second half is the mirror.
const HALF = [
  [8, 1], [12, 1], [10, .5], [9, .5], [8, 1], [9, .5], [10, .5], [12, 1], [14, 1], [12, .5], [10, .5], [12, 2],
  [9, 1], [10, .5], [11, .5], [12, 1], [14, .5], [15, .5], [16, 1], [14, 1], [12, 1], [10, 2],
  [8, .5], [10, .5], [12, .5], [14, .5], [16, .5], [14, .5], [12, 1], [13, .5], [14, .5], [12, .5], [10, .5], [9, 1], [8, 2],
  [16, .5], [15, .5], [14, .5], [12, .5], [14, .5], [12, .5], [10, .5], [9, .5], [10, 1], [12, .5], [8, .5], [9, 2],
  [10, .5], [12, .5], [14, .5], [13, .5], [12, .5], [10, .5], [12, .5], [14, .5], [16, 1], [15, .5], [12, .5], [14, 2],
  [12, 1], [11, .5], [10, .5], [9, 1], [10, .5], [12, .5], [14, 1], [15, .5], [14, .5], [12, 1], [14, 1], [15, 1.5],
];
const MID = 16, LAST_UNITS = 3;
// offsets (units) of each note from the middle note; negative before, positive after
const before = []; let acc = 0;
for (let i = HALF.length - 1; i >= 0; i--) { acc += HALF[i][1]; before.unshift([HALF[i][0], -acc, HALF[i][1]]); }
const notes = [...before, [MID, 0, HALF[HALF.length - 1][1]], ...before.slice().reverse().map(([h, o], k, a) => [h, -o, k + 1 < a.length ? (a[k + 1][1] - o) * -1 : LAST_UNITS])];
// fix the mirrored gaps: gap after note at +a is the distance to the next onset
for (let i = 0; i < notes.length; i++) notes[i][2] = i + 1 < notes.length ? notes[i + 1][1] - notes[i][1] : LAST_UNITS;
const HALFU = acc;                         // units from first note to the middle
const U4 = SPAN4 / (2 * HALFU);            // seconds per unit in voice 4
const T = HALFU * U4;                      // the convergence instant: voice 4 starts at 0
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const events = [], voices = [];
for (const r of VOICES) {
  const u = U4 * 4 / r, vel = 0.4 / Math.sqrt(r / 4);
  voices.push({ r, unit_s: r6(u), enters: r6(T - HALFU * u), leaves: r6(T + HALFU * u) });
  notes.forEach(([h, off, gap], k) => {
    const mid = off === 0;
    events.push({ at: r6(T + off * u), dur: r6(Math.min(gap * u * 0.92, 2.5)),
      midi: r6(C1 + 12 * Math.log2(r * h / 8)), velocity: r6(Math.min(0.9, vel * (mid ? 1.15 : (k % 2 ? 0.85 : 1)))) });
  });
}
events.sort((a, b) => a.at - b.at || a.midi - b.midi);
const bad = events.find((e) => !(e.midi >= 21 && e.midi <= 108));
if (bad) throw new Error('out of piano range');
process.stdout.write(JSON.stringify({ about: 'Convergence: a 9-voice tempo canon; voice r at harmonic r of C1 and tempo r; all meet at T', T: r6(T), unit4_s: r6(U4), notes_per_voice: notes.length, voices, parts: [{ instrument: 'piano', events }] }) + '\n');
