// /pumpkin/live — voices for the puppets.
//
// A TRACK is the mouth's script: a list of timed segments, each with how open
// and how round the mouth is, plus the events a line carries ("!" hops, "?"
// cocks the head). `track(text)` reads text letter by letter, the way Animal
// Crossing's "Animalese" does: vowels open the mouth (o and u round it, e and
// i spread it), m, b and p press the lips shut, f and v nearly so. `babble()`
// makes a line of plausible gibberish to read.
//
// Then three ways to drive a puppet's mouth:
//   Player     plays a track, and (if given an AudioContext) speaks it as
//              pitched, vowel-shaped blips
//   Mic        follows a microphone: loudness opens the mouth, a dark sound
//              rounds it
//   Speaker    the browser's own voice (speechSynthesis), with the mouth paced
//              word by word from its boundary events
//
// `track` and `babble` are pure; the rest need a browser.

const VOWELS = { a: [0.95, 0.35], e: [0.7, 0.05], i: [0.6, 0.0], o: [0.85, 0.95], u: [0.65, 1.0], y: [0.6, 0.1] };
const SHUT = new Set(['m', 'b', 'p']), NEAR = new Set(['f', 'v']), ROUNDED = new Set(['w', 'q']);
// Formants (Hz) per vowel, for the blip voice.
const FORMANTS = { a: [800, 1200], e: [500, 1900], i: [320, 2300], o: [500, 900], u: [330, 800], y: [320, 2200], _: [600, 1500] };

/**
 * Text → mouth script. Returns { segs: [{ t, dur, open, round, ch }], events:
 * [{ t, kind }], dur }. `rate` scales the speed (1 = 15 letters a second).
 */
export function track(text, { rate = 1 } = {}) {
  const segs = [], events = [];
  let t = 0;
  const L = 0.066 / rate;
  for (const raw of String(text).slice(0, 400)) {
    const ch = raw.toLowerCase();
    if (VOWELS[ch]) { segs.push({ t, dur: L * 1.25, open: VOWELS[ch][0], round: VOWELS[ch][1], ch }); t += L * 1.25; }
    else if (SHUT.has(ch)) { segs.push({ t, dur: L, open: -0.5, round: 0.2, ch }); t += L; }
    else if (NEAR.has(ch)) { segs.push({ t, dur: L, open: 0.1, round: 0.1, ch }); t += L; }
    else if (ROUNDED.has(ch)) { segs.push({ t, dur: L, open: 0.35, round: 0.9, ch }); t += L; }
    else if (/[a-z]/.test(ch)) { segs.push({ t, dur: L, open: 0.3, round: 0.3, ch }); t += L; }
    else if (/[0-9]/.test(ch)) { segs.push({ t, dur: L * 2, open: 0.6, round: 0.4, ch: 'a' }); t += L * 2; }
    else if (ch === ' ') t += L * 0.9;
    else if (/[,;:—-]/.test(ch)) t += L * 3.5;
    else if (/[.!?…]/.test(ch)) {
      if (ch === '!') events.push({ t: Math.max(0, t - L), kind: 'hop' });
      if (ch === '?') events.push({ t: Math.max(0, t - L * 2), kind: 'tilt' });
      t += L * 6;
    }
  }
  return { segs, events, dur: t };
}

/** Where the mouth is at time `at` in a track: { open, round, seg }. */
export function mouthAt(tr, at) {
  // Binary search for the segment under `at`.
  let lo = 0, hi = tr.segs.length - 1, seg = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, s = tr.segs[mid];
    if (at < s.t) hi = mid - 1; else if (at >= s.t + s.dur) lo = mid + 1; else { seg = s; break; }
  }
  if (!seg) return { open: 0, round: 0, seg: null };
  const f = (at - seg.t) / seg.dur;
  const env = seg.open < 0 ? 1 : Math.pow(Math.sin(Math.PI * Math.min(1, f * 1.1)), 0.6);
  return { open: seg.open * env, round: seg.round, seg };
}

