// music.js — the endless duo: compose.js's notes into pfstream.wasm (the piano and the guitar,
// streaming), the guitar dressed in its body and a room as it streams. Pure: node, browser, worker.
//
// The piano comes out of the module finished (soundboard, room, tanh: clef's chain). The guitar
// comes out as bridge force, mono, and is dressed here the way clef's pfguitar.js dresses it
// (the measured Contreras body, unit energy, then upstream's statistical room), but in blocks:
// the body and the room are folded into one impulse per ear, and applied by uniformly
// partitioned overlap-save convolution, so a guitar note rings on through every block after it.
//
//   const m = new Music(wasmExports, { seed, biome, bpm, sampleRate, body, t0 });
//   m.cond = (sceneSeconds) => ({ el, rising, night, cover, moon, place?, density });
//   m.render(frames) → { pcm: Float32Array (interleaved stereo), notes: [{ t, midi, inst }] }
//
// Scene seconds are the palette's clock: bar n of the music begins at n bars of it, so the music
// and the turning palette keep one beat. Stream frame 0 is scene second `t0`.
import { Composer } from './compose.js';

const NOTE_BYTES = 40;
const PIANO_GAIN = 110;            // upstream's makeup gain, as clef
export const GUITAR_GAIN = 2.4;     // the dressed guitar against the piano (calibrated in the selftest)

/** A WAV's samples (32-bit float or 16-bit), as clef's parseWav. */
export function parseWav(buf) {
  const dv = new DataView(buf);
  let p = 12, fmt = 3, bits = 32, rate = 44100;
  while (p + 8 <= buf.byteLength) {
    const id = String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3)), size = dv.getUint32(p + 4, true);
    if (id === 'fmt ') { fmt = dv.getUint16(p + 8, true); rate = dv.getUint32(p + 12, true); bits = dv.getUint16(p + 22, true); }
    if (id === 'data') {
      const n = size / (bits / 8), x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = fmt === 3 ? dv.getFloat32(p + 8 + i * 4, true) : dv.getInt16(p + 8 + i * 2, true) / 32768;
      return { x, rate };
    }
    p += 8 + size + (size & 1);
  }
  throw new Error('guitar body: no audio in the file');
}

/** Windowed-sinc resampling (Lanczos-8), as clef's pfguitar.js. */
function resample(x, from, to) {
  if (from === to) return x;
  const ratio = to / from, n = Math.max(1, Math.round(x.length * ratio)), out = new Float32Array(n);
  const cut = Math.min(1, ratio), A = 8, half = Math.ceil(A / cut);
  const sinc = (t) => (t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t));
  for (let i = 0; i < n; i++) {
    const c = i / ratio, k0 = Math.floor(c) - half, k1 = Math.floor(c) + half;
    let acc = 0;
    for (let k = Math.max(0, k0); k <= Math.min(x.length - 1, k1); k++) { const t = (c - k) * cut; if (Math.abs(t) < A) acc += x[k] * cut * sinc(t) * sinc(t / A); }
    out[i] = acc;
  }
  return out;
}

/** Upstream pfsynth's statistical room (docs/guitar/guitar.js, via clef's pfguitar.js), stereo. */
function roomImpulse(rtLow, rtHigh, ratio, sr) {
  const rt = (f) => Math.exp(Math.log(rtLow) + (Math.log(rtHigh) - Math.log(rtLow)) * (Math.log(f) - Math.log(200)) / (Math.log(4000) - Math.log(200)));
  const n = Math.round(1.3 * Math.max(rtLow, rtHigh) * sr), pre = Math.round(.012 * sr), chans = [new Float32Array(n + pre), new Float32Array(n + pre)];
  const edges = [44, 88, 177, 355, 710, 1420, 2840, 5680, 11360, 20000];
  for (let ch = 0; ch < 2; ch++) {
    const out = chans[ch]; out[0] = 1; let seed = 1 + ch * 7919;
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };
    for (let b = 0; b + 1 < edges.length; b++) {
      const lo = edges[b], hi = Math.min(edges[b + 1], sr * .49);
      if (hi <= lo * 1.05) continue;
      const fc = Math.sqrt(lo * hi), q = fc / (hi - lo), w = 2 * Math.PI * fc / sr, al = Math.sin(w) / (2 * q);
      const b0 = al / (1 + al), b2 = -b0, a1 = -2 * Math.cos(w) / (1 + al), a2 = (1 - al) / (1 + al), T = rt(fc), band = new Float32Array(n);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, v1 = 0, v2 = 0;
      for (let i = 0; i < n; i++) {
        const x = rand(); let y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y;
        const z = b0 * y + b2 * u2 - a1 * v1 - a2 * v2; u2 = u1; u1 = y; v2 = v1; v1 = z;
        band[i] = z * Math.exp(-6.9078 * i / sr / T);
      }
      let e = 0; for (const v of band) e += v * v; const g = Math.sqrt(ratio * 2 * (hi - lo) / sr / (e || 1));
      for (let i = 0; i < n; i++) out[pre + i] += g * band[i];
    }
  }
  return chans;
}

