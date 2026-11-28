// Track 6, "Where the wolf lives" (Morphyx, 11-25). Twelve fifths of the circle, C G D A E B F# C# G# Eb Bb F,
// each a held dyad on the guitar (2.8 s in 3-s slots), in four tunings, in the order history adopted them:
// Pythagorean, quarter-comma meantone (Aron 1523), Werckmeister III (1691), equal. C4 = MIDI 60 in all four.
// Twelve fifths overshoot seven octaves by the Pythagorean comma (23.46 c). Every tuning pays it somewhere.
const P = 1200 * Math.log2(3 / 2), PC = 12 * P - 7 * 1200;           // 701.955, 23.460
const chain = f => { const t = []; for (let k = -3; k <= 8; k++) t[((7 * k) % 12 + 12) % 12] = ((k * f) % 1200 + 1200) % 1200; return t; };
const W3 = [0, 90.225, 192.180, 294.135, 390.225, 498.045, 588.270, 696.090, 792.180, 888.270, 996.090, 1092.180];
export const tunings = [
  ['pythagorean', chain(P)],                                   // eleven pure fifths, wolf G#-Eb
  ['meantone', chain(P - 21.5063 / 4)],                         // fifths narrowed by 1/4 syntonic comma, wolf G#-Eb
  ['werckmeister3', W3],                                       // C-G, G-D, D-A, B-F# narrowed by 1/4 Pythagorean comma
  ['equal', [...Array(12).keys()].map(i => 100 * i)]];         // all twelve narrowed by 1/12
export const circle = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
export const slots = [];
tunings.forEach(([name, t], ti) => circle.forEach((p, j) => {
  const base = p >= 7 ? 48 : 60, lo = base + t[p] / 100;                  // lower note between G3 and F#4
  let fifth = t[(p + 7) % 12] - t[p]; fifth = ((fifth % 1200) + 1200) % 1200;
  slots.push({ tuning: name, at: 3 * (12 * ti + j), lo, hi: lo + fifth / 100, fifth, off: fifth - P });
}));
if ((process.argv[1] || '').endsWith('make-score.mjs')) {
  const events = slots.flatMap(s => [{ at: s.at, dur: 2.8, midi: +s.lo.toFixed(6), velocity: 0.6 }, { at: s.at, dur: 2.8, midi: +s.hi.toFixed(6), velocity: 0.6 }]);
  process.stdout.write(JSON.stringify({ parts: [{ instrument: 'guitar', events }] }, null, 1) + '\n');
}
