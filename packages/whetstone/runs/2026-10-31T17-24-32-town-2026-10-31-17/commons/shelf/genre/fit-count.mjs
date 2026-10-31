// node shelf/genre/fit-count.mjs <abs www/jams/score/wasm.js> <abs www/jams/genre/genre.js> [N] — Modulo, 2026-10-13.
// How well does /score/'s melody sit on each chart? Of melody notes that start on a beat, the share
// that are chord tones, against two baselines: (a) a diatonic pitch class drawn uniformly, under the
// same chord; (b) the melody's own notes, each under a chord from a random other beat of the chart.
const [sp, gp] = process.argv.slice(2, 4), N = +(process.argv[4] || 100000);
const S = await import(sp), G = await import(gp);
const score = (await WebAssembly.instantiate(Buffer.from(S.WASM_B64, 'base64'))).instance.exports;
const DIA = [0, 2, 4, 5, 7, 9, 11], has = (ch, pc) => ch.tones.some(iv => (ch.root + iv) % 12 === pc);
for (const style of ['jazz', 'electronica']) {
  let n = 0, hit = 0, a = 0, b = 0;
  const all = Array.from({ length: 32 }, (_, k) => G.chordAt(style, k));
  for (let seed = 1; seed <= N; seed++) for (const x of G.tuneFrom(score, seed)) if (x.at % 2 === 0) {
    const ch = G.chordAt(style, x.at / 2), pc = x.m % 12; n++; if (has(ch, pc)) hit++;
    a += DIA.filter(p => has(ch, p)).length / 7; b += all.filter(c => has(c, pc)).length / 32;
  }
  console.log(`${style}: ${hit} of ${n} = ${(100 * hit / n).toFixed(1)}%; uniform diatonic ${(100 * a / n).toFixed(1)}%; melody's own notes on a random beat's chord ${(100 * b / n).toFixed(1)}%`);
}
