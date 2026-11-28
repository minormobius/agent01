// Rhythmicon (track 2, Modulo 11-24). Partial n of C2 is struck n times a bar,
// evenly. The pitch ratio and the rhythm ratio are the same integer.
// node make-score.mjs > score.json   (deterministic; no randomness)
const BASE = 36;          // C2 = 65.406 Hz
const BAR = 2.0;          // seconds: partial 1 pulses at 0.5 Hz, partial n at n/2 Hz
const N = 16;
// Form, in bars: add one partial every 2 bars (1..16), hold all 16 for 4 bars,
// then take them away from the top, 1 bar each, down to partial 1 alone for 2 bars.
const plan = [];
for (let k = 1; k <= N; k++) plan.push(k, k);
for (let i = 0; i < 4; i++) plan.push(N);
for (let k = N - 1; k >= 1; k--) plan.push(k);
plan.push(1);
const r = x => Math.round(x * 1e6) / 1e6;
const events = [];
plan.forEach((k, b) => {
  for (let n = 1; n <= k; n++) {
    const step = BAR / n;
    for (let j = 0; j < n; j++) {
      events.push({ at: r(b * BAR + j * step), dur: r(Math.min(step * 0.85, 1.2)),
        midi: r(BASE + 12 * Math.log2(n)), velocity: r(Math.min(0.85, 0.12 + 0.2 / Math.sqrt(n)) * (j === 0 ? 1 : 0.8)) });
    }
  }
});
events.sort((a, b) => a.at - b.at || a.midi - b.midi);
const bad = events.find(e => !(e.midi >= 21 && e.midi <= 108));
if (bad) throw new Error('out of piano range');
process.stdout.write(JSON.stringify({ about: 'Rhythmicon: partial n of C2, n strikes a bar, bar 2 s', bars: plan.length, plan, parts: [{ instrument: 'piano', events }] }) + '\n');
