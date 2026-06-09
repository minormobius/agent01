// audio-react — turn any track or mic into a normalized stream of "perturbation"
// signals that a particle world can use to drive its forces & parameters.
//
// Importable, no deps, no build. The pure DSP (bandEnergies / rms / BeatDetector /
// AGC) is exported separately so it can be unit-tested without Web Audio.
//
//   import { AudioField } from '../packages/audio-react/audio.js';
//   const af = new AudioField();
//   await af.fromFile(file);            // BYO track  (returns the <audio> element)
//   await af.fromMic();                 // dance to the room
//   af.fromMediaElement(audioEl);       // import a /music player's <audio>
//   // each frame:
//   const s = af.read();                // {loudness,bass,mid,treble,beat,onset,spectrum} all 0..1
//
// The mechanic: loudness → temperature/agitation, spectrum → a spatial field,
// beats → impulse kicks. The host world maps these onto its own knobs.

// ── pure DSP (testable) ───────────────────────────────────────────────
// RMS loudness from time-domain bytes (Uint8 centred at 128).
export function rms(timeData) {
  let s = 0; const n = timeData.length;
  for (let i = 0; i < n; i++) { const v = (timeData[i] - 128) / 128; s += v * v; }
  return Math.sqrt(s / n);
}
// Average magnitude (0..255) in a frequency band, given byte FFT bins.
export function bandEnergy(freq, fLo, fHi, sampleRate, fftSize) {
  const binHz = sampleRate / fftSize;
  let lo = Math.max(1, Math.floor(fLo / binHz)), hi = Math.min(freq.length - 1, Math.ceil(fHi / binHz));
  if (hi < lo) hi = lo;
  let s = 0; for (let i = lo; i <= hi; i++) s += freq[i];
  return s / (hi - lo + 1);
}
export function bandEnergies(freq, sampleRate, fftSize) {
  return {
    bass:   bandEnergy(freq,   20,  250, sampleRate, fftSize),
    mid:    bandEnergy(freq,  250, 2000, sampleRate, fftSize),
    treble: bandEnergy(freq, 2000, 8000, sampleRate, fftSize),
  };
}
// Adaptive gain: normalize a positive signal into ~[0,1] by tracking a decaying max.
export function makeAGC(floor = 0.02, decay = 0.997) {
  let peak = floor;
  return {
    norm(v) { if (v > peak) peak = v; else peak = Math.max(floor, peak * decay);
      const x = v / peak; return x < 0 ? 0 : x > 1 ? 1 : x; },
    get peak() { return peak; },
  };
}
// Energy-based onset/beat detector on a single band (usually bass).
export class BeatDetector {
  constructor({ history = 43, sensitivity = 1.35, refractoryMs = 130, floor = 6 } = {}) {
    this.hist = []; this.cap = history; this.sens = sensitivity; this.refractory = refractoryMs; this.floor = floor; this.last = -1e9;
  }
  push(energy, now) {
    const h = this.hist; let avg = 0; for (const e of h) avg += e; avg = h.length ? avg / h.length : energy;
    h.push(energy); if (h.length > this.cap) h.shift();
    const onset = avg > 0 ? energy / avg : 1;
    let beat = false;
    if (energy > avg * this.sens && energy > this.floor && (now - this.last) > this.refractory) { beat = true; this.last = now; }
    return { beat, onset };
  }
}

