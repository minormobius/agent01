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
// Two instruments, both struck by the engine and nothing else:
//
//   plucks — one per gate firing. Pitch from the gate's depth from the inputs,
//     so a wavefront descending through the circuit sweeps in pitch. Timbre
//     from which gate it is; velocity from fanout, so the gates that are about
//     to wake up a lot of the structure hit hardest.
//
//   knells — one per cell *starved*. A low body with the pitch falling away
//     under it, dry and short. Growth and death are the same event seen from
//     two ends, so the knell is deliberately the bell upside down: downward
//     where the bell holds, damped where the bell rings.
//
//   bells — one per cell *formed*. Inharmonic partials on the tubular-bell
//     ratios, struck and left to ring, pitched by how deep in the lineage the
//     cell was born. Deliberately nothing like the plucks: formation and
//     conduction are different events and should not be different shades of
//     the same sound. Growth is a handful of seconds, so these are what the
//     opening is made of, and then they stop.
//
// There is no drone. A held pad flatters this material — it fills the gaps and
// papers over the structure — and the piece is better without one: what is left
// is only ever the graph doing something.
//
// Everything is pentatonic. A wavefront can fire four hundred gates on one tick
// and any interval that can clash, will; a scale with no minor seconds is what
// keeps a dense moment sounding like a chord instead of a cluster. The reverb
// is now the only thing holding the space together, so it is generous.
//
// The AudioContext is only ever created from a user gesture — browsers refuse
// otherwise, and autoplaying audio would be obnoxious regardless.

const EVENT_STRIDE = 5; // kind gate depth weight cell
const KIND_FIRE = 0;
const KIND_DIED = 2;

/** Minor pentatonic, in semitones. No semitone clashes at any density. */
const SCALE = [0, 3, 5, 7, 10];
const ROOT = 55; // A1

/**
 * Concurrent voices, **per instrument**. A single shared pool does not work:
 * conduction is relentless and growth is bursty, so the plucks hold every slot
 * and the bells never get one — the structure is silently added to while all
 * you hear is it conducting. Separate pools is the only arrangement where both
 * instruments are always audible.
 */
const MAX_PLUCK_VOICES = 24;
const MAX_BELL_VOICES = 8;
const MAX_KNELL_VOICES = 6;
/** Firings started per frame; the rest of a wavefront is dropped. */
const MAX_FIRES_PER_FRAME = 6;
/**
 * Bells started per frame. Much tighter than the firings: an expansion can
 * create hundreds of cells at once, and a bell rings for well over a second, so
 * without a hard cap the opening turns to porridge.
 */
const MAX_BELLS_PER_FRAME = 2;
/** Deaths played per frame. Turnover is relentless once it starts. */
const MAX_KNELLS_PER_FRAME = 2;

/**
 * Tubular-bell partial ratios, with their relative levels and how much faster
 * each decays than the fundamental. Inharmonic — that is the whole point, and
 * what makes a bell impossible to mistake for the triangle-wave plucks.
 */
