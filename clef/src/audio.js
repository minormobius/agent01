// audio.js — hearing what is written.
//
// The point of preview playback on a notation site is not fidelity, it is
// PROOFREADING: you play a bar back to find out whether what you typed is what
// you meant. That sets the priorities — the pitch and the rhythm have to be
// exactly right, the timbre only has to be pleasant enough not to fight you.
//
// So: a small bank of additive/subtractive patches over WebAudio primitives, a
// lookahead scheduler (setTimeout wakes up at whatever rate the browser feels
// like; the audio clock does not, so all timing is expressed against
// ctx.currentTime and nothing is scheduled from a timer callback directly), and
// a generated reverb so a solo line does not sound like it is being played
// inside a shoebox.

import { WHOLE, freqOf } from './model.js';

const QUARTER = WHOLE / 4;

// --------------------------------------------------------------- the bank --
//
// A patch is a set of partials plus an envelope. `decayTo` distinguishes the
// two families that matter musically: struck instruments (piano, harpsichord,
// music box) decay to silence whether or not you hold the key, while blown and
// bowed ones (organ, strings, flute) hold until released. Getting that one
// number wrong is what makes synthesised notation sound like a doorbell.
export const PATCHES = {
  piano: {
    label: 'Piano',
    partials: [
      { ratio: 1, gain: 1.0, type: 'triangle' },
      { ratio: 2, gain: 0.30, type: 'sine' },
      { ratio: 3, gain: 0.11, type: 'sine' },
      { ratio: 4.02, gain: 0.05, type: 'sine' },
    ],
    attack: 0.004, decayTo: 0.0, decay: 2.6, release: 0.22,
    cutoff: (f) => Math.min(9000, f * 8 + 900), q: 0.6, strike: 0.05,
  },
  harpsichord: {
    label: 'Harpsichord',
    partials: [
      { ratio: 1, gain: 0.8, type: 'sawtooth' },
      { ratio: 2, gain: 0.25, type: 'square' },
    ],
    attack: 0.002, decayTo: 0.0, decay: 1.1, release: 0.12,
    cutoff: (f) => Math.min(11000, f * 11 + 1400), q: 1.1, strike: 0.09,
  },
  musicbox: {
    label: 'Music box',
    partials: [
      { ratio: 1, gain: 0.9, type: 'sine' },
      { ratio: 3.01, gain: 0.28, type: 'sine' },
      { ratio: 5.4, gain: 0.12, type: 'sine' },
    ],
    attack: 0.002, decayTo: 0.0, decay: 1.5, release: 0.3,
    cutoff: () => 12000, q: 0.4, strike: 0.03,
  },
  organ: {
    label: 'Organ',
    partials: [
      { ratio: 1, gain: 0.7, type: 'sine' },
      { ratio: 2, gain: 0.42, type: 'sine' },
      { ratio: 3, gain: 0.22, type: 'sine' },
      { ratio: 4, gain: 0.16, type: 'sine' },
      { ratio: 8, gain: 0.07, type: 'sine' },
    ],
    attack: 0.02, decayTo: 0.82, decay: 0.15, release: 0.09,
    cutoff: (f) => Math.min(9000, f * 9 + 800), q: 0.3,
  },
  strings: {
    label: 'Strings',
    partials: [
      { ratio: 1, gain: 0.55, type: 'sawtooth' },
      { ratio: 1.003, gain: 0.45, type: 'sawtooth' },
      { ratio: 2, gain: 0.12, type: 'sine' },
    ],
    attack: 0.13, decayTo: 0.86, decay: 0.35, release: 0.28,
    cutoff: (f) => Math.min(6000, f * 6 + 500), q: 0.9, vibrato: { rate: 5.1, cents: 7, delay: 0.25 },
  },
  flute: {
    label: 'Flute',
    partials: [
      { ratio: 1, gain: 0.85, type: 'sine' },
      { ratio: 2, gain: 0.09, type: 'sine' },
      { ratio: 3, gain: 0.03, type: 'triangle' },
    ],
    attack: 0.07, decayTo: 0.9, decay: 0.2, release: 0.14,
    cutoff: (f) => Math.min(7000, f * 7 + 700), q: 0.4, breath: 0.055,
    vibrato: { rate: 5.6, cents: 9, delay: 0.3 },
  },
  sine: {
    label: 'Sine',
    partials: [{ ratio: 1, gain: 1, type: 'sine' }],
    attack: 0.008, decayTo: 0.85, decay: 0.2, release: 0.1,
    cutoff: () => 16000, q: 0.1,
  },
};

