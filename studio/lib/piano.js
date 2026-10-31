// piano.js — clef's physical-model piano, played as a stream.
//
// The model (pfsynth, via vendor/pfsynth/) cannot play in real time in the
// sense a sequencer means: each note is a waveguide with a nonlinear hammer
// solved every sample. But it renders a sparse piece at ~10x real time on a
// desktop, so it does not have to render the WHOLE piece before a note is
// heard, which is what clef does. It renders in a worker, hands back half a
// second at a time, and each half second is scheduled on the audio clock at its
// exact sample. Playback starts as soon as the render is far enough ahead that
// it can never be caught — which on a fast machine is almost at once, and on a
// slow one is a short wait that is at least honest about its length.
//
// The page reads `time` (seconds into the piece, from the audio clock) and
// draws from it. The audio clock is the only clock.

import { instantiate, begin, DEFAULT_GAIN } from './pfsynth-core.js';
import { loadBand } from './band-load.js';
import { mix } from './band.js';

const LEAD = 1.5;          // seconds of audio in hand before starting, at minimum
const SAFETY = 0.8;        // assume the render will run at 80% of the speed measured so far

export class StreamPiano {
  /**
   * @param events  [{at, dur, midi, velocity}] in seconds
   * @param length  how long the piece is expected to last, tail included (s)
   * @param band    optional: the URL of a score.js with bandEvents (lib/band.js).
   *                The band renders first; each piano chunk is mixed with it.
   */
  constructor(events, length, { gain = DEFAULT_GAIN, volume = 0.9, band = null } = {}) {
    this.events = events.map(({ at, dur, midi, velocity }) => ({ at, dur, midi, velocity }));
    this.length = length;
    this.gain = gain;
    this.volume = volume;
    this.ctx = null;
    this.out = null;
    this.chunks = [];        // { frame, buffer: AudioBuffer }
    this.rendered = 0;       // seconds of audio in hand
    this.done = false;
    this.error = null;
    this.t0 = null;          // ctx time at which the piece's second 0 plays
    this.sources = new Set();
    this.renderStarted = 0;
    this.onStatus = null;
    this.onEnd = null;
    this._endTimer = null;
    this.bandUrl = band;
    this.band = null;        // { L, R } at the context's rate, once rendered
    this.held = [];          // piano chunks that arrived before the band
    this.pianoDone = false;
  }