const BELL_PARTIALS = [
  [1.0, 1.0, 1.0],
  [2.76, 0.42, 1.7],
  [5.4, 0.22, 2.6],
];

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
    /** Live voice count per instrument. See MAX_PLUCK_VOICES. */
    this.voices = { pluck: 0, bell: 0, knell: 0 };
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

      // With no pad underneath, the reverb is what stops the piece sounding
      // like isolated blips in a dead room, so it is longer and wetter than it
      // would otherwise want to be.
      this.reverb = makeReverb(ctx, 4.6);
      this.wet = ctx.createGain();
      this.wet.gain.value = 0.6;

      this.master.connect(comp);
      comp.connect(ctx.destination);
      comp.connect(this.reverb);
      this.reverb.connect(this.wet);
      this.wet.connect(ctx.destination);

      // One bus per instrument, so their balance is set in one place rather
      // than smeared across every voice's envelope.
      this.pluckBus = ctx.createGain();
      this.pluckBus.gain.value = 0.6;
      this.pluckBus.connect(this.master);

      this.bellBus = ctx.createGain();
      this.bellBus.gain.value = 0.5;
      this.bellBus.connect(this.master);

      // Deaths sit low and dry: a lowpass keeps them under the plucks rather
      // than competing with them, and they take much less reverb than
      // everything else so turnover does not turn to mud.
      this.knellBus = ctx.createGain();
      this.knellBus.gain.value = 0.42;
      const knellTone = ctx.createBiquadFilter();
      knellTone.type = 'lowpass';
      knellTone.frequency.value = 900;
      this.knellBus.connect(knellTone);
      knellTone.connect(this.master);
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

  /**
   * One frame of sound.
   *
   * `events` is the raw wasm buffer and `stats` the stat block; both are read,
   * neither is retained. `maxDepth` normalises pitch so a shallow circuit uses
   * the same range as a deep one instead of hugging one end of the scale.
   */
  update(events, count, stats, eventsSeen) {
    if (!this.running || !this.enabled) return;
    const now = this.ctx.currentTime;
    if (count <= 0) return;

    // The two instruments get separate budgets rather than competing for one.
    // Sharing a budget meant a wide wavefront could crowd out every bell in the
    // frame, so a burst of growth during heavy conduction went silent — exactly
    // when you most want to hear the structure being added to.
    const fires = [];
    const births = [];
    const deaths = [];
    for (let i = 0; i < count; i++) {
      const kind = events[i * EVENT_STRIDE];
      (kind === KIND_FIRE ? fires : kind === KIND_DIED ? deaths : births).push(i);
    }

    const nFires = Math.max(
      0,
      Math.min(fires.length, MAX_FIRES_PER_FRAME, MAX_PLUCK_VOICES - this.voices.pluck),
    );
    const nBells = Math.max(
      0,
      Math.min(births.length, MAX_BELLS_PER_FRAME, MAX_BELL_VOICES - this.voices.bell),
    );
    const nKnells = Math.max(
      0,
      Math.min(deaths.length, MAX_KNELLS_PER_FRAME, MAX_KNELL_VOICES - this.voices.knell),
    );
    this.dropped += Math.max(0, (eventsSeen || count) - nFires - nBells - nKnells);

    const maxDepth = Math.max(1, stats[6]);
    // Spread the frame's notes over about a frame. Struck at one instant a
    // wavefront reads as a single click; a few milliseconds apart and it
    // arpeggiates in the order the signal actually travelled.
    const stride = Math.min(0.013, 0.05 / Math.max(1, nFires));

    // An even spread across the burst rather than its first few, so a wide
    // level sounds like the whole of itself.
    for (let i = 0; i < nFires; i++) {
      const o = fires[Math.floor((i * fires.length) / nFires)] * EVENT_STRIDE;
      this._pluck(events[o + 1], events[o + 2], events[o + 3], maxDepth, now + i * stride);
    }
    for (let i = 0; i < nBells; i++) {
      const o = births[Math.floor((i * births.length) / nBells)] * EVENT_STRIDE;
      this._bell(events[o + 2], events[o + 3], now + i * 0.035);
    }
    for (let i = 0; i < nKnells; i++) {
      const o = deaths[Math.floor((i * deaths.length) / nKnells)] * EVENT_STRIDE;
      this._knell(events[o + 2], now + i * 0.045);
    }
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

    this._play('pluck', g, [tone, upper], at, decay, [partial]);
  }

  /**
   * A cell was formed. Struck bell: inharmonic partials on the tubular-bell
   * ratios, each higher one quieter and decaying faster, which is what gives a
   * bell its bright strike collapsing into a hum.
   *
   * `depth` is the cell's depth in the *lineage* — how many divisions deep its
   * ancestry runs — not its distance from the inputs. So a recursion descending
   * through the structure walks up the scale, and a cell's pitch says where in
   * the family tree it appeared. `width` is the bus it was a lane of: a wide
   * division is a bigger structural moment and is struck harder.
   */
  _bell(depth, width, at) {
    const ctx = this.ctx;

    // Modulo rather than normalised: lineage depth has no ceiling to normalise
    // against while a structure is still growing, and wrapping it turns a
    // descending recursion into a rising figure that folds back on itself.
    const step = Math.max(0, Math.round(depth)) % (SCALE.length * 3);
    const degree = SCALE[step % SCALE.length];
    const freq = ROOT * Math.pow(2, 4 + Math.floor(step / SCALE.length) + degree / 12);
    if (!Number.isFinite(freq) || freq < 20 || freq > 12000) return;

    const heft = Math.min(1, Math.log2(1 + Math.max(1, width)) / 6);
    const decay = 1.5 + 0.9 * (1 - heft);
    const peak = 0.05 + 0.05 * heft;

    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(this.bellBus);

    const oscs = [];
    for (const [ratio, level, fade] of BELL_PARTIALS) {
      const f = freq * ratio;
      if (f > 15000) continue;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      // A touch of detune per partial: a perfectly rational bell sounds like a
      // synthesiser pretending to be one.
      osc.detune.value = (ratio - 1) * 3;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(peak * level, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + decay / fade);
      osc.connect(g);
      g.connect(out);
      oscs.push(osc);
    }
    if (!oscs.length) return;
    this._play('bell', out, oscs, at, decay);
  }

  /**
   * A cell starved. Pitched from its lineage depth like the bell, two octaves
   * down, with the pitch falling away through the note — the gesture of a thing
   * going rather than arriving. Dry and short, so turnover does not turn to mud.
   */
  _knell(depth, at) {
    const ctx = this.ctx;
    const step = Math.max(0, Math.round(depth)) % (SCALE.length * 2);
    const degree = SCALE[step % SCALE.length];
    const freq = ROOT * Math.pow(2, 2 + Math.floor(step / SCALE.length) + degree / 12);
    if (!Number.isFinite(freq) || freq < 20 || freq > 4000) return;

    const decay = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.075, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);

    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(freq, at);
    // Down a fourth over the note: enough to read as weight, not as a effect.
    tone.frequency.exponentialRampToValueAtTime(freq * 0.75, at + decay);
    tone.connect(g);
    g.connect(this.knellBus);

    this._play('knell', g, [tone], at, decay);
  }

  /**
   * Start, stop and tear down a voice, keeping its instrument's count honest.
   * `kind` selects the pool, which is what stops one instrument starving the
   * other.
   */
  _play(kind, gain, oscs, at, decay, extra = []) {
    for (const o of oscs) {
      o.start(at);
      o.stop(at + decay + 0.05);
    }
    this.voices[kind]++;
    // A bell's partials are stopped at staggered times, so the *longest* one
    // decides when the voice is finished; oscs[0] is the fundamental, which
    // rings longest by construction.
    oscs[0].onended = () => {
      this.voices[kind]--;
      gain.disconnect();
      for (const n of extra) n.disconnect();
    };
  }
}
