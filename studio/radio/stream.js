// stream.js — the radio's composer played: its bars into pfstream.wasm (the piano and the guitar,
// physically modelled), the guitar dressed in its body and a small room as in ../cycle/music.js, and
// the whole duo then sent into a hall whose share of the sound is the `air` dial. Pure: node, browser,
// worker.
//
// Unlike the colour cycle's stream, the bars here are not a fixed length: the tempo glides with the
// `pace` dial, so the composer keeps its own clock (seconds from the first bar) and each bar is
// composed just before the stream reaches it, which is what makes a dial heard within a bar.
//
//   const s = new RadioStream(wasmExports, { seed, sampleRate, body });
//   s.knobs = { light, energy, … };          // read at every bar
//   s.render(blocks) → { pcm (interleaved stereo), notes: [{ t, dur, midi, inst, v }], bars: [info…] }
import { Radio } from './composer.js';
import { NOTE_BYTES, PIANO_GAIN, GUITAR_GAIN, StereoConvolver, resample, convolveOnce, roomImpulse } from '../cycle/music.js';

export class RadioStream {
  constructor(X, { seed = 1, sampleRate = 44100, body }) {
    this.X = X; this.sr = sampleRate;
    this.radio = new Radio({ seed });
    this.knobs = {};
    X.ps_begin(sampleRate, PIANO_GAIN);
    this.B = X.ps_block();
    // the guitar's dress, as the colour cycle's
    const b = resample(body.x, body.rate, sampleRate);
    let e = 0; for (const v of b) e += v * v;
    const g = 1 / Math.sqrt(e || 1), bn = b.map((v) => v * g);
    const [rl, rr] = roomImpulse(0.5, 0.3, 0.25, sampleRate);
    this.conv = new StereoConvolver(convolveOnce(bn, rl), convolveOnce(bn, rr), this.B);
    // the hall: the same statistical room, long and dark, without its direct sound
    const [hl, hr] = roomImpulse(2.6, 1.1, 1, sampleRate), pre = Math.round(0.012 * sampleRate);
    hl.fill(0, 0, pre + 1); hr.fill(0, 0, pre + 1);
    this.hall = new StereoConvolver(hl, hr, this.B);
    this.wet = 0.2; this.env = 0.04; this.gain = 1; this.mono = new Float32Array(this.B);
    this.frame = 0; this.played = []; this.bars = [];
    this.nextAt = 0;                                     // seconds: where the next bar begins
  }

  /** Compose every bar that begins before second `until`, and hand its notes to the module. */
  #compose(until) {
    const R = this.radio, now = this.frame / this.sr;
    while (this.nextAt < until) {
      const bar = R.next(this.knobs);
      this.nextAt = bar.t + bar.sec;
      this.bars.push({ ...bar.info, t: bar.t, sec: bar.sec });
      const dv = new DataView(this.X.memory.buffer), ptr = this.X.ps_stage_ptr(), max = this.X.ps_stage_max();
      let k = 0;
      for (const x of bar.notes) {
        if (k >= max) { this.X.ps_push(k); k = 0; }
        const at = Math.max(now, x.at), p = ptr + k * NOTE_BYTES, s = at * this.sr;
        dv.setFloat64(p, Math.round(s), true); dv.setFloat64(p + 8, Math.round(s + Math.max(0.05, x.dur) * this.sr), true);
        dv.setFloat32(p + 16, x.midi, true); dv.setFloat32(p + 20, x.vel, true);
        dv.setInt32(p + 24, x.inst, true); dv.setInt32(p + 28, x.string || 0, true); dv.setInt32(p + 32, x.art || 0, true); dv.setFloat32(p + 36, x.ap || 0, true);
        k++;
        this.played.push({ t: at, dur: x.dur, midi: x.midi, inst: x.inst, v: x.inst ? x.vel / 220 : x.vel });
      }
      if (k) this.X.ps_push(k);
    }
  }

  /** Render `blocks` blocks: interleaved stereo, the notes struck in them, the bars begun in them. */
  render(blocks = 11) {
    const B = this.B, out = new Float32Array(blocks * B * 2), sr = this.sr;
    for (let k = 0; k < blocks; k++) {
      this.#compose((this.frame + B) / sr + 0.06);
      this.X.ps_render(B);
      const piano = new Float32Array(this.X.memory.buffer, this.X.ps_piano_ptr(), B * 2);
      const gtr = new Float32Array(this.X.memory.buffer, this.X.ps_guitar_ptr(), B);
      const o = k * B;
      for (let i = 0; i < B; i++) { out[(o + i) * 2] = piano[i * 2]; out[(o + i) * 2 + 1] = piano[i * 2 + 1] * 0.82; }
      this.conv.process(gtr, out, o, GUITAR_GAIN * 0.8, GUITAR_GAIN);
      // the hall, fed the duo's middle; its share glides toward the air dial's
      const want = 0.06 + 0.5 * (this.knobs.air ?? 0.5);
      this.wet += (want - this.wet) * 0.15;
      for (let i = 0; i < B; i++) this.mono[i] = (out[(o + i) * 2] + out[(o + i) * 2 + 1]) * 0.5;
      this.hall.process(this.mono, out, o, this.wet * 0.9, this.wet);
      // a slow leveller: a lullaby is quieter than a feria, but not by fifteen decibels
      let e = 0; for (let i = o * 2; i < (o + B) * 2; i++) e += out[i] * out[i];
      this.env += (Math.sqrt(e / (2 * B)) - this.env) * 0.03;
      const g1 = Math.min(2.6, Math.max(0.7, 0.06 / Math.max(this.env, 1e-4))), g0 = this.gain;
      this.gain += (g1 - this.gain) * 0.05;
      for (let i = 0; i < B; i++) { const gg = g0 + (this.gain - g0) * (i / B); out[(o + i) * 2] *= gg; out[(o + i) * 2 + 1] *= gg; }
      this.frame += B;
    }
    for (let i = 0; i < out.length; i++) { const v = out[i]; out[i] = Math.abs(v) < 0.6 ? v : Math.sign(v) * (0.6 + 0.4 * Math.tanh((Math.abs(v) - 0.6) / 0.4)); }
    const now = this.frame / sr;
    const notes = this.played.filter((x) => x.t < now), bars = this.bars.filter((x) => x.t < now);
    this.played = this.played.filter((x) => x.t >= now); this.bars = this.bars.filter((x) => x.t >= now);
    return { pcm: out, notes, bars };
  }
}
