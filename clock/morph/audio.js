// audio.js — the sonification. The circuit is the instrument.
//
// Nothing here invents rhythm. Pulses are injected at the gates that read the
// primary inputs and propagate through the wires one level per tick; a gate
// that fires plays a note. So the *score is the topology*: what you hear is a
// wavefront moving through the structure, and the structure decides when each
// note lands.
//
// That is why two circuits doing the same arithmetic do not sound alike. A
// 32-bit ripple adder has a carry chain 32 gates deep, so a pulse crosses it as
// a long descending arpeggio. A Brent–Kung adder computes the same sum in 11
// levels and lands almost as a chord. The triangle fires a whole row at once
// and sweeps; the medusa's branches ring out along each arm at their own rate.
//
// Three layers:
//
//   plucks — one per gate firing. Pitch from the gate's depth from the inputs,
//     so a wavefront descending through the circuit sweeps in pitch. Timbre
//     from which gate it is; velocity from fanout, so the gates that are about
//     to wake up a lot of the structure hit hardest.
//
//   grace notes — one per cell *created*. Quiet, short, high, and only while
//     something is still growing. Structure being built, under structure
//     running.
//
//   drone — the held chord underneath. Partials fade in as the graph gets
//     denser; the filter opens with how much of it is currently lit and closes
//     as the layout settles.
//
// Everything is pentatonic. A wavefront can fire four hundred gates on one tick
// and any interval that can clash, will; a scale with no minor seconds is what
// keeps a dense moment sounding like a chord instead of a cluster.
//
// The AudioContext is only ever created from a user gesture — browsers refuse
// otherwise, and an autoplaying drone would be obnoxious regardless.

const EVENT_STRIDE = 5; // kind gate depth weight cell
const KIND_FIRE = 0;

/** Minor pentatonic, in semitones. No semitone clashes at any density. */
const SCALE = [0, 3, 5, 7, 10];
const ROOT = 55; // A1

/** Concurrent pluck voices. Past this, firings are counted, not played. */
const MAX_VOICES = 28;
/** Notes started per frame; the rest of a wavefront is dropped. */
const MAX_PER_FRAME = 7;

