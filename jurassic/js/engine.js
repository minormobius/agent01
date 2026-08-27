/* jurassic — the bridge between the page and the Rust kernel.
 *
 * There are two instances of the same wasm module, and keeping the distinction
 * straight is the only subtle thing in this file:
 *
 *   • one inside the AudioWorklet, which renders sound and nothing else;
 *   • one here on the main thread, which renders nothing and answers the map's
 *     questions — how far does this call carry, how loud is it where I am
 *     standing.
 *
 * Every scene mutation goes to both, from one place, so the circles on the map
 * and the sound in your ears can never be answers to different questions. That
 * is the point of routing everything through `Soundscape` instead of letting
 * the map do its own arithmetic: a second implementation of the propagation
 * model is a second implementation that can be wrong.
 *
 * The audio half is optional. With no AudioContext — before the first gesture,
 * or on a browser without AudioWorklet — the map is fully live and fully
 * correct; it simply makes no noise.
 */

const WASM_URL = new URL("../engine/jurassic.wasm", import.meta.url);
const WORKLET_URL = new URL("./worklet.js", import.meta.url);

/**
 * Push one voice into a kernel instance. Three calls rather than one enormous
 * one: the placement and the resonator, then the file's SHAPE, then whether the
 * animal sings on both strokes. Both the main-thread instance and the worklet's
 * go through this, so they cannot drift apart.
 */
export function addVoice(ex, i, v) {
  ex.add_voice(
    v.x, v.y, v.carrierHz, v.q, v.toothRate, v.teeth,
    v.syllables, v.gapS, v.periodS, v.splDb, v.seed
  );
  const f = v.file || {};
  ex.set_voice_file(
    i, f.sweep || 0, f.flare || 1, f.ripple || 0, f.rippleCycles || 0,
    f.jitter || 0, f.pegs || 0, f.pegRatio || 1
  );
  ex.set_voice_stroke(i, v.opening || 0, v.strokeGapS || 0.01);
}

export class Soundscape {
  constructor(bytes, instance) {
    this.bytes = bytes;
    this.ex = instance.exports;
    this.ex.init(48000);
    this.version = this.ex.engine_version();
    this.maxVoices = this.ex.max_voices();

    this.voices = [];
    this.activity = new Float32Array(0);
    this.peak = 0;

    this.ctx = null;
    this.node = null;
    this.state = "silent"; // silent | starting | playing | failed
    this.onstate = () => {};
    this.onactivity = () => {};

    this.air = { tempC: 24, humidity: 80, pressureKpa: 101.325, canopy: 0.6 };
    this.listener = { x: 0, y: 0, heading: 0 };
    this.detector = { divisor: 1, thresholdHz: 14000 };
    this.masterGain = 6;
  }

  static async load() {
    const resp = await fetch(WASM_URL);
    if (!resp.ok) throw new Error(`could not fetch the engine (${resp.status})`);
    const bytes = await resp.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    return new Soundscape(bytes, instance);
  }

  // ------------------------------------------------------------- the scene --

  /** Replace the whole cast. `voices` are flat parameter records. */
  setScene(voices) {
    this.voices = voices.slice(0, this.maxVoices);
    this.activity = new Float32Array(this.voices.length);
    this.ex.clear_scene();
    this.voices.forEach((v, i) => addVoice(this.ex, i, v));
    this.post({ t: "scene", voices: this.voices });
  }

  setListener(x, y, heading = this.listener.heading) {
    this.listener = { x, y, heading };
    this.ex.set_listener(x, y, heading);
    this.post({ t: "listener", x, y, heading });
  }

  setAir(patch) {
    Object.assign(this.air, patch);
    const a = this.air;
    this.ex.set_air(a.tempC, a.humidity, a.pressureKpa, a.canopy);
    this.post({ t: "air", ...a });
  }

  setDetector(divisor, thresholdHz = this.detector.thresholdHz) {
    this.detector = { divisor, thresholdHz };
    this.ex.set_detector(divisor, thresholdHz);
    this.post({ t: "detector", divisor, thresholdHz });
  }

  setMaster(gain) {
    this.masterGain = gain;
    this.ex.set_master(gain);
    this.post({ t: "master", gain });
  }

  setTrim(i, trim) {
    this.ex.set_voice_trim(i, trim);
    this.post({ t: "trim", i, trim });
  }

  // ------------------------------------------------------------- questions --
  //
  // These are the map's only source of truth about propagation. All four go
  // through to Rust; none of them is reimplemented in JavaScript.

  /** How far voice `i` carries before it falls below `thresholdDb`, in metres. */
  audibleRadius(i, thresholdDb) {
    return this.ex.voice_audible_radius_m(i, thresholdDb);
  }

  /** Level of voice `i` where the listener is standing, dB SPL. */
  receivedDb(i) {
    return this.ex.voice_received_db(i);
  }