// Gibberish that reads like speech: short words of consonant-vowel syllables,
// with a few real, seasonal ones mixed in.
const ONSETS = ['b', 'd', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'br', 'gr', 'sk', 'bl', 'cr', 'fl', 'sp', 'th', 'sh', 'ch', ''];
const NUCLEI = ['a', 'e', 'i', 'o', 'u', 'oo', 'ee', 'ai', 'ou', 'aa'];
const CODAS = ['', '', '', 'n', 'm', 'k', 'r', 'l', 's', 't', 'mp', 'nk'];
const REAL = ['boo', 'ooh', 'oh', 'hey', 'wow', 'hmm', 'ha', 'nope', 'yes', 'trick', 'treat', 'spooky', 'candy', 'moon', 'ghost', 'pumpkin', 'eek', 'ahh', 'right', 'well'];

export function babble(rand = Math.random) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const words = [];
  const n = 2 + Math.floor(rand() * 8);
  for (let i = 0; i < n; i++) {
    if (rand() < 0.25) { words.push(pick(REAL)); continue; }
    let w = '';
    const syl = 1 + Math.floor(rand() * rand() * 3.2);
    for (let s = 0; s < syl; s++) w += pick(ONSETS) + pick(NUCLEI) + (s === syl - 1 ? pick(CODAS) : '');
    words.push(w);
  }
  let line = words.join(' ');
  line = line[0].toUpperCase() + line.slice(1);
  const r = rand();
  return line + (r < 0.25 ? '!' : r < 0.45 ? '?' : r < 0.55 ? '...' : '.');
}

// ---------- the blip voice ----------

/**
 * Plays a track: call `update(now)` each frame for the mouth. With an
 * AudioContext it also speaks — one short blip per letter, a sawtooth at the
 * puppet's pitch through two band-passes at the letter's vowel formants;
 * consonants get a breath of filtered noise.
 */
export class Player {
  constructor({ ctx = null, pitch = 260, rate = 1, gain = 0.18 } = {}) {
    this.ctx = ctx; this.pitch = pitch; this.rate = rate; this.gain = gain;
    this.tr = null; this.start = 0; this.done = true; this.fired = 0; this.voiced = 0;
    this.onEvent = null;
  }
  say(text, now) {
    this.tr = track(text, { rate: this.rate });
    this.start = now; this.done = false; this.fired = 0; this.voiced = 0;
    return this.tr;
  }
  stop() { this.done = true; this.tr = null; }
  update(now) {
    if (this.done || !this.tr) return { open: 0, round: 0, talking: false };
    const at = now - this.start;
    while (this.fired < this.tr.events.length && this.tr.events[this.fired].t <= at) this.onEvent?.(this.tr.events[this.fired++].kind);
    while (this.voiced < this.tr.segs.length && this.tr.segs[this.voiced].t <= at) this.blip(this.tr.segs[this.voiced++]);
    if (at > this.tr.dur) { this.done = true; return { open: 0, round: 0, talking: false }; }
    const m = mouthAt(this.tr, at);
    return { open: m.open, round: m.round, talking: true };
  }
  blip(seg) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime, d = Math.max(0.05, seg.dur * 0.95);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(this.gain, t0 + 0.008);
    out.gain.exponentialRampToValueAtTime(0.0008, t0 + d);
    out.connect(ctx.destination);
    const vowel = FORMANTS[seg.ch] ? seg.ch : null;
    if (vowel || seg.open > 0.2) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      // A little melody: each letter nudges the pitch, questions rise.
      const step = ((seg.ch.charCodeAt(0) * 7) % 9 - 4) * 0.035;
      osc.frequency.setValueAtTime(this.pitch * (1 + step), t0);
      osc.frequency.linearRampToValueAtTime(this.pitch * (1 + step) * 1.04, t0 + d);
      for (const f of FORMANTS[vowel || '_']) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6;
        osc.connect(bp); bp.connect(out);
      }
      osc.start(t0); osc.stop(t0 + d + 0.02);
    } else {
      const n = Math.floor(ctx.sampleRate * d), buf = ctx.createBuffer(1, n, ctx.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * 0.5;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = SHUT_FREQ(seg.ch); hp.Q.value = 1.2;
      src.connect(hp); hp.connect(out); src.start(t0);
    }
  }
}
const SHUT_FREQ = (ch) => ('sz'.includes(ch) ? 5000 : 'tkc'.includes(ch) ? 3000 : 1600);

