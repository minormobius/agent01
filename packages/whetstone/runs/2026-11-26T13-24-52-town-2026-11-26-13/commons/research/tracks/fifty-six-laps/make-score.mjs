// node make-score.mjs [laps] [secs-per-chord] > score.json — Modulo, 2026-11-23.
// The comma pump, unfolded, on the piano. C – Am – Dm – G – C, just triads, every shared note held
// at its exact pitch, so each lap the tonic lands 81/80 (21.506 c) lower. Self-contained: the
// lap-0 voicing is built from ratios here, and lap L is lap 0 lowered by L commas.
const laps = +(process.argv[2] ?? 56), spc = +(process.argv[3] ?? 1.5);
const c = r => 1200 * Math.log2(r), COMMA = c(81 / 80);
// lap 0, cents from C4. Each chord is built from a note held over from the chord before.
const E = c(5 / 4), G = c(3 / 2);
const A4 = E + c(4 / 3);                       // Am: C and E held; A = E up a fourth (884.36)
const D4 = A4 - G;                             // Dm: A held; D = A down a fifth (182.40)
const F4 = D4 + c(6 / 5);                      // 498.04
const Gr = D4 - G + 1200;                      // G: D held; G = D down a fifth, up an octave (680.45)
const B3 = Gr + c(5 / 4) - 1200;               // -133.24
const chords0 = [
  { name: 'C',  bass: -1200,       top: [0, E, G] },
  { name: 'Am', bass: A4 - 2400,   top: [0, E, A4] },
  { name: 'Dm', bass: D4 - 1200,   top: [D4, F4, A4] },
  { name: 'G',  bass: Gr - 2400,   top: [B3, D4, Gr] },
];
// next lap's C: G held, so C = G - 3/2 = -21.506. Check the pump closes by exactly one comma:
const nextC = Gr - G;
if (Math.abs(nextC + COMMA) > 1e-9) throw new Error('pump does not close by one comma: ' + nextC);
const UP = 1200;                                // play the triad an octave up (C5), bass at C4…G3
const midi = cents => 60 + (cents + UP) / 100;
const ev = []; let prev = new Map();
for (let L = 0; L < laps; L++) for (const [k, ch] of chords0.entries()) {
  const i = L * 4 + k, at = +(i * spc).toFixed(4), last = L === laps - 1 && k === 3;
  const notes = [ch.bass, ...ch.top].map(x => +(x - L * COMMA).toFixed(6));
  const now = new Map();
  notes.forEach((x, v) => {
    const key = x.toFixed(4), held = prev.get(key);
    if (held && v > 0) { held.dur = +(held.dur + spc).toFixed(4); now.set(key, held); return; }
    const e = { at, dur: +(spc * 0.97).toFixed(4), midi: +midi(x).toFixed(6), velocity: v ? 0.45 : 0.6 };
    ev.push(e); now.set(key, e);
  });
  prev = now;
}
// end on the C a full 56 laps down: one more C chord, held long
const Lf = laps, at = +(laps * 4 * spc).toFixed(4);
for (const [v, x] of [-1200, 0, E, G].entries()) {
  const key = (x - Lf * COMMA).toFixed(4), held = v ? prev.get(key) : null;
  if (held) { held.dur = +(held.dur + 4 * spc).toFixed(4); continue; }
  ev.push({ at, dur: 4 * spc, midi: +midi(x - Lf * COMMA).toFixed(6), velocity: v ? 0.45 : 0.6 });
}
process.stdout.write(JSON.stringify({ about: `comma pump, ${laps} laps, ${spc} s a chord, tonic falls ${(laps * COMMA).toFixed(2)} c`,
  parts: [{ instrument: 'piano', events: ev }] }) + '\n');