  /** Fraction of the time voice `i` is actually radiating. */
  duty(i) {
    return this.ex.voice_duty(i);
  }

  /** One traverse of the file, in seconds — derived by the kernel, not set. */
  hemisyllableS(i) {
    return this.ex.voice_hemisyllable_s(i);
  }

  /** A full syllable, both strokes included where the species uses both. */
  syllableS(i) {
    return this.ex.voice_syllable_s(i);
  }

  /**
   * Atmospheric absorption at `f`, dB per metre. Defaults to the current air;
   * pass an override to ask hypothetical questions of it, which is how the
   * page finds the humidity that punishes a given call hardest.
   */
  absorptionDbPerM(f, air = this.air) {
    return this.ex.absorption_db_per_m(f, air.tempC, air.humidity, air.pressureKpa);
  }

  /**
   * The relative humidity that costs a call at `f` the most, at the current
   * temperature, and what it costs there.
   *
   * Absorption is NOT monotone in humidity — water vapour catalyses the
   * vibrational relaxation of oxygen and nitrogen, and each relaxation absorbs
   * hardest when its relaxation frequency passes through the signal. So every
   * frequency has a worst humidity somewhere in the middle, and a saturated
   * night is often kinder to a call than a merely damp one.
   */
  worstHumidity(f) {
    let worst = { humidity: 0, dbPerKm: -1 };
    for (let rh = 5; rh <= 100; rh += 1) {
      const db = this.absorptionDbPerM(f, { ...this.air, humidity: rh }) * 1000;
      if (db > worst.dbPerKm) worst = { humidity: rh, dbPerKm: db };
    }
    return worst;
  }

  /** Total loss over `r` metres at `f` Hz, in the current air and canopy. */
  lossDb(r, f) {
    const a = this.air;
    return this.ex.transmission_loss_db(r, f, a.tempC, a.humidity, a.pressureKpa, a.canopy);
  }

  // ----------------------------------------------------------------- audio --

  /** Start the audio thread. Must be called from a user gesture. */
  async start() {
    if (this.state === "playing" || this.state === "starting") {
      if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    this.setState("starting");
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error("this browser has no Web Audio");
      this.ctx = new Ctx({ latencyHint: "playback" });
      if (!this.ctx.audioWorklet) throw new Error("this browser has no AudioWorklet");
      await this.ctx.audioWorklet.addModule(WORKLET_URL);
      // The worklet cannot fetch, so hand it a copy of the module bytes.
      const copy = this.bytes.slice(0);
      this.node = new AudioWorkletNode(this.ctx, "daohugou", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { wasmBytes: copy },
      });
      this.node.port.onmessage = (e) => this.fromWorklet(e.data);
      this.node.connect(this.ctx.destination);
      await this.ctx.resume();
      // Re-init the query instance at the real rate, so `ceilingHz` and the
      // worklet agree, then push the scene we already have — the worklet
      // started empty.
      this.ex.init(this.ctx.sampleRate);
      this.ex.set_air(this.air.tempC, this.air.humidity, this.air.pressureKpa, this.air.canopy);
      this.setScene(this.voices);
      this.setListener(this.listener.x, this.listener.y, this.listener.heading);
      this.resend();
      this.setState("playing");
    } catch (err) {
      this.error = String(err && err.message ? err.message : err);
      this.setState("failed");
    }
  }

  async stop() {
    if (this.ctx) await this.ctx.suspend();
    this.setState("silent");
  }

  /** The sample rate the audio thread is actually running at, or null. */
  get sampleRate() {
    return this.ctx ? this.ctx.sampleRate : null;
  }

  /**
   * The highest carrier this output can actually carry, in Hz — asked of the
   * kernel rather than computed here, so the page's warning and the kernel's
   * silence agree about which calls are lost.
   *
   * Above it a call is not quiet, it is absent. On a 44.1 kHz context that is
   * true of Sigmaboilus peregrinus at 22.5 kHz, which is the most useful thing
   * this page can tell you about why a detector exists.
   */
  get ceilingHz() {
    return this.ctx ? this.ex.reproducible_ceiling_hz() : null;
  }

  resend() {
    this.post({ t: "scene", voices: this.voices });
    this.post({ t: "listener", ...this.listener });
    this.post({ t: "air", ...this.air });
    this.post({ t: "detector", ...this.detector });
    this.post({ t: "master", gain: this.masterGain });
  }

  post(msg) {
    if (this.node) this.node.port.postMessage(msg);
  }

  fromWorklet(m) {
    if (m.t === "act") {
      this.activity = m.act;
      this.peak = m.peak;
      this.onactivity(m.act, m.peak);
    } else if (m.t === "error") {
      this.error = m.message;
      this.setState("failed");
    }
  }

  setState(s) {
    this.state = s;
    this.onstate(s, this.error);
  }
}