  /** Make the context (suspended until a gesture) and start rendering. */
  prepare() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'playback' });
    this.out = this.ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(this.ctx.destination);
    this.renderStarted = performance.now();
    if (this.bandUrl) {
      loadBand(this.bandUrl, this.ctx.sampleRate, this.length).then((b) => {
        this.band = b;
        const held = this.held; this.held = [];
        for (const [f, p] of held) this.#accept(f, p);
        if (this.pianoDone) this.#finish();
        this.onStatus?.(this);
      }, (err) => { this.error = err; this.onStatus?.(this); });
    }
    this.#render();
  }

  /** Waiting on the band before any audio can be scheduled. */
  get waitingForBand() { return !!this.bandUrl && !this.band; }

  /** Audio seconds per wall second, measured so far. */
  get speed() {
    const wall = (performance.now() - this.renderStarted) / 1000;
    return wall > 0.05 ? this.rendered / wall : 0;
  }

  /**
   * Seconds of render still needed before starting is safe, or 0.
   *
   * Starting with R seconds rendered, at render speed r, the render stays ahead
   * of playback at every moment p as long as R + r·p ≥ p, i.e. R ≥ (1 − r)·p,
   * worst at the end: R ≥ (1 − r)·length. Plus a small lead either way.
   */
  get shortfall() {
    if (this.done) return 0;
    const r = this.speed * SAFETY;
    const need = LEAD + Math.max(0, (1 - r) * this.length);
    return Math.max(0, need - this.rendered);
  }

  get ready() { return !this.waitingForBand && (this.done || (this.rendered > 0 && this.shortfall === 0)); }

  /** Seconds into the piece, from the audio clock; null before start. */
  get time() {
    if (this.t0 === null || !this.ctx) return null;
    return this.ctx.currentTime - this.t0;
  }

  get playing() { return this.t0 !== null; }

  /** Call from a user gesture. Resolves once playback is scheduled. */
  async start() {
    this.prepare();
    claimPlaybackSession();
    // Resume inside the gesture, before any await, or iOS refuses.
    const resumed = this.ctx.resume();
    while (!this.ready) {
      if (this.error) throw this.error;
      await new Promise((r) => setTimeout(r, 100));
    }
    await resumed;
    this.stop();
    this.t0 = this.ctx.currentTime + 0.12;
    for (const c of this.chunks) this.#schedule(c);
    this.#armEnd();
  }

  stop() {
    for (const s of this.sources) { try { s.stop(); } catch { /* not started */ } s.disconnect(); }
    this.sources.clear();
    this.t0 = null;
    clearTimeout(this._endTimer);
  }

  #schedule(c) {
    const when = this.t0 + c.frame / this.ctx.sampleRate;
    const late = this.ctx.currentTime - when;
    if (late >= c.buffer.duration) return;          // missed entirely; the picture follows the clock regardless
    const s = this.ctx.createBufferSource();
    s.buffer = c.buffer;
    s.connect(this.out);
    s.onended = () => { this.sources.delete(s); s.disconnect(); };
    if (late > 0) s.start(this.ctx.currentTime, late);
    else s.start(when);
    this.sources.add(s);
  }

  #armEnd() {
    clearTimeout(this._endTimer);
    if (!this.done || this.t0 === null) return;
    const left = this.t0 + this.rendered - this.ctx.currentTime;
    this._endTimer = setTimeout(() => { if (this.t0 !== null) this.onEnd?.(); }, Math.max(0, left * 1000));
  }

  #accept(frame, pcm) {
    if (this.waitingForBand) { this.held.push([frame, pcm]); this.pianoRendered = (frame + pcm.length / 2) / this.ctx.sampleRate; this.onStatus?.(this); return; }
    const sr = this.ctx.sampleRate;
    const n = pcm.length / 2;
    const buffer = this.ctx.createBuffer(2, n, sr);
    const L = buffer.getChannelData(0);
    const R = buffer.getChannelData(1);
    for (let i = 0; i < n; i++) { L[i] = pcm[2 * i]; R[i] = pcm[2 * i + 1]; }
    if (this.band) mix(L, R, this.band, frame);
    const c = { frame, buffer };
    this.chunks.push(c);
    this.rendered = (frame + n) / sr;
    if (this.t0 !== null) this.#schedule(c);
    this.onStatus?.(this);
  }

  #finish() {
    if (this.waitingForBand) { this.pianoDone = true; return; }
    // the band may play on after the piano's last note has died
    if (this.band) {
      const sr = this.ctx.sampleRate;
      let frame = Math.round(this.rendered * sr);
      const CH = 24000;
      while (frame < this.band.L.length) {
        const n = Math.min(CH, this.band.L.length - frame);
        this.#accept(frame, new Float32Array(n * 2));
        frame += n;
      }
    }
    this.done = true;
    this.length = this.rendered;
    this.#armEnd();
    this.onStatus?.(this);
  }

  #render() {
    const sampleRate = this.ctx.sampleRate;
    let worker = null;
    try {
      worker = new Worker(new URL('./piano-worker.js', import.meta.url), { type: 'module' });
    } catch { worker = null; }
    if (!worker) { this.#renderInThread(sampleRate); return; }

    let fellBack = false;
    const fallBack = () => {
      if (fellBack) return;
      fellBack = true;
      worker.terminate();
      this.chunks = []; this.rendered = 0; this.held = [];
      this.#renderInThread(sampleRate);
    };
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'chunk') this.#accept(m.frame, new Float32Array(m.pcm));
      else if (m.type === 'done') { this.#finish(); worker.terminate(); }
      else if (m.type === 'error') {
        // A worker that cannot load the wasm will not do better on a retry;
        // the main thread might (a CSP or a module-worker gap).
        if (!this.rendered) fallBack();
        else { this.error = new Error(m.message); this.onStatus?.(this); }
      }
    };
    worker.onerror = () => { if (!this.rendered) fallBack(); };
    worker.postMessage({ type: 'render', id: 1, events: this.events, sampleRate, gain: this.gain });
  }

  /** No worker: the same render in slices on the main thread. Janky, but it plays. */
  async #renderInThread(sampleRate) {
    try {
      const res = await fetch(new URL('../vendor/pfsynth/pfsynth.wasm', import.meta.url));
      if (!res.ok) throw new Error(`pfsynth.wasm: HTTP ${res.status}`);
      const X = await instantiate(await res.arrayBuffer());
      const r = begin(X, this.events, sampleRate, this.gain);
      let frame = 0;
      for (;;) {
        const p = r.pull();
        if (!p) break;
        this.#accept(frame, p);
        frame += p.length / 2;
        await new Promise((ok) => setTimeout(ok, 0));
      }
      this.#finish();
    } catch (err) {
      this.error = err;
      this.onStatus?.(this);
    }
  }
}

/** As in clef: on iOS a bare AudioContext is 'ambient', which the silent switch mutes. */
function claimPlaybackSession() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* stay ambient */ }
}