// ---------------------------------------------------- score -> note events --

/**
 * Flatten an engraved score into notes to play.
 *
 * Two transformations happen here and nowhere else:
 *   • TIES are merged. A tie is one sound written as two notes; playing it as
 *     two is the single most audible way to get a preview wrong.
 *   • REPEATS are expanded, so the playback is the performance rather than the
 *     page. A score with `\alternative` endings is played straight through
 *     instead — see the note below.
 */
export function scoreToNotes(score, opts = {}) {
  const notes = [];
  const expandRepeats = opts.repeats !== false;

  for (let si = 0; si < score.staves.length; si++) {
    for (let vi = 0; vi < score.staves[si].voices.length; vi++) {
      const events = score.staves[si].voices[vi];
      let clefShift = 0;
      const pending = new Map(); // midi -> index of a note waiting to be extended
      for (const e of events) {
        if (e.kind === 'clef') {
          clefShift = ({ treble_8: -12, tenorG: -12, bass_8: -12 })[e.value] ?? 0;
          continue;
        }
        if (e.kind !== 'note') continue;
        for (const p of e.pitches) {
          const midi = 12 * (p.octave + 1) + [0, 2, 4, 5, 7, 9, 11][p.step] + p.alter + clefShift;
          const held = pending.get(midi);
          if (held !== undefined && notes[held].tick + notes[held].ticks === e.tick) {
            notes[held].ticks += e.ticks;
            if (!(e.tie || p.tie)) pending.delete(midi);
            continue;
          }
          const idx = notes.length;
          notes.push({
            tick: e.tick, ticks: e.ticks, midi, staff: si, voice: vi,
            velocity: dynamicToVelocity(e.dynamic), src: e.src,
          });
          if (e.tie || p.tie) pending.set(midi, idx); else pending.delete(midi);
        }
      }
    }
  }
  notes.sort((a, b) => a.tick - b.tick || a.midi - b.midi);

  // Dynamics are written once and hold until the next one, per voice.
  const lastDyn = new Map();
  for (const n of notes) {
    const key = `${n.staff}/${n.voice}`;
    if (n.velocity != null) lastDyn.set(key, n.velocity);
    else n.velocity = lastDyn.get(key) ?? 0.72;
  }

  const end = notes.reduce((a, n) => Math.max(a, n.tick + n.ticks), 0);
  const segments = expandRepeats ? repeatSegments(score, end) : [{ from: 0, to: end }];
  return { notes, segments, end };
}

const DYN_VELOCITY = {
  ppppp: 0.10, pppp: 0.14, ppp: 0.20, pp: 0.30, p: 0.42, mp: 0.55,
  mf: 0.68, f: 0.82, ff: 0.93, fff: 1.0, ffff: 1.0, fffff: 1.0,
  fp: 0.85, sf: 0.95, sff: 1.0, sfz: 0.98, sp: 0.4, spp: 0.3, rfz: 0.95, n: 0.6,
};
const dynamicToVelocity = (d) => (d ? (DYN_VELOCITY[d] ?? 0.7) : null);

/**
 * Expand repeat bar lines into the order the music is actually played in.
 *
 * Volta endings are deliberately NOT handled: `\alternative` would need each
 * pass to take a different branch, and getting that half-right plays the wrong
 * notes rather than merely the wrong number of times. When a score has voltas
 * this returns a single straight-through segment, which plays every bar once,
 * in written order — wrong about repetition, right about every note.
 */
