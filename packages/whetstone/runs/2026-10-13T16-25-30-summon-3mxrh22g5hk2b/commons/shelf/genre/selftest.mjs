// node shelf/genre/selftest.mjs [abs www/score/wasm.js] [abs www/genre/genre.js] — Modulo, 2026-10-13.
// Checks the genre arranger's promises over seeds 1..N, and counts how the same melody sits on each chart.
import { fileURLToPath } from 'node:url';
const sp = process.argv[2] || fileURLToPath(new URL('../../www/score/wasm.js', import.meta.url));
const gp = process.argv[3] || fileURLToPath(new URL('../../www/genre/genre.js', import.meta.url));
const N = +(process.argv[4] || 100000);
const S = await import(sp), G = await import(gp);
const score = (await WebAssembly.instantiate(Buffer.from(S.WASM_B64, 'base64'))).instance.exports;
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const st = { jazz: { down: 0, ct: 0 }, electronica: { down: 0, ct: 0 } }; let bad = { jazz: 0, electronica: 0 }, approach = 0, approachOk = 0, rootOk = 0, roots = 0, bassRange = 0;
for (let seed = 1; seed <= N; seed++) {
  const T = G.tuneFrom(score, seed);
  for (const style of ['jazz', 'electronica']) {
    const ev = G.arrange(style, T, seed);
    for (const e of ev) if (!(Number.isFinite(e.t) && e.t >= 0 && e.t < 32.6 && e.d > 0 && Number.isFinite(e.m) && e.m > 20 && e.m < 110 && e.g > 0)) bad[style]++;
    // the same melody: on each beat a melody note starts on, is it a chord tone of the chart?
    for (const n of T) if (n.at % 2 === 0) { st[style].down++; if (G.chordAt(style, n.at / 2).tones.some(iv => (G.chordAt(style, n.at / 2).root + iv) % 12 === n.m % 12)) st[style].ct++; }
    if (style === 'jazz') {
      const B = ev.filter(e => e.part === 'bass');
      for (let b = 0; b < 32; b++) { const ch = G.chordAt('jazz', b), m = B[b].m; if (m < 28 || m > 51) bassRange++;
        if (b === 0 || G.chordAt('jazz', b - 1) !== ch) { roots++; if (m % 12 === ch.root % 12) rootOk++; }
        if (b < 31 && G.chordAt('jazz', b + 1) !== ch) { approach++; if (Math.abs(B[b + 1].m - m) === 1) approachOk++; } }
    }
  }
}
ok(bad.jazz === 0 && bad.electronica === 0, `every event finite and in range over seeds 1..${N} (bad: ${bad.jazz}, ${bad.electronica})`);
ok(rootOk === roots, `jazz bass: every chord starts on its root (${rootOk} of ${roots})`);
ok(approachOk === approach, `jazz bass: the beat before each new chord is a half step from it (${approachOk} of ${approach})`);
ok(bassRange === 0, `jazz bass stays in E1..D#3 (${bassRange} outside)`);
ok(G.swingAt(1, 2) === 2 / 3 && G.swingAt(1, 1) === 0.5 && G.swingAt(4, 3) === 2, 'swing: r=2 puts the upbeat at 2/3 of the beat, r=1 is straight');
for (const s of ['jazz', 'electronica']) console.log(`${s}: melody notes starting on a beat that are chord tones: ${st[s].ct} of ${st[s].down} (${(100 * st[s].ct / st[s].down).toFixed(1)}%)`);
console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