/** Procedural impulse response — cheap, and no asset to ship. */
function makeReverb(ctx, seconds = 3.4, decay = 2.6) {
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
    /** Firings seen but not played, for the HUD. */
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

      // A compressor rather than careful per-voice gain staging: a wavefront's
      // size is genuinely unpredictable, and this is the only thing that keeps
      // a wide level of a big structure from clipping.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;

      this.reverb = makeReverb(ctx);
      this.wet = ctx.createGain();
      this.wet.gain.value = 0.45;

      this.master.connect(comp);
      comp.connect(ctx.destination);
      comp.connect(this.reverb);
      this.reverb.connect(this.wet);
      this.wet.connect(ctx.destination);

      // Plucks run through their own bus so the drone's movement does not
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

  /** Fade out and suspend; the circuit keeps running silently. */
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
   * `events` is the raw wasm buffer and `stats` the stat block; both are read,
   * neither is retained. `maxDepth` normalises pitch so a shallow circuit uses
   * the same range as a deep one instead of hugging one end of the scale.
   */
  update(events, count, stats, eventsSeen) {
    if (!this.running || !this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    this._updateDrone(stats, now);

    const budget = Math.min(count, MAX_PER_FRAME, MAX_VOICES - this.voices);
    this.dropped += Math.max(0, (eventsSeen || count) - Math.max(0, budget));
    if (budget <= 0) return;

    const maxDepth = Math.max(1, stats[6]);
    // Spread the frame's notes over about a frame. Fired at one instant a
    // wavefront reads as a single click; a few milliseconds apart and it
    // arpeggiates in the order the signal actually travelled.
    const stride = count > 1 ? Math.min(0.013, 0.05 / count) : 0;
    // An even spread across the burst rather than its first few, so a wide
    // level sounds like the whole of itself.
    const pick = count / budget;
    for (let i = 0; i < budget; i++) {
      const o = Math.floor(i * pick) * EVENT_STRIDE;
      const at = now + i * stride;
      if (events[o] === KIND_FIRE) {
        this._pluck(events[o + 1], events[o + 2], events[o + 3], maxDepth, at);
      } else {
        this._grace(events[o + 2], maxDepth, at);
      }
    }
  }

  _updateDrone(stats, now) {
    const cells = stats[0];
    const meanDegree = stats[5];
    const energy = stats[4];
    const grown = stats[7];
    const activity = stats[16];

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

    // The filter tracks two different kinds of movement: how much of the
    // structure is currently lit, and whether the layout is still churning.
    // Once grown and still, it closes right down and the piece goes to sleep.
    const lit = Math.min(1, Math.sqrt(Math.max(0, activity)) * 2.2);
    const motion = Math.min(1, Math.sqrt(Math.max(0, energy)) / 6);
    const cutoff = 180 + 3200 * Math.max(lit, motion * (grown > 0.5 ? 0.4 : 0.9));
    this.droneFilter.frequency.setTargetAtTime(cutoff, now, 0.3);
  }

  /**
   * A gate fired. `gate` is its index (or -1 for an unexpanded cell), `depth`
   * its distance from the inputs, `fanout` how many cells it drives.
   */
  _pluck(gate, depth, fanout, maxDepth, at) {
    const ctx = this.ctx;

    // Pitch rises with depth, normalised so a 5-deep circuit and a 78-deep one
    // both use the whole range. A wavefront descending the structure therefore
    // sweeps upward, and you can hear where in the circuit it currently is.
    const t = Math.min(1, Math.max(0, depth / maxDepth));
    const step = Math.round(t * 14);
    const oct = 2 + Math.floor(step / SCALE.length);
    const degree = SCALE[step % SCALE.length];
    const freq = ROOT * Math.pow(2, oct + degree / 12);
    if (!Number.isFinite(freq) || freq < 20 || freq > 12000) return;

    // A gate driving a lot of the structure is about to wake much of it up, so
    // it gets the weight of that.
    const spread = Math.min(1, Math.log2(1 + Math.max(0, fanout)) / 4);
    const decay = 0.45 + 1.5 / (1 + oct * 0.55);
    const peak = 0.09 + 0.075 * spread;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);

    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.value = freq;

    const partial = ctx.createGain();
    partial.gain.value = 0.18 + 0.22 * spread;
    const upper = ctx.createOscillator();
    upper.type = 'sine';
    // Which gate fired picks the partial, so XOR and MAJ have different
    // colours without needing a separate instrument each.
    upper.frequency.value = freq * (2 + (Math.max(0, gate) % 3));
    upper.detune.value = 4;

    tone.connect(g);
    upper.connect(partial);
    partial.connect(g);
    g.connect(this.pluckBus);

    this._play(g, [tone, upper], at, decay, [partial]);
  }

  /** A cell was created. Deliberately slight — growth is the undercurrent. */
  _grace(depth, maxDepth, at) {
    const ctx = this.ctx;
    const t = Math.min(1, Math.max(0, depth / maxDepth));
    const step = Math.round(t * 9);
    const degree = SCALE[step % SCALE.length];
    const freq = ROOT * Math.pow(2, 5 + Math.floor(step / SCALE.length) + degree / 12);
    if (!Number.isFinite(freq) || freq > 12000) return;

    const decay = 0.22;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.028, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);

    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = freq;
    tone.connect(g);
    g.connect(this.pluckBus);

    this._play(g, [tone], at, decay);
  }

  /** Start, stop and tear down a voice, keeping the voice count honest. */
  _play(gain, oscs, at, decay, extra = []) {
    for (const o of oscs) {
      o.start(at);
      o.stop(at + decay + 0.05);
    }
    this.voices++;
    oscs[0].onended = () => {
      this.voices--;
      gain.disconnect();
      for (const n of extra) n.disconnect();
    };
  }
}
