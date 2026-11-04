// node shelf/rack/pluck-probe.mjs <abs wasm.js> — the pluck across its range, from the page's bytes. Mozzie wrote it (10-13); Morphyx added loud, centroid and cut.
// loud: RMS of the first 300 ms. brightness: energy of the first difference over the signal's, first 100 ms
// (~0 for a pure low tone, ~2 for white noise). cut: the level when the voice is freed, as a fraction of its peak
// (a voice freed loud is a click). centroid: the energy-weighted mean harmonic number, first 100 ms (1 = a sine).
const bytes = Buffer.from((await import(process.argv[2])).WASM_B64, 'base64');
const W = (await WebAssembly.instantiate(bytes)).instance.exports; const SR = 48000;
const mem = () => new Float32Array(W.memory.buffer, W.out(), 128);
for (const [m, g] of [[36,0.22],[43,0.22],[48,0.30],[55,0.30],[60,0.30],[72,0.30],[83,0.30]]) {
  W.init(SR); const hz = 440 * 2 ** ((m - 69) / 12); W.note(1, hz, g, 0, Math.round(SR * 0.5));
  const buf = new Float32Array(SR * 0.1); let peak = 0, t60 = null, first = 0, hf = 0, tot = 0, rms = 0, prev = 0, last = 0, b = 0;
  for (; b < 6 * SR / 128 && W.active(); b++) {
    W.render(128); const o = mem(); let bp = 0;
    for (let i = 0; i < 128; i++) { const x = o[i], n = b * 128 + i; bp = Math.max(bp, Math.abs(x));
      if (n < SR * 0.1) { buf[n] = x; tot += x * x; hf += (x - prev) ** 2; } if (n < SR * 0.3) rms += x * x; prev = x; }
    if (b < 4) first = Math.max(first, bp); peak = Math.max(peak, bp); last = bp;
    if (t60 === null && b > 8 && bp < first / 1000) t60 = (b * 128 / SR).toFixed(2);
  }
  let num = 0, den = 0; for (let h = 1; h <= 30 && h * hz < SR / 2; h++) { let re = 0, im = 0; const w = 2 * Math.PI * h * hz / SR;
    for (let n = 0; n < buf.length; n++) { re += buf[n] * Math.cos(w * n); im += buf[n] * Math.sin(w * n); } const e = re * re + im * im; num += h * e; den += e; }
  console.log(`midi ${m} ${hz.toFixed(1).padStart(6)} Hz  peak ${peak.toFixed(3)}  loud ${Math.sqrt(rms / (SR * 0.3)).toFixed(3)}  brightness ${(hf / tot).toFixed(3)}  centroid h${(num / den).toFixed(2)}  -60dB ${t60 ?? 'never'}  cut at ${(last / peak).toFixed(3)} of peak, ${(b * 128 / SR).toFixed(2)} s`);
}
