// sound-worklet.js — the world's music, off the main thread: sound.js's engine in an AudioWorklet.
// The page's conductor posts { state, events } a few times a second.
import { makeEngine } from './sound.js';

class GrownSound extends AudioWorkletProcessor {
  constructor() {
    super();
    this.E = makeEngine(sampleRate);
    this.port.onmessage = (e) => { const m = e.data; if (m.state) this.E.state(m.state); for (const ev of m.events || []) this.E.event(ev); };
  }
  process(inputs, outputs) {
    const o = outputs[0];
    this.E.render(o[0], o[1] || o[0], o[0].length);
    return true;
  }
}
registerProcessor('grown-sound', GrownSound);
