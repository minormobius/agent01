/* jurassic — the audio thread.
 *
 * An AudioWorkletProcessor that is a thin skin over the Rust kernel: it owns
 * the only instance that renders, and every 128-frame quantum it calls
 * `render` and copies the interleaved result into the two output channels.
 * Nothing here allocates and nothing here does physics; both would be a bug on
 * this thread.
 *
 * The wasm arrives as raw bytes through `processorOptions`, because a worklet
 * cannot fetch. Synchronous `WebAssembly.Module` construction is permitted in
 * AudioWorkletGlobalScope, which is the whole reason this works at all.
 *
 * Deliberately written as a self-contained classic script with no imports: the
 * module-script half of the AudioWorklet spec is unevenly implemented, and this
 * file has no business depending on anything.
 */

class DaohugouProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options.processorOptions || {};
    this.ok = false;
    this.frames = 128;
    try {
      const mod = new WebAssembly.Module(opts.wasmBytes);
      const inst = new WebAssembly.Instance(mod, {});
      this.ex = inst.exports;
      this.ex.init(sampleRate);
      // Memory never grows — there is no allocator in the kernel — so this
      // view stays valid for the life of the processor.
      this.mem = new Float32Array(this.ex.memory.buffer);
      this.outPtr = this.ex.out_ptr() >> 2;
      this.ok = true;
    } catch (err) {
      this.port.postMessage({ t: "error", message: String(err && err.message ? err.message : err) });
      return;
    }

    this.n = 0;
    this.act = new Float32Array(0);
    this.sinceReport = 0;
    this.port.onmessage = (e) => this.handle(e.data);
    this.port.postMessage({ t: "ready", version: this.ex.engine_version(), sampleRate });
  }

  handle(m) {
    if (!this.ok) return;
    const ex = this.ex;
    switch (m.t) {
      case "scene":
        ex.clear_scene();
        for (const v of m.voices) {
          ex.add_voice(
            v.x, v.y, v.carrierHz, v.q, v.toothRate, v.teeth, v.sweep, v.jitter,
            v.syllables, v.gapS, v.periodS, v.splDb, v.seed
          );
        }
        this.n = m.voices.length;
        this.act = new Float32Array(this.n);
        break;
      case "listener":
        ex.set_listener(m.x, m.y, m.heading);
        break;
      case "air":
        ex.set_air(m.tempC, m.humidity, m.pressureKpa, m.canopy);
        break;
      case "detector":
        ex.set_detector(m.divisor, m.thresholdHz);
        break;
      case "master":
        ex.set_master(m.gain);
        break;
      case "trim":
        ex.set_voice_trim(m.i, m.trim);
        break;
    }
  }

  process(_inputs, outputs) {
    if (!this.ok) return true;
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const frames = out[0].length;

    const ptr = this.ex.render(frames) >> 2;
    const buf = this.mem;
    const l = out[0];
    const r = out.length > 1 ? out[1] : out[0];
    for (let f = 0; f < frames; f++) {
      l[f] = buf[ptr + f * 2];
      r[f] = buf[ptr + f * 2 + 1];
    }

    // Tell the main thread who is singing, about twenty times a second. The
    // map lights its dots off this rather than off a second clock of its own,
    // which would drift out of step with the audio within a minute.
    this.sinceReport += frames;
    if (this.sinceReport >= sampleRate / 20) {
      this.sinceReport = 0;
      for (let i = 0; i < this.n; i++) this.act[i] = this.ex.voice_activity(i);
      this.port.postMessage({ t: "act", act: this.act.slice(), peak: this.ex.peak_out() });
    }
    return true;
  }
}

registerProcessor("daohugou", DaohugouProcessor);
