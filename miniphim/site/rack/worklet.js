// The audio thread. Every 128 samples the browser asks for a block; the rack (Rust, wasm)
// starts whatever notes fall inside it, to the sample, and renders the block. Nothing here
// allocates while playing, so there is no garbage collector to stall the sound.
class Rack extends AudioWorkletProcessor {
  constructor() {
    super(); this.W = null; this.ev = []; this.k = 0; this.t = 0; this.drop = 0; this.peak = 0;
    this.port.onmessage = async ({ data }) => {
      if (data.wasm) { const { instance } = await WebAssembly.instantiate(data.wasm); this.W = instance.exports; this.W.init(sampleRate); this.port.postMessage({ ready: true }); }
      if (data.events) { this.W && this.W.init(sampleRate); this.ev = data.events; this.k = 0; this.t = 0; this.drop = 0; this.peak = 0; }
      // wander: the next phrase arrives while this one plays; the clock keeps running. Only the
      // unplayed tail is copied (once a phrase, in the message handler, never inside process()).
      if (data.more) { this.ev = this.ev.slice(this.k).concat(data.more); this.k = 0; }
      if (data.stop) { this.ev = []; this.k = 0; this.W && this.W.init(sampleRate); }
    };
  }
  process(_, outputs) {
    const o = outputs[0][0]; if (!this.W) return true;
    const n = o.length, end = this.t + n;
    // events: [sampleTime, kind, hz, gain, lenSamples], sorted by time
    while (this.k < this.ev.length && this.ev[this.k][0] < end) {
      const e = this.ev[this.k++];
      if (this.W.note(e[1], e[2], e[3], Math.max(0, e[0] - this.t), e[4]) < 0) this.drop++;
    }
    const sounding = this.W.render(n);
    if (!this.view || this.view.buffer !== this.W.memory.buffer || this.view.length !== n) this.view = new Float32Array(this.W.memory.buffer, this.W.out(), n);
    o.set(this.view);
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(o);
    if (sounding > this.peak) this.peak = sounding;
    this.t = end;
    if ((this.t / n) % 64 === 0) this.port.postMessage({ sounding, peak: this.peak, drop: this.drop, at: this.t / sampleRate, done: this.k >= this.ev.length && sounding === 0 });
    return true;
  }
}
registerProcessor('rack', Rack);
