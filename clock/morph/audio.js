// audio.js — the sonification. Two layers, driven by the same wasm the picture
// is drawn from.
//
//   plucks — one note per cell created, pitched by how deep in the recursion it
//     was born and how wide the bus it was a lane of. Early on the structure is
//     sparse and you hear individual divisions; as it fills in they run
//     together into a texture. This is the layer that makes growth audible.
//
//   drone — a held chord underneath, whose upper partials fade in as the graph
//     gets denser and whose filter closes as the layout stops moving. It is the
//     state of the structure rather than its events: you can hear a piece
//     settle with your eyes shut.
//
// Everything is pentatonic. A burst can start forty notes inside a second and
// any interval that can clash, will — a scale with no minor seconds is what
// keeps a dense moment sounding like a chord instead of a cluster.
//
// The AudioContext is only ever created from a user gesture; browsers refuse
// otherwise, and an autoplaying drone would be obnoxious regardless.

/** Minor pentatonic, in semitones. No semitone clashes at any density. */
const SCALE = [0, 3, 5, 7, 10];
const ROOT = 55; // A1

/** Concurrent pluck voices. Past this, new events are counted, not played. */
const MAX_VOICES = 24;
/** Notes started per frame; the rest of a burst is dropped. */
const MAX_PER_FRAME = 6;

