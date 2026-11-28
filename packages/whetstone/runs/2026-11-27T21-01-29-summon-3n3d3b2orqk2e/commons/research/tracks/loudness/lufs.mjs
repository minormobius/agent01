// BS.1770-4 integrated loudness (K-weighting, 400 ms blocks, 75% overlap, -70 abs / -10 rel gates).
// Coefficients computed per sample rate the libebur128 way. Sample peak, not true peak.
// Usage: node lufs.mjs a.wav b.wav ...   |   node lufs.mjs --selftest
import { readFileSync } from 'node:fs';

function readWav(path) {
  const b = readFileSync(path);
  let p = 12, fmt, data;
  while (p < b.length - 8) {
    const id = b.toString('ascii', p, p + 4), n = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(p + 8), ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') data = b.subarray(p + 8, p + 8 + n);
    p += 8 + n + (n & 1);
  }
  const { ch, sr, bits, tag } = fmt, bps = bits / 8, frames = Math.floor(data.length / (bps * ch));
  const chans = Array.from({ length: ch }, () => new Float64Array(frames));
  for (let i = 0; i < frames; i++) for (let c = 0; c < ch; c++) {
    const o = (i * ch + c) * bps;
    let v;
    if (tag === 3 && bits === 32) v = data.readFloatLE(o);
    else if (bits === 16) v = data.readInt16LE(o) / 32768;
    else if (bits === 24) v = data.readIntLE(o, 3) / 8388608;
    else v = data.readInt32LE(o) / 2147483648;
    chans[c][i] = v;
  }
  return { sr, ch, bits, chans, frames };
}

function kCoefs(sr) {
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan(Math.PI * f0 / sr), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const s1 = { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
  f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan(Math.PI * f0 / sr);
  a0 = 1 + K / Q + K * K;
  const s2 = { b: [1, -2, 1], a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
  return [s1, s2];
}

function biquad(x, { b, a }) {
  const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}

const L = e => -0.691 + 10 * Math.log10(e);

function integrated(kw, sr, frames) {
  const blk = Math.round(0.4 * sr), hop = Math.round(0.1 * sr), z = [];
  for (let s = 0; s + blk <= frames; s += hop) {
    let sum = 0; for (const c of kw) { let e = 0; for (let i = s; i < s + blk; i++) e += c[i] * c[i]; sum += e / blk; }
    z.push(sum);
  }
  const abs = z.filter(e => L(e) > -70);
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const g = abs.filter(e => L(e) > rel);
  return L(g.reduce((a, b) => a + b, 0) / g.length);
}

function measure(path) {
  const w = readWav(path), [s1, s2] = kCoefs(w.sr);
  let peak = 0;
  const kw = w.chans.map(c => { for (const v of c) peak = Math.max(peak, Math.abs(v)); return biquad(biquad(c, s1), s2); });
  return { file: path.split('/').pop(), sr: w.sr, ch: w.ch, bits: w.bits, sec: +(w.frames / w.sr).toFixed(2), lufs: +integrated(kw, w.sr, w.frames).toFixed(2), peak_dbfs: +(20 * Math.log10(peak)).toFixed(2) };
}

if (process.argv[2] === '--selftest') {
  // EBU Tech 3341 style: 1 kHz sine, -20 dBFS peak, both channels of stereo -> about -20.0 LUFS (stereo sums +3, K-weight ~+0.69 at 1k... check vs -23 for -23 dBFS RMS stereo).
  // Reference: 997 Hz sine at amplitude A on L and R gives LUFS ≈ 20log10(A) - 3.01 + 3.01 + small K gain ≈ 20log10(A)+0.0.
  for (const sr of [44100, 48000]) {
    const n = sr * 10, A = Math.pow(10, -23 / 20) * Math.SQRT2 / Math.SQRT2; // -23 dBFS peak
    const x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = A * Math.sin(2 * Math.PI * 997 * i / sr);
    const [s1, s2] = kCoefs(sr), y = biquad(biquad(x, s1), s2);
    console.log(sr, 'stereo 997 Hz at -23 dBFS peak:', integrated([y, y], sr, n).toFixed(2), 'LUFS (expect -23.0 ± 0.1)');
  }
} else for (const f of process.argv.slice(2)) console.log(JSON.stringify(measure(f)));
