// Track 4, "Two thirds" (Morphyx, 11-24). C4 + E4 held 5.6 s in 6-s slots, equal (400 c) then just (5/4),
// four pairs on the guitar (0-48 s), the same four pairs on the piano (48-96 s).
// Prediction: E's 4th partial against C's 5th. Equal: 1318.51 - 1308.13 = 10.38 Hz. Just: 0 Hz.
const just = 60 + 12 * Math.log2(5 / 4);
const ev = (inst, t0) => { const e = []; for (let k = 0; k < 8; k++) {
  const at = t0 + 6 * k; e.push({ at, dur: 5.6, midi: 60, velocity: 0.6 }, { at, dur: 5.6, midi: k % 2 ? just : 64, velocity: 0.6 }); }
  return { instrument: inst, events: e }; };
process.stdout.write(JSON.stringify({ parts: [ev('guitar', 0), ev('piano', 48)] }, null, 1) + '\n');
