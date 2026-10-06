// sound.js — the scene's music, on the scene's clock. WebAudio, synthesised; nothing is a recording.
//
// One clock drives both senses: the palette's cycles turn so many entries per BEAT, and the
// music is on the same beat. Water and wind are filtered noise, sized by the scene (a wider
// fall is louder). Over them a slow pad changes chord every two bars, in a mode the light
// chooses (Lydian at night, Mixolydian at dawn, Ionian by day, Dorian at dusk), and a bell
// sounds now and then on the beat. Every bell is also LIGHT: it is handed back to the page,
// which flares one star at night or a glint on the water by day, at the moment it sounds.

const MODES = {
  lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10],
};
const ROOT = { alpine: 50, canyon: 52, autumn: 45, alien: 54 };     // D, E, A, F#
const PROGRESSION = [0, 5, 3, 4, 0, 2, 3, 6];                        // scale degrees, two bars each
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Which mode the light is in at `hour`: by the sun's elevation, and whether it is rising. */
export function modeAt(hour) {
  const el = Math.sin(Math.PI * (hour - 6) / 12);
  if (el < -0.15) return 'lydian';
  if (el < 0.18) return hour < 12 ? 'mixolydian' : 'dorian';
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
    clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 90);
  }
  stop() {
    if (!this.ctx) return;
    this.on = false; clearInterval(this.timer);
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
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
  /** The beds: the fall (sized by its width), the lake lapping, the wind. */
  beds() {
    const ctx = this.ctx, w = this.scene.waterfall.width;
    const fall = this.noise(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + w * 40;
    const fg = ctx.createGain(); fg.gain.value = 0.05 + w * 0.006;
    fall.connect(lp).connect(fg).connect(this.master);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = this.scene.cliffLeft ? -0.45 : 0.45; fg.disconnect(); fg.connect(pan).connect(this.master); }
    const lap = this.noise(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 1.2;
    const lg = ctx.createGain(); lg.gain.value = 0.06;
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.21; lfoG.gain.value = 0.05;
    lfo.connect(lfoG).connect(lg.gain); lfo.start();
    lap.connect(bp).connect(lg).connect(this.master);
    const wind = this.noise(), wb = ctx.createBiquadFilter(); wb.type = 'bandpass'; wb.Q.value = 3;
    const wl = ctx.createOscillator(), wlG = ctx.createGain(); wl.frequency.value = 0.043; wlG.gain.value = 260;
    wb.frequency.value = 620; wl.connect(wlG).connect(wb.frequency); wl.start();
    const wg = ctx.createGain(); wg.gain.value = 0.035;
    wind.connect(wb).connect(wg).connect(this.master); wg.connect(this.verb);
  }

  /** Look ahead and schedule every beat that falls in the next 0.4 s. */
  schedule() {
    if (!this.on) return;
    const c = this.clock, now = this.ctx.currentTime;
    while (true) {
      const at = c.audioTimeOfBeat(this.nextBeat);
      if (at > now + 0.4) break;
      if (at >= now - 0.05) this.beat(this.nextBeat, Math.max(now, at));
      this.nextBeat++;
    }
  }
  beat(b, at) {
    const hour = this.clock.hourAtBeat(b), mode = modeAt(hour), root = ROOT[this.scene.biome] ?? 50;
    const night = Math.sin(Math.PI * (hour - 6) / 12) < -0.1;
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
