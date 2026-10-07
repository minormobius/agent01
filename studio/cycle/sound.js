// sound.js — the scene's music, on the scene's clock. Nothing is a recording.
//
// One clock drives both senses: the palette's cycles turn so many entries per BEAT, and the
// music is on the same beat. Water and wind are filtered noise, sized by the scene (a wider fall
// is louder). Over them, THE DUO: John O'Laughlin's physically modelled piano and guitar, playing
// music composed as it goes for this landscape and this moment (compose.js), rendered ahead in a
// worker (music-worker.js, pfstream.wasm) and laid on the audio clock half a second at a time.
// Every note struck is also LIGHT: handed back to the page, which flares a star at night or a
// glint on the water by day. If the worker cannot start, or keeps falling behind, the old voice
// takes over: a WebAudio pad in the mode the light chooses, and FM bells on the beat.

const MODES = {
  lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10],
};
const ROOT = { alpine: 50, canyon: 52, autumn: 45, alien: 54, atlantic: 47, tropic: 53, nordic: 49 };
const PROGRESSION = [0, 5, 3, 4, 0, 2, 3, 6];                        // scale degrees, two bars each
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * When the coast's waves break, in scene seconds: the surf cycle (coast.js) turns `perBeat` phases a
 * beat, so a crest crosses the break line once every len / perBeat beats, at `breakPos`.
 */
export function surfTimes(scene) {
  const s = scene.surf; if (!s) return null;
  const beat = 60 / scene.bpm;
  return { period: s.len / s.perBeat * beat, phase: s.breakPos / s.perBeat * beat };
}
/** Which mode the light is in: by the sun's elevation (sine of its altitude), and whether it is rising. */
export function modeAt(el, rising) {
  if (el < -0.15) return 'lydian';
  if (el < 0.18) return rising ? 'mixolydian' : 'dorian';
  return 'ionian';
}
/** MIDI notes of the chord on `degree` of `mode` from `root`: a spread voicing, 1 5 9 3. */
export function chord(root, mode, degree) {
  const sc = MODES[mode], n = (d) => root + sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  return [n(degree) - 12, n(degree + 4), n(degree + 8), n(degree + 9)];
}

export class Sound {
  constructor(scene, { onNote } = {}) {
    this.scene = scene; this.onNote = onNote || (() => {});
    this.ctx = null; this.on = false; this.nextBeat = 0; this.timer = 0; this.seed = scene.seed * 7919 + 1;
    this.duo = null; this.place = null; this.describe = '';
  }
  rnd() { this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff; return this.seed / 0x7fffffff; }

