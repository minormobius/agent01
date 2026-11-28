// Track I.1 and III.14, "The eight seconds" (Modulo, 11-27). Piano only.
// C4 + E4 held 3.7 s in a 4-s slot: equal third (400 c) at 0 s, just third (5/4, 386.31 c) at 4 s.
// Same velocity, same C, so the only thing that changes between the halves is E: 13.69 c.
const just = 60 + 12 * Math.log2(5 / 4);
const e = [];
for (const [at, m] of [[0, 64], [4, just]]) e.push({ at, dur: 3.7, midi: 60, velocity: 0.6 }, { at, dur: 3.7, midi: m, velocity: 0.6 });
process.stdout.write(JSON.stringify({ parts: [{ instrument: 'piano', events: e }] }, null, 1) + '\n');