/** In-place radix-2 FFT (inverse when `inv`), as clef's. */
function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const a = i + k, b = a + h, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/** Plain (non-streaming) convolution, for folding the body into the room once. */
function convolveOnce(x, h) {
  const n = x.length + h.length - 1; let N = 1; while (N < n) N <<= 1;
  const ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N);
  ar.set(x); br.set(h); fft(ar, ai, false); fft(br, bi, false);
  for (let k = 0; k < N; k++) { const r = ar[k] * br[k] - ai[k] * bi[k], i = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = r; ai[k] = i; }
  fft(ar, ai, true);
  return Float32Array.from(ar.subarray(0, n));
}

/**
 * Uniformly partitioned overlap-save convolution of a mono stream with a stereo impulse, block by
 * block. Both ears ride one inverse FFT (left real, right imaginary: the outputs are real).
 */
export class StereoConvolver {
  constructor(hl, hr, B) {
    this.B = B; this.N = 2 * B;
    this.K = Math.ceil(Math.max(hl.length, hr.length) / B);
    this.H = [];
    for (let k = 0; k < this.K; k++) {
      const lr = new Float64Array(this.N), li = new Float64Array(this.N), rr = new Float64Array(this.N), ri = new Float64Array(this.N);
      lr.set(hl.subarray(k * B, Math.min(hl.length, (k + 1) * B))); rr.set(hr.subarray(k * B, Math.min(hr.length, (k + 1) * B)));
      fft(lr, li, false); fft(rr, ri, false);
      this.H.push([lr, li, rr, ri]);
    }
    this.X = Array.from({ length: this.K }, () => [new Float64Array(this.N), new Float64Array(this.N)]);
    this.head = 0; this.prev = new Float64Array(B);
    this.re = new Float64Array(this.N); this.im = new Float64Array(this.N);
  }
  /** One block of B mono samples in; B stereo frames added into `out` (interleaved) at `at`. */
  process(x, out, at = 0, gl = 1, gr = 1) {
    const { B, N, K } = this;
    const slot = this.X[this.head], xr = slot[0], xi = slot[1];
    xr.set(this.prev); for (let i = 0; i < B; i++) xr[B + i] = x[i]; xi.fill(0);
    for (let i = 0; i < B; i++) this.prev[i] = x[i];
    fft(xr, xi, false);
    const re = this.re, im = this.im; re.fill(0); im.fill(0);
    for (let k = 0; k < K; k++) {
      const [ar, ai] = this.X[(this.head - k + K) % K], [lr, li, rr, ri] = this.H[k];
      for (let j = 0; j < N; j++) {
        const a = ar[j], b = ai[j];
        const yl_r = a * lr[j] - b * li[j], yl_i = a * li[j] + b * lr[j];
        const yr_r = a * rr[j] - b * ri[j], yr_i = a * ri[j] + b * rr[j];
        re[j] += yl_r - yr_i; im[j] += yl_i + yr_r;          // L + i·R
      }
    }
    this.head = (this.head + 1) % K;
    fft(re, im, true);
    for (let i = 0; i < B; i++) { out[(at + i) * 2] += re[B + i] * gl; out[(at + i) * 2 + 1] += im[B + i] * gr; }
  }
}