function repeatSegments(score, end) {
  const marks = [];
  let hasVolta = false;
  for (const st of score.staves) {
    for (const v of st.voices) {
      for (const e of v) {
        if (e.kind === 'volta') hasVolta = true;
        if (e.kind === 'barline' && (e.style === 'repeat-start' || e.style === 'repeat-end')) {
          marks.push({ tick: e.tick, style: e.style, times: e.times ?? 2 });
        }
      }
    }
  }
  if (hasVolta || !marks.length) return [{ from: 0, to: end }];

  const seen = new Set();
  const uniq = marks.filter((m) => {
    const k = `${m.tick}/${m.style}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => a.tick - b.tick);

  const segments = [];
  let cursor = 0;
  let openStart = 0;
  for (const m of uniq) {
    if (m.style === 'repeat-start') { openStart = m.tick; continue; }
    if (m.tick <= cursor) continue;
    segments.push({ from: cursor, to: m.tick });
    for (let k = 1; k < Math.max(2, m.times); k++) segments.push({ from: openStart, to: m.tick });
    cursor = m.tick;
    openStart = m.tick;
  }
  if (cursor < end) segments.push({ from: cursor, to: end });
  return segments.length ? segments : [{ from: 0, to: end }];
}

/** Lay the segments end to end: performance-time notes, each keeping its source tick. */
export function performance(flat, tempo) {
  const secPerTick = 60 / (tempo.bpm * (tempo.unit / QUARTER)) / QUARTER;
  const out = [];
  let offset = 0;
  for (const seg of flat.segments) {
    for (const n of flat.notes) {
      if (n.tick < seg.from || n.tick >= seg.to) continue;
      out.push({
        ...n,
        at: (offset + (n.tick - seg.from)) * secPerTick,
        dur: Math.min(n.ticks, seg.to - n.tick + n.ticks) * secPerTick,
        srcTick: n.tick,
      });
    }
    offset += seg.to - seg.from;
  }
  out.sort((a, b) => a.at - b.at);
  return { events: out, duration: offset * secPerTick, secPerTick };
}

// --------------------------------------------------------------- the synth --

/** Build one note into an audio graph. Shared by live playback and WAV export. */
export function renderNote(ctx, dest, patch, midi, at, dur, velocity) {
  const f = freqOf(midi);
  const p = patch;
  const held = Math.max(0.04, dur);
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.max(200, p.cutoff(f)), at);
  filter.Q.value = p.q ?? 0.5;
  filter.connect(gain);
  gain.connect(dest);

  const peak = Math.max(0.02, velocity) * 0.22;
  const g = gain.gain;
  g.setValueAtTime(0.0001, at);
  g.exponentialRampToValueAtTime(peak, at + p.attack);
  let stop;
  if (p.decayTo <= 0) {
    // Struck: one long decay, cut short only if the note is longer than the
    // sound. `setTargetAtTime` is the right primitive — it is the exponential
    // an unstopped string actually follows.
    const tau = p.decay * (1.6 - Math.min(1.1, midi / 90));
    g.setTargetAtTime(0.0001, at + p.attack, Math.max(0.08, tau / 3));
    stop = at + Math.min(held + p.release, p.attack + tau * 2.2);
  } else {
    g.setTargetAtTime(peak * p.decayTo, at + p.attack, p.decay);
    g.setValueAtTime(Math.max(0.0002, peak * p.decayTo), at + held);
    g.exponentialRampToValueAtTime(0.0001, at + held + p.release);
    stop = at + held + p.release + 0.02;
  }

  const nodes = [];
  let lfo = null;
  if (p.vibrato) {
    lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(p.vibrato.rate, at);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(p.vibrato.cents, at + p.vibrato.delay + 0.2);
    lfo.connect(depth);
    lfo.start(at);
    lfo.stop(stop);
    nodes.push({ node: lfo, depth });
  }

  for (const part of p.partials) {
    const osc = ctx.createOscillator();
    osc.type = part.type;
    osc.frequency.setValueAtTime(f * part.ratio, at);
    if (lfo) nodes[0].depth.connect(osc.detune);
    const og = ctx.createGain();
    og.gain.setValueAtTime(part.gain, at);
    osc.connect(og);
    og.connect(filter);
    osc.start(at);
    osc.stop(stop);
  }

  // A short filtered noise burst at the attack: the hammer, the quill, the
  // breath. It is what stops additive tones sounding like a test signal.
  const noiseAmt = p.strike ?? p.breath ?? 0;
  if (noiseAmt > 0) {
    const len = Math.ceil(ctx.sampleRate * (p.breath ? Math.min(held, 2) : 0.06));
    const buf = ctx.createBuffer(1, Math.max(1, len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const nf = ctx.createBiquadFilter();
    nf.type = p.breath ? 'bandpass' : 'highpass';
    nf.frequency.setValueAtTime(p.breath ? f * 2 : Math.min(8000, f * 4), at);
    nf.Q.value = p.breath ? 1.4 : 0.7;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(noiseAmt * velocity, at);
    if (!p.breath) ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.055);
    else {
      ng.gain.setValueAtTime(0.0001, at);
      ng.gain.linearRampToValueAtTime(noiseAmt * velocity, at + p.attack);
      ng.gain.setValueAtTime(noiseAmt * velocity, at + held);
      ng.gain.exponentialRampToValueAtTime(0.0001, at + held + p.release);
    }
    src.connect(nf); nf.connect(ng); ng.connect(dest);
    src.start(at);
    src.stop(stop);
  }
  return stop;
}

/** A short exponentially-decaying noise impulse: a plausible small hall. */
export function makeReverb(ctx, seconds = 1.5, decay = 3.2) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

/**
 * Tell the OS this page is playing music, not decorating itself with sound.
 *
 * iOS gives a bare AudioContext the `ambient` audio session category. Ambient
 * output is governed by the Ring/Silent switch and rides the RINGER volume, so
 * on a silenced phone the speaker plays nothing at all — while headphones and
 * AirPods, which that switch does not mute, play normally. The bug therefore
 * looks like a broken speaker and reproduces on no desktop browser.
 *
 * `playback` is the category Apple Music and every other media app declares: it
 * ignores the switch and rides the media volume. Set it before constructing the
 * context — that ordering is correct whether or not the category is latched at
 * construction, and the reverse ordering is only correct if it is not.
 *
 * Only reached from ensure(), i.e. from a user gesture that is about to make
 * sound. Claiming a playback session pauses whatever else the phone is
 * playing, which is right when the user pressed play and rude on page load.
 */
function claimPlaybackSession() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch { /* leave it ambient rather than throw on the way to playing */ }
}

/**
 * True when we are on the platform that has the silent-switch problem and have
 * no way to fix it (WebKit before the audioSession API). The caller says so
 * once, because otherwise the page looks broken in a way the user cannot
 * diagnose: no error, no sound, and sound the moment they put headphones in.
 */
export function silentSwitchMayMute() {
  if (navigator.audioSession) return false;
  const touch = navigator.maxTouchPoints > 1;
  return touch && /Safari/.test(navigator.userAgent) && !/Chrom/.test(navigator.userAgent);
}

/**
 * Live playback.
 *
 * The scheduler pushes notes into the audio graph a fixed distance ahead of the
 * audio clock and no further. Anything else — scheduling on a timer tick,
 * scheduling the whole piece up front — either drifts audibly or makes stopping
 * take as long as the piece.
 */
export class Player {
  constructor() {
    this.ctx = null;
    this.perf = null;
    this.patch = PATCHES.piano;
    this.playing = false;
    this.index = 0;
    this.startedAt = 0;
    this.startOffset = 0;
    this.timer = null;
    this.onTick = null;
    this.onEnd = null;
    this.lookahead = 0.14;
    this.volume = 0.85;
  }

  ensure() {
    if (!this.ctx) {
      claimPlaybackSession();
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.dry = this.ctx.createGain();
      this.wet = this.ctx.createGain();
      this.wet.gain.value = 0.19;
      this.reverb = makeReverb(this.ctx);
      this.dry.connect(this.master);
      this.wet.connect(this.reverb);
      this.reverb.connect(this.master);
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  load(perf) {
    this.perf = perf;
  }

  /** Play a single note now — the preview when you click or enter a pitch. */
  preview(midi, dur = 0.5, velocity = 0.75) {
    const ctx = this.ensure();
    renderNote(ctx, this.dry, this.patch, midi, ctx.currentTime + 0.01, dur, velocity);
    renderNote(ctx, this.wet, this.patch, midi, ctx.currentTime + 0.01, dur, velocity * 0.6);
  }

  play(fromSeconds = 0) {
    if (!this.perf || !this.perf.events.length) return;
    const ctx = this.ensure();
    this.stop(true);
    this.playing = true;
    this.startOffset = fromSeconds;
    this.startedAt = ctx.currentTime + 0.06;
    this.index = this.perf.events.findIndex((e) => e.at >= fromSeconds);
    if (this.index < 0) this.index = this.perf.events.length;
    this.pump();
  }

  pump() {
    if (!this.playing) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const horizon = now - this.startedAt + this.startOffset + this.lookahead;
    while (this.index < this.perf.events.length && this.perf.events[this.index].at <= horizon) {
      const e = this.perf.events[this.index++];
      const at = this.startedAt + (e.at - this.startOffset);
      renderNote(ctx, this.dry, this.patch, e.midi, Math.max(now, at), e.dur, e.velocity);
      renderNote(ctx, this.wet, this.patch, e.midi, Math.max(now, at), e.dur, e.velocity * 0.55);
    }
    const elapsed = now - this.startedAt + this.startOffset;
    if (this.onTick) this.onTick(elapsed);
    if (elapsed > this.perf.duration + 0.9) {
      this.stop();
      if (this.onEnd) this.onEnd();
      return;
    }
    this.timer = setTimeout(() => this.pump(), 25);
  }

  get position() {
    if (!this.playing || !this.ctx) return this.startOffset;
    return this.ctx.currentTime - this.startedAt + this.startOffset;
  }

  stop(quiet = false) {
    this.playing = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!quiet && this.ctx) {
      // Ramp rather than cut: yanking the master gain to zero clicks.
      const g = this.master.gain;
      const t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.0001, t + 0.06);
      setTimeout(() => { if (this.master) this.master.gain.setValueAtTime(this.volume, this.ctx.currentTime); }, 90);
    }
  }
}

// ----------------------------------------------------------------- export --

/** Render the whole performance offline and return a 16-bit stereo WAV blob. */
export async function renderWav(perf, patchName, onProgress) {
  const patch = PATCHES[patchName] ?? PATCHES.piano;
  const rate = 44100;
  const seconds = Math.max(1, perf.duration + 2.5);
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OfflineCtx(2, Math.ceil(seconds * rate), rate);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  wet.gain.value = 0.19;
  const rev = makeReverb(ctx);
  dry.connect(master);
  wet.connect(rev);
  rev.connect(master);
  master.connect(ctx.destination);
  for (const e of perf.events) {
    renderNote(ctx, dry, patch, e.midi, e.at + 0.05, e.dur, e.velocity);
    renderNote(ctx, wet, patch, e.midi, e.at + 0.05, e.dur, e.velocity * 0.55);
  }
  if (onProgress) onProgress(0.1);
  const buffer = await ctx.startRendering();
  if (onProgress) onProgress(0.9);
  return wavBlob(buffer);
}

function wavBlob(buffer) {
  const chans = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = 44 + frames * chans * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const str = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, bytes - 8, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, chans, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * chans * 2, true);
  view.setUint16(32, chans * 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, frames * chans * 2, true);
  const data = [];
  for (let c = 0; c < chans; c++) data.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < chans; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}