// ---------- the microphone ----------

/** Follows a microphone. `level(now)` → { open, round, talking }. */
export class Mic {
  static async open(ctx) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    return new Mic(ctx, stream);
  }
  constructor(ctx, stream) {
    this.ctx = ctx; this.stream = stream;
    this.src = ctx.createMediaStreamSource(stream);
    this.an = ctx.createAnalyser(); this.an.fftSize = 1024; this.an.smoothingTimeConstant = 0.4;
    this.src.connect(this.an);
    this.buf = new Float32Array(this.an.fftSize);
    this.spec = new Uint8Array(this.an.frequencyBinCount);
    this.sensitivity = 1; this.floor = 0.012;
  }
  read() {
    this.an.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (const v of this.buf) s += v * v;
    const rms = Math.sqrt(s / this.buf.length);
    // Track the room's noise floor slowly; speech is what rises above it.
    if (rms < this.floor * 1.5) this.floor += (rms - this.floor) * 0.02;
    const lvl = Math.max(0, (rms - this.floor * 1.6) * 14 * this.sensitivity);
    this.an.getByteFrequencyData(this.spec);
    let num = 0, den = 0;
    for (let i = 2; i < this.spec.length; i++) { num += i * this.spec[i]; den += this.spec[i]; }
    const centroid = den ? num / den / this.spec.length : 0.2;
    return { open: Math.min(1, lvl), round: Math.max(0, Math.min(1, (0.16 - centroid) * 8)), talking: lvl > 0.06 };
  }
  close() { for (const t of this.stream.getTracks()) t.stop(); this.src.disconnect(); }
}

// ---------- the browser's own voice ----------

/**
 * Says text with speechSynthesis. The mouth can't hear it, so it reads along:
 * each word boundary starts a track for that word, sized to the voice's rate.
 */
export class Speaker {
  constructor({ pitch = 1, rate = 1, voice = null } = {}) {
    this.pitch = pitch; this.rate = rate; this.voice = voice;
    this.tr = null; this.start = 0; this.speaking = false; this.onEvent = null;
  }
  static available() { return typeof speechSynthesis !== 'undefined'; }
  say(text, nowFn) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = this.pitch; u.rate = this.rate;
    if (this.voice) u.voice = this.voice;
    this.speaking = true;
    const words = [...text.matchAll(/\S+/g)];
    let wi = 0;
    const start = (i) => {
      const w = words[i]?.[0] || '';
      this.tr = track(w, { rate: this.rate * 0.85 });
      this.start = nowFn();
      if (/!/.test(w)) this.onEvent?.('hop');
      if (/\?/.test(w)) this.onEvent?.('tilt');
    };
    u.onboundary = (e) => {
      if (e.name && e.name !== 'word') return;
      while (wi < words.length - 1 && words[wi + 1].index <= e.charIndex) wi++;
      start(wi);
    };
    u.onstart = () => start(0);
    u.onend = u.onerror = () => { this.speaking = false; this.tr = null; };
    speechSynthesis.speak(u);
  }
  stop() { if (Speaker.available()) speechSynthesis.cancel(); this.speaking = false; this.tr = null; }
  update(now) {
    if (!this.speaking || !this.tr) return { open: 0, round: 0, talking: this.speaking };
    const m = mouthAt(this.tr, now - this.start);
    return { open: m.open, round: m.round, talking: true };
  }
}