// ── Web Audio wrapper ─────────────────────────────────────────────────
const ZERO = { loudness: 0, bass: 0, mid: 0, treble: 0, beat: false, onset: 1, spectrum: null };
export class AudioField {
  constructor({ fftSize = 2048, smoothing = 0.8, beat = {} } = {}) {
    this.fftSize = fftSize; this.smoothing = smoothing;
    this.ctx = null; this.analyser = null; this.src = null; this.el = null; this.stream = null; this.bufferSrc = null;
    this.freq = null; this.time = null; this.sampleRate = 44100;
    this.agc = { L: makeAGC(), bass: makeAGC(), mid: makeAGC(), treble: makeAGC() };
    this.beat = new BeatDetector(beat);
    this.source = 'none';
  }
  _ctx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = this.fftSize; this.analyser.smoothingTimeConstant = this.smoothing;
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.time = new Uint8Array(this.analyser.fftSize);
      this.sampleRate = this.ctx.sampleRate;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  _disconnect() { try { if (this.src) this.src.disconnect(); } catch {} this.src = null;
    if (this.bufferSrc) { try { this.bufferSrc.stop(); } catch {} try { this.bufferSrc.disconnect(); } catch {} this.bufferSrc = null; }
    if (this.stream) { try { this.stream.getTracks().forEach(t => t.stop()); } catch {} this.stream = null; }
    if (this.el) { try { this.el.pause(); } catch {} } }
  async fromFile(file) {
    this._ctx(); this._disconnect();
    const el = new Audio(); el.src = URL.createObjectURL(file); el.loop = true; el.crossOrigin = 'anonymous';
    this.src = this.ctx.createMediaElementSource(el);
    this.src.connect(this.analyser); this.analyser.connect(this.ctx.destination);   // hear it
    this.el = el; this.source = 'file'; await el.play().catch(() => {}); return el;
  }
  async fromURL(url) {
    this._ctx(); this._disconnect();
    const el = new Audio(); el.crossOrigin = 'anonymous'; el.src = url; el.loop = true;   // needs CORS-enabled audio to analyse
    this.src = this.ctx.createMediaElementSource(el);
    this.src.connect(this.analyser); this.analyser.connect(this.ctx.destination);
    this.el = el; this.source = 'url'; await el.play().catch(() => {}); return el;
  }
  fromMediaElement(el) {   // import a /music player's <audio>
    this._ctx(); this._disconnect();
    this.src = this.ctx.createMediaElementSource(el);
    this.src.connect(this.analyser); this.analyser.connect(this.ctx.destination);
    this.el = el; this.source = 'element'; return el;
  }
  // Gapless looping of a known buffer (a rendered /music track). loopEnd is the musical
  // bar length in seconds — looping there skips the silent release tail, so there's no
  // gap at the seam (unlike <audio loop>, which is never gapless).
  fromBuffer(buffer, { loop = true, loopStart = 0, loopEnd = 0 } = {}) {
    this._ctx(); this._disconnect();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer; src.loop = loop;
    if (loopEnd > 0) { src.loopStart = loopStart; src.loopEnd = loopEnd; }
    src.connect(this.analyser); this.analyser.connect(this.ctx.destination);
    this.bufferSrc = src; this.el = null; this.source = 'buffer';
    src.start();
    return src;
  }
  async fromMic() {
    this._ctx(); this._disconnect();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
    this.src = this.ctx.createMediaStreamSource(this.stream);
    this.src.connect(this.analyser);   // NOT to destination (feedback)
    this.source = 'mic'; return this.stream;
  }
  read(now) {
    if (!this.analyser) return ZERO;
    if (now == null) now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.analyser.getByteFrequencyData(this.freq);
    this.analyser.getByteTimeDomainData(this.time);
    const loud = rms(this.time);
    const be = bandEnergies(this.freq, this.sampleRate, this.fftSize);
    const { beat, onset } = this.beat.push(be.bass, now);
    return {
      loudness: this.agc.L.norm(loud),
      bass:     this.agc.bass.norm(be.bass),
      mid:      this.agc.mid.norm(be.mid),
      treble:   this.agc.treble.norm(be.treble),
      beat, onset, spectrum: this.freq,
    };
  }
  playing() {
    if (this.source === 'mic') return !!this.stream;
    if (this.source === 'buffer') return !!this.bufferSrc && !!this.ctx && this.ctx.state === 'running';
    return !!(this.el && !this.el.paused);
  }
  toggle() {
    if (this.source === 'buffer') { if (!this.ctx) return; this.ctx.state === 'running' ? this.ctx.suspend() : this.ctx.resume(); return; }
    if (this.el) { if (this.el.paused) this.el.play().catch(() => {}); else this.el.pause(); }
  }
  dispose() { this._disconnect(); try { if (this.ctx) this.ctx.close(); } catch {} this.ctx = null; this.analyser = null; }
}