/** Procedural impulse response — cheap, and no asset to ship. */
function makeReverb(ctx, seconds = 3.2, decay = 2.6) {
  const rate = ctx.sampleRate;
  const n = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, n, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      // Noise under an exponential envelope. The early part is thinned so the
      // tail blooms rather than slapping.
      const t = i / n;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * Math.min(1, t * 12);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

export class Sonifier {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.voices = 0;
    this._volume = 0.6;
    /** Events seen but not played, for the HUD. */
    this.dropped = 0;
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Must be called from a user gesture. Idempotent. */
  async start() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio is not available');
      const ctx = new AC();
      this.ctx = ctx;

      this.master = ctx.createGain();
      this.master.gain.value = 0;

      // A compressor rather than careful per-voice gain staging: bursts are
      // genuinely unpredictable in size, and this is the only thing that keeps
      // a thousand-gate expansion from clipping.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;

      this.reverb = makeReverb(ctx);
      this.wet = ctx.createGain();
      this.wet.gain.value = 0.42;

      this.master.connect(comp);
      comp.connect(ctx.destination);
      comp.connect(this.reverb);
      this.reverb.connect(this.wet);
      this.wet.connect(ctx.destination);

      // Plucks run through their own filter so the drone's movement does not
      // swallow their attack.
      this.pluckBus = ctx.createGain();
      this.pluckBus.gain.value = 0.55;
      this.pluckBus.connect(this.master);

      this._buildDrone();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.enabled = true;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.6);
  }

  /** Fade out and suspend; the graph keeps growing silently. */
  stop() {
    if (!this.ctx) return;
    this.enabled = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
  }

  set volume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.enabled) {
      this.master.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.1);
    }
  }

  get volume() {
    return this._volume;
  }

  _buildDrone() {
    const ctx = this.ctx;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;

    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 300;
    this.droneFilter.Q.value = 0.7;

    this.droneGain.connect(this.droneFilter);
    this.droneFilter.connect(this.master);

    // Root, fifth, octave, twelfth, double octave. The higher the partial, the
    // later it arrives as the graph thickens.
    this.partials = [1, 1.5, 2, 3, 4].map((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = i < 2 ? 'sawtooth' : 'sine';
      osc.frequency.value = ROOT * ratio;
      // A slow, per-partial detune keeps the chord from sounding synthetic.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.03 + i * 0.017;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 2 + i;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);

      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(this.droneGain);
      osc.start();
      lfo.start();
      return { osc, gain: g, ratio };
    });
  }

  /**
   * One frame of sound.
   *
   * `events` is the raw wasm buffer (stride 4: gate, depth, width, cell) and
   * `stats` the stat block. Both are read, neither is retained.
   */
  update(events, count, stats, eventsSeen) {
    if (!this.running || !this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    this._updateDrone(stats, now);

    const budget = Math.min(count, MAX_PER_FRAME, MAX_VOICES - this.voices);
    this.dropped += Math.max(0, (eventsSeen || count) - Math.max(0, budget));
    if (budget <= 0) return;

    // Spread the frame's notes over ~a frame. Firing them at one instant reads
    // as a single click; a few milliseconds apart and a burst arpeggiates.
    const stride = count > 1 ? Math.min(0.014, 0.05 / count) : 0;
    // Take an even spread across the burst rather than its first few, so a wide
    // expansion sounds like the whole of itself.
    const pick = count / budget;
    for (let i = 0; i < budget; i++) {
      const e = Math.floor(i * pick) * 4;
      this._pluck(events[e], events[e + 1], events[e + 2], now + i * stride);
    }
  }

  _updateDrone(stats, now) {
    const cells = stats[0];
    const meanDegree = stats[5];
    const energy = stats[4];
    const grown = stats[7];

    // Density on a log scale: the drone should keep opening up between a
    // hundred cells and ten thousand, not saturate at the first hundred.
    const density = Math.min(1, Math.log10(1 + cells) / 4);
    const tau = 0.5;

    this.droneGain.gain.setTargetAtTime(0.1 + 0.28 * density, now, tau);

    for (let i = 0; i < this.partials.length; i++) {
      // Each partial waits its turn: the fifth is in from the start, the double
      // octave only once the structure is genuinely dense.
      const threshold = i * 0.22;
      const amount = Math.max(0, Math.min(1, (density - threshold) / 0.3));
      const connectivity = Math.min(1, meanDegree / 4);
      const g = (i === 0 ? 0.5 : 0.34 / i) * amount * (0.55 + 0.45 * connectivity);
      this.partials[i].gain.gain.setTargetAtTime(g, now, tau);
    }

    // The filter is the "is it still moving" signal: wide open while the layout
    // is churning, closing as it settles, and closing further once there is
    // nothing left to grow.
    const motion = Math.min(1, Math.sqrt(Math.max(0, energy)) / 6);
    const cutoff = 180 + 2600 * motion * (grown > 0.5 ? 0.45 : 1);
    this.droneFilter.frequency.setTargetAtTime(cutoff, now, 0.35);
  }

  /**
   * One cell, one note. `gate` is the gate index or -1 for a bud, `depth` the
   * recursion depth it was born at, `width` the bus width of the moment.
   */
  _pluck(gate, depth, width, at) {
    const ctx = this.ctx;

    // Deeper recursion is finer detail, so it rings higher. A wide bus is a big
    // structural moment, so it pulls back down an octave and hits harder.
    const wide = Math.min(1, Math.log2(1 + Math.max(1, width)) / 6);
    const step = Math.max(0, Math.round(depth)) - Math.round(wide * 7);
    const oct = 2 + Math.floor(((step % 25) + 25) / 5) % 4;
    const degree = SCALE[((step % SCALE.length) + SCALE.length) % SCALE.length];
    const freq = ROOT * Math.pow(2, oct + degree / 12);
    if (!Number.isFinite(freq) || freq < 20 || freq > 12000) return;

    const bud = gate < 0;
    const decay = bud ? 2.4 : 0.5 + 1.4 / (1 + oct * 0.6);
    const peak = (bud ? 0.1 : 0.13) * (0.6 + 0.4 * wide);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);

    // A body tone plus a quiet partial. Buds — cells that have not divided yet
    // — get a softer, longer voice, so a pending division sounds unresolved.
    const tone = ctx.createOscillator();
    tone.type = bud ? 'sine' : 'triangle';
    tone.frequency.value = freq;

    const partial = ctx.createGain();
    partial.gain.value = bud ? 0.1 : 0.22 + 0.2 * (1 - wide);
    const upper = ctx.createOscillator();
    upper.type = 'sine';
    // Gate index picks the partial, so different gates have different colours
    // without needing a separate instrument each.
    upper.frequency.value = freq * (bud ? 3 : 2 + (Math.max(0, gate) % 3));
    upper.detune.value = 4;

    tone.connect(g);
    upper.connect(partial);
    partial.connect(g);
    g.connect(this.pluckBus);

    tone.start(at);
    upper.start(at);
    tone.stop(at + decay + 0.05);
    upper.stop(at + decay + 0.05);

    this.voices++;
    tone.onended = () => {
      this.voices--;
      g.disconnect();
      partial.disconnect();
    };
  }
}