export class Music {
  constructor(X, { seed, biome, bpm, sampleRate, body, t0 = 0, surf = null }) {
    this.X = X; this.sr = sampleRate; this.t0 = t0;
    this.composer = new Composer({ seed, biome, bpm, surf });
    this.nextBar = Math.floor(t0 / this.composer.barSec);
    this.cond = () => ({ el: 0.5, rising: true, night: 0, cover: 0.3, moon: 0.5, density: 1 });
    X.ps_begin(sampleRate, PIANO_GAIN);
    this.B = X.ps_block();
    // the guitar's dress: the body (unit energy) folded into upstream's room, one impulse per ear
    const b = resample(body.x, body.rate, sampleRate);
    let e = 0; for (const v of b) e += v * v;
    const g = 1 / Math.sqrt(e || 1), bn = b.map((v) => v * g);
    const [rl, rr] = roomImpulse(0.5, 0.3, 0.25, sampleRate);
    this.conv = new StereoConvolver(convolveOnce(bn, rl), convolveOnce(bn, rr), this.B);
    this.frame = 0; this.played = [];
  }

  /** Compose every bar that begins before scene second `until`, and hand its notes to the module. */
  #compose(until) {
    const C = this.composer;
    while (this.nextBar * C.barSec < until) {
      const n = this.nextBar++, cond = this.cond(n * C.barSec);
      const notes = C.bar(n, cond).filter((x) => x.at >= this.t0);
      const dv = new DataView(this.X.memory.buffer), ptr = this.X.ps_stage_ptr();
      let k = 0;
      for (const x of notes) {
        if (k >= this.X.ps_stage_max()) break;
        const p = ptr + k * NOTE_BYTES, s = (x.at - this.t0) * this.sr;
        dv.setFloat64(p, Math.round(s), true); dv.setFloat64(p + 8, Math.round(s + Math.max(0.05, x.dur) * this.sr), true);
        dv.setFloat32(p + 16, x.midi, true); dv.setFloat32(p + 20, x.vel, true);
        dv.setInt32(p + 24, x.inst, true); dv.setInt32(p + 28, x.string || 0, true); dv.setInt32(p + 32, x.art || 0, true); dv.setFloat32(p + 36, x.ap || 0, true);
        k++;
        this.played.push({ t: x.at, midi: x.midi, inst: x.inst });
      }
      if (k) this.X.ps_push(k);
    }
  }

  /** Render `blocks` blocks: interleaved stereo, and the notes struck in them (scene seconds). */
  render(blocks = 12) {
    const B = this.B, out = new Float32Array(blocks * B * 2);
    const lookahead = 2 * this.composer.barSec;
    for (let k = 0; k < blocks; k++) {
      this.#compose(this.t0 + (this.frame + B) / this.sr + lookahead);
      this.X.ps_render(B);
      const piano = new Float32Array(this.X.memory.buffer, this.X.ps_piano_ptr(), B * 2);
      const gtr = new Float32Array(this.X.memory.buffer, this.X.ps_guitar_ptr(), B);
      // the piano a little left, the guitar a little right, as Duende's duo
      for (let i = 0; i < B; i++) { out[(k * B + i) * 2] = piano[i * 2]; out[(k * B + i) * 2 + 1] = piano[i * 2 + 1] * 0.82; }
      this.conv.process(gtr, out, k * B, GUITAR_GAIN * 0.8, GUITAR_GAIN);
      this.frame += B;
    }
    // a gentle ceiling over the sum
    for (let i = 0; i < out.length; i++) { const v = out[i]; out[i] = Math.abs(v) < 0.6 ? v : Math.sign(v) * (0.6 + 0.4 * Math.tanh((Math.abs(v) - 0.6) / 0.4)); }
    const now = this.t0 + this.frame / this.sr;
    const notes = this.played.filter((x) => x.t < now);
    this.played = this.played.filter((x) => x.t >= now);
    return { pcm: out, notes, describe: this.composer.describe() };
  }
}