  /** Start, inside a tap (iOS unlocks audio only for sound begun in a gesture). */
  start(clock) {
    if (!this.ctx) {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
      const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const blip = ctx.createBuffer(1, 1, ctx.sampleRate), src = ctx.createBufferSource();
      src.buffer = blip; src.connect(ctx.destination); src.start();
      this.master = ctx.createGain(); this.master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
      this.master.connect(comp).connect(ctx.destination);
      this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(3.6);
      this.wet = ctx.createGain(); this.wet.gain.value = 0.55; this.verb.connect(this.wet).connect(this.master);
      this.beds();
    }
    this.clock = clock;
    this.ctx.resume();
    this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.6);
    this.on = true;
    this.nextBeat = Math.ceil(clock.beat() + 0.05);
    this.duoWanted = typeof Worker !== 'undefined';
    clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 90);
  }
  stop() {
    if (!this.ctx) return;
    this.on = false; clearInterval(this.timer);
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    this.#duoStop();
  }
  close() { this.stop(); if (this.ctx) this.ctx.close(); }
  /** The weather's beds: rain as loud as it rains, the wind up with the storm. */
  setWeather(wx) {
    this.wx = wx;
    if (!this.ctx || !this.rainGain) return;
    const now = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(0.11 * wx.rain + 0.03 * wx.snow * 0, now, 1.5);
    this.windGain.gain.setTargetAtTime(0.035 + 0.07 * wx.storm + 0.03 * Math.abs(wx.wind), now, 2);
  }
  /** Thunder at audio time `at`: a crack when it is near, then a long low roll; part of the ambience. */
  thunder(at, dist = 0.5) {
    if (!this.ctx || !this.bedOut) return;
    const ctx = this.ctx, len = 4 + 4 * dist, n = Math.floor(len * ctx.sampleRate);
    const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let lo = 0, rumble = 0;
    for (let i = 0; i < n; i++) {
      const tt = i / ctx.sampleRate, w = Math.random() * 2 - 1;
      lo += (w - lo) * 0.02; rumble += (lo - rumble) * 0.08;
      const env = Math.min(1, tt / (0.04 + dist * 0.5)) * Math.exp(-tt / (1.2 + dist * 1.6)) * (0.7 + 0.3 * Math.sin(tt * 3.1) * Math.sin(tt * 1.7));
      const crack = (1 - dist) * Math.exp(-tt / 0.07) * w * 0.5;
      d[i] = rumble * 9 * env + crack;
    }
    const src = ctx.createBufferSource(); src.buffer = b;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 - 600 * dist;
    const g = ctx.createGain(); g.gain.value = 0.5 * (1 - 0.6 * dist);
    src.connect(lp).connect(g).connect(this.bedOut); g.connect(this.verb);
    src.start(Math.max(ctx.currentTime, at));
  }
  /** The ambience (the fall, the lake, the wind) on or off, faded; the music is unaffected. */
  setAmbience(on) {
    this.ambience = on;
    if (this.bedOut) this.bedOut.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.3);
  }

  // ---- the duo: a worker composing and rendering ahead, chunks laid on the audio clock
  #clockModel() {
    const c = this.clock, t = c.now();
    return { speed: c.speed(), msBase: c.msBase, tBase: c.tBase, wallMs: Date.now(), tAt: t, lat: c.view.lat, lon: c.view.lon, seed: this.scene.seed, wx: c.view.wx || null };
  }
  #duoStart() {
    const ctx = this.ctx, sr = ctx.sampleRate, c = this.clock;
    const t0 = c.now() + 1.2;                                    // scene second at which the stream begins
    const w = new Worker(new URL('./music-worker.js', import.meta.url), { type: 'module' });
    const duo = this.duo = { w, t0, sr, out: ctx.createGain(), sources: new Set(), wanted: 0, late: 0, chunks: 0, failed: false, model: '' };
    duo.out.gain.value = 1.0; duo.out.connect(this.master);
    w.onmessage = (ev) => {
      const m = ev.data;
      if (this.duo !== duo) return;
      if (m.type === 'error') { duo.failed = true; console.warn('duo:', m.message); return; }
      if (m.type !== 'chunk') return;
      const pcm = new Float32Array(m.pcm), buf = ctx.createBuffer(2, m.frames, sr);
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      for (let i = 0; i < m.frames; i++) { L[i] = pcm[i * 2]; R[i] = pcm[i * 2 + 1]; }
      const when = c.audioTimeOf(duo.t0) + m.frame / sr, late = ctx.currentTime - when;
      if (late > 0) duo.late++;
      if (late < buf.duration) {
        const s = ctx.createBufferSource(); s.buffer = buf; s.connect(duo.out);
        s.onended = () => { duo.sources.delete(s); s.disconnect(); };
        s.start(Math.max(when, ctx.currentTime), Math.max(0, late)); duo.sources.add(s);
      }
      duo.chunks++;
      this.describe = m.describe;
      if (typeof document !== 'undefined') document.body.dataset.duo = `${duo.chunks} chunks, ${duo.late} late`;
      for (const n of m.notes) this.onNote(c.audioTimeOf(n.t), n.midi, n.inst);
    };
    w.onerror = (e) => { duo.failed = true; console.warn('duo worker:', e.message); };
    duo.model = JSON.stringify(this.#clockModel());
    w.postMessage({ type: 'start', seed: this.scene.seed, biome: this.scene.biome, bpm: this.scene.bpm, surf: surfTimes(this.scene), sampleRate: sr, t0, clock: JSON.parse(duo.model), place: this.place, want: Math.round(5 * sr) });
  }
  #duoStop() {
    const d = this.duo; if (!d) return;
    this.duo = null;
    for (const s of d.sources) { try { s.stop(); } catch {} s.disconnect(); }
    d.w.terminate(); d.out.disconnect();
  }
  /** Is the duo carrying the music (else the pad and bells do)? */
  get duoPlaying() { const d = this.duo; return !!d && !d.failed && d.chunks > 0 && d.late < 6; }
  #duoTick() {
    const d = this.duo, c = this.clock;
    if (!d) { if (this.duoWanted && c.audio) this.#duoStart(); return; }
    if (d.failed || d.late >= 6) return;
    const played = (this.ctx.currentTime - c.audioTimeOf(d.t0)) * d.sr, want = Math.round(played + 5 * d.sr);
    if (want > d.wanted + d.sr / 4) { d.wanted = want; d.w.postMessage({ type: 'want', want }); }
    const model = this.#clockModel(), key = JSON.stringify({ ...model, wallMs: 0, tAt: 0, place: this.place });
    if (key !== d.key) { d.key = key; d.w.postMessage({ type: 'clock', clock: model, place: this.place }); }
  }

  /** A room: decaying stereo noise, at the context's own rate (Safari insists). */
  impulse(sec) {
    const ctx = this.ctx, n = Math.floor(sec * ctx.sampleRate), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2); }
    return b;
  }
  noise(sec = 3) {
    const ctx = this.ctx, n = Math.floor(sec * ctx.sampleRate), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let p = 0; for (let i = 0; i < n; i++) { p = 0.97 * p + (Math.random() * 2 - 1) * 0.25; d[i] = p; }   // brownish
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.start(); return s;
  }
  /** The beds: the fall (sized by its width) or the sea's roar, the water lapping, the wind. */
  beds() {
    const ctx = this.ctx, w = this.scene.waterfall.width, coast = this.scene.kind === 'coast';
    const fall = this.noise(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = coast ? 320 : 900 + w * 40;
    const fg = ctx.createGain(); fg.gain.value = coast ? 0.07 : 0.05 + w * 0.006;
    this.bedOut = ctx.createGain(); this.bedOut.gain.value = this.ambience === false ? 0 : 1; this.bedOut.connect(this.master);
    fall.connect(lp).connect(fg).connect(this.bedOut);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan && !coast) { pan.pan.value = this.scene.cliffLeft ? -0.45 : 0.45; fg.disconnect(); fg.connect(pan).connect(this.bedOut); }
    if (coast) { this.white = this.whiteBuf(); this.surf = surfTimes(this.scene); this.nextSurf = null; this.nextGull = null; }
    const lap = this.noise(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 1.2;
    const lg = ctx.createGain(); lg.gain.value = 0.06;
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.21; lfoG.gain.value = 0.05;
    lfo.connect(lfoG).connect(lg.gain); lfo.start();
    lap.connect(bp).connect(lg).connect(this.bedOut);
    const wind = this.noise(), wb = ctx.createBiquadFilter(); wb.type = 'bandpass'; wb.Q.value = 3;
    const wl = ctx.createOscillator(), wlG = ctx.createGain(); wl.frequency.value = 0.043; wlG.gain.value = 260;
    wb.frequency.value = 620; wl.connect(wlG).connect(wb.frequency); wl.start();
    const wg = ctx.createGain(); wg.gain.value = 0.035; this.windGain = wg;
    wind.connect(wb).connect(wg).connect(this.bedOut);
    // rain: a hiss (high) over a patter (mid), as loud as it is raining
    const rain = this.noise(), rh = ctx.createBiquadFilter(); rh.type = 'highpass'; rh.frequency.value = 2400;
    const rp = ctx.createBiquadFilter(); rp.type = 'bandpass'; rp.frequency.value = 900; rp.Q.value = 0.6;
    const rg = ctx.createGain(); rg.gain.value = 0; this.rainGain = rg;
    const white = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), wd = white.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    const ws = ctx.createBufferSource(); ws.buffer = white; ws.loop = true; ws.start();
    ws.connect(rh).connect(rg); rain.connect(rp).connect(rg); rg.connect(this.bedOut); rg.connect(this.verb);
  }

  whiteBuf() {
    const ctx = this.ctx, b = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  /** One wave breaking at audio time `at`: the crash (noise opening and closing), then the wash up the sand. */
  breaker(at, size) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.white; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(250, at); lp.frequency.exponentialRampToValueAtTime(1800 + 1400 * size, at + 0.45); lp.frequency.exponentialRampToValueAtTime(500, at + 4.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.09 * size, at + 0.35); g.gain.exponentialRampToValueAtTime(0.03 * size, at + 1.6); g.gain.exponentialRampToValueAtTime(0.0001, at + 6);
    // the wash: a high hiss that rises as the foam runs up and fades as it drains
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 3800; hp.Q.value = 0.5;
    const wg = ctx.createGain(); wg.gain.setValueAtTime(0.0001, at + 0.8); wg.gain.exponentialRampToValueAtTime(0.03 * size, at + 2.2); wg.gain.exponentialRampToValueAtTime(0.0001, at + 5.5);
    src.connect(lp).connect(g).connect(this.bedOut); g.connect(this.verb); src.connect(hp).connect(wg).connect(this.bedOut);
    src.start(at, Math.random() * 2); src.stop(at + 6.2);
  }
  /** A gull's call: two or three falling cries, nasal (a saw through two formants). */
  gull(at) {
    const ctx = this.ctx, n = 1 + Math.floor(Math.random() * 3), f0 = 1500 + Math.random() * 500, pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const out = ctx.createGain(); out.gain.value = 0.02 + Math.random() * 0.02;
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; out.connect(pan).connect(this.bedOut); } else out.connect(this.bedOut);
    out.connect(this.verb);
    for (let i = 0; i < n; i++) {
      const t = at + i * (0.32 + Math.random() * 0.1), d = 0.22 + Math.random() * 0.1;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * 0.8, t); o.frequency.linearRampToValueAtTime(f0, t + 0.04); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + d);
      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 1900; f1.Q.value = 4;
      const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 3200; f2.Q.value = 5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(out);
      o.start(t); o.stop(t + d + 0.05);
    }
  }
  /** The coast's events in the next 0.6 s: each wave as it breaks (from the surf cycle), gulls by day. */
  #coastTick() {
    const c = this.clock, now = this.ctx.currentTime, t = c.now(), { period, phase } = this.surf;
    if (this.nextSurf === null || this.nextSurf < t - period) this.nextSurf = phase + Math.ceil((t - phase) / period) * period;
    while (c.audioTimeOf(this.nextSurf) < now + 0.6) {
      const at = c.audioTimeOf(this.nextSurf), k = Math.round((this.nextSurf - phase) / period);
      const size = (0.7 + 0.3 * Math.abs(Math.sin(k * 1.7))) * (1 + 0.5 * ((this.wx && this.wx.storm) || 0));
      if (at >= now - 0.05) this.breaker(Math.max(now, at), size);
      this.nextSurf += period;
    }
    const day = c.lightAtBeat(c.beat()).el > 0;
    if (this.nextGull === null) this.nextGull = now + 4 + Math.random() * 10;
    if (now >= this.nextGull) { if (day && !(this.wx && this.wx.rain > 0.4)) this.gull(now + 0.05); this.nextGull = now + 9 + Math.random() * 28; }
  }

  /** Look ahead and schedule every beat that falls in the next 0.4 s. */
  schedule() {
    if (!this.on) return;
    this.#duoTick();
    if (this.surf) this.#coastTick();
    const c = this.clock, now = this.ctx.currentTime;
    while (true) {
      const at = c.audioTimeOfBeat(this.nextBeat);
      if (at > now + 0.4) break;
      if (at >= now - 0.05) this.beat(this.nextBeat, Math.max(now, at));
      this.nextBeat++;
    }
  }
  beat(b, at) {
    const { el, rising } = this.clock.lightAtBeat(b), mode = modeAt(el, rising), root = ROOT[this.scene.biome] ?? 50;
    const night = el < -0.1;
    // the duo is the music; the pad and bells are its stand-in while it starts, or if it cannot
    if (this.duoPlaying || (this.duo && !this.duo.failed && this.duo.chunks === 0)) return;
    if (b % 8 === 0) this.pad(chord(root, mode, PROGRESSION[(b / 8) % PROGRESSION.length]), at, this.clock.beatSec * 8.6);
    // bells: sparser by day; sometimes a pair a dotted beat apart (3 against 2 with the pad)
    if (this.rnd() < (night ? 0.42 : 0.24)) {
      const sc = MODES[mode], penta = [0, 1, 2, 4, 5].map((k) => sc[k]);
      const deg = penta[Math.floor(this.rnd() * penta.length)], oct = this.rnd() < 0.4 ? 24 : 12;
      const m = root + 12 + deg + oct;
      this.bell(m, at, night ? 0.13 : 0.09, night);
      this.onNote(at, m, b);
      if (this.rnd() < 0.3) { const m2 = root + 12 + penta[Math.floor(this.rnd() * 5)] + oct; const at2 = at + this.clock.beatSec * 1.5; this.bell(m2, at2, 0.07, night); this.onNote(at2, m2, b + 1.5); }
    }
  }
  pad(notes, at, dur) {
    const ctx = this.ctx, out = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.3;
    out.gain.setValueAtTime(0, at); out.gain.linearRampToValueAtTime(0.05, at + dur * 0.3); out.gain.linearRampToValueAtTime(0, at + dur);
    lp.connect(out); out.connect(this.master); out.connect(this.verb);
    notes.forEach((m, i) => for2(m, i));
    function for2(m, i) {
      for (const det of [-5, 5]) {
        const o = ctx.createOscillator(); o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = hz(m); o.detune.value = det;
        const g = ctx.createGain(); g.gain.value = i === 0 ? 0.9 : 0.45;
        o.connect(g).connect(lp); o.start(at); o.stop(at + dur + 0.1);
      }
    }
  }
  /** FM bell: a glassy one at night (ratio 3.5), a softer one by day. */
  bell(m, at, vol, night) {
    const ctx = this.ctx, f = hz(m), car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = f; mod.frequency.value = f * (night ? 3.5 : 2.0);
    mg.gain.setValueAtTime(f * (night ? 2.2 : 1.2), at); mg.gain.exponentialRampToValueAtTime(f * 0.05, at + 1.6);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + 3.2);
    mod.connect(mg).connect(car.frequency); car.connect(g); g.connect(this.master); g.connect(this.verb);
    car.start(at); mod.start(at); car.stop(at + 3.3); mod.stop(at + 3.3);
  }
}
