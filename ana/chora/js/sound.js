// PARTICLE-CHORA's sound. A settled swarm vibrates in its modes (particles.js `modes`): each a frequency ω (radians per
// simulation step) and a shape. Kick it and every mode rings with the part of the kick along its shape. This renders
// that ring: one decaying sine per mode, its pitch proportional to ω, panned by how much of its motion runs along your
// w (your space on the left, ana and kata on the right; a shape that moves in all four directions evenly sits in the
// middle). The simulation's own drag rings a mode out in about 60 steps; the sound is slowed so you can hear it, and its
// ring scales with that drag. A hiss follows the swarm's motion while it settles.

/** Hz per radian-per-step: the 16-cell's notes land between about 230 and 960 Hz, the 600-cell's from 43 to 1240. */
export const HZ = 1600;

export class Bell {
  constructor() {
    const C = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.out = C.createGain(); this.out.gain.value = 0.9; this.out.connect(C.destination);
    // the settling hiss: looped noise through a low-pass, its level set each frame
    const n = C.sampleRate * 2, b = C.createBuffer(1, n, C.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = C.createBufferSource(); src.buffer = b; src.loop = true;
    this.lp = C.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 600;
    this.hissGain = C.createGain(); this.hissGain.gain.value = 0;
    src.connect(this.lp).connect(this.hissGain).connect(this.out); src.start();
  }
  /** The hiss's level and brightness, from the swarm's mean speed (0 when still). */
  hiss(speed) {
    const t = this.ctx.currentTime, g = Math.min(0.06, speed * 0.9);
    this.hissGain.gain.setTargetAtTime(g, t, 0.08); this.lp.frequency.setTargetAtTime(300 + Math.min(4000, speed * 40000), t, 0.08);
  }
  /** Ring a set of partials [{ hz, amp, pan, decay? }] (decay: seconds to 1/e, else the default). Partials at one
   *  pitch are merged. */
  ring(parts, decay = 1.2) {
    const C = this.ctx, merged = new Map();
    for (const p of parts) { if (!(p.hz > 20 && p.hz < 8000) || !p.amp) continue; const k = Math.round(p.hz * 4); const m = merged.get(k) || { hz: p.hz, e: 0, pe: 0, d: p.decay ?? decay }; m.e += p.amp * p.amp; m.pe += p.amp * p.amp * p.pan; merged.set(k, m); }
    const list = [...merged.values()]; if (!list.length) return 0;
    const len = Math.min(5, Math.max(...list.map((m) => m.d)) * 4 + 0.05), N = Math.floor(C.sampleRate * len), buf = C.createBuffer(2, N, C.sampleRate), L = buf.getChannelData(0), R = buf.getChannelData(1);
    for (const m of list) {
      const a = Math.sqrt(m.e), pan = m.pe / m.e, gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4), w = (2 * Math.PI * m.hz) / C.sampleRate, k = Math.exp(-1 / (m.d * C.sampleRate));
      let env = a, ph = 0; const att = Math.floor(C.sampleRate * 0.004);
      for (let i = 0; i < N; i++) { const v = Math.sin(ph) * env * (i < att ? i / att : 1); L[i] += v * gl; R[i] += v * gr; ph += w; env *= k; }
    }
    let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const s = 0.35 / (peak || 1); for (let i = 0; i < N; i++) { L[i] *= s; R[i] *= s; }
    const src = C.createBufferSource(); src.buffer = buf; src.connect(this.out); src.start();
    return list.length;
  }
  /** Play two channels recorded at `rate` samples a second (the live voice: one simulation step a sample). Takes out
   *  the slow drift (a one-pole high-pass at 20 Hz), fades the ends, and normalises. */
  play(L, R, rate) {
    const C = this.ctx, N = L.length, buf = C.createBuffer(2, N, rate), out = [buf.getChannelData(0), buf.getChannelData(1)];
    const a = Math.exp((-2 * Math.PI * 20) / rate);
    [L, R].forEach((x, ch) => { let y = 0, px = 0; for (let i = 0; i < N; i++) { y = a * (y + x[i] - px); px = x[i]; out[ch][i] = y; } });
    let peak = 0; for (const o of out) for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(o[i]));
    const fade = Math.min(N >> 2, Math.floor(rate * 0.25)), g = 0.35 / (peak || 1);
    for (const o of out) for (let i = 0; i < N; i++) o[i] *= g * (i < 32 ? i / 32 : 1) * (i > N - fade ? (N - i) / fade : 1);
    const src = C.createBufferSource(); src.buffer = buf; src.connect(this.out); src.start();
  }
}

/** Snap a frequency to a scale on C. 'true': as it is; 'equal': the nearest semitone; 'pentatonic': C D E G A;
 *  'just': the just-intonation C major scale (1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8). */
export function tune(hz, scale) {
  if (scale === 'true' || !(hz > 0)) return hz;
  const C0 = 16.351597831287414;                                         // C0, equal temperament, A4 = 440
  const oct = Math.floor(Math.log2(hz / C0)), base = C0 * 2 ** oct;
  const steps = scale === 'equal' ? [...Array(12).keys()].map((k) => 2 ** (k / 12)) : scale === 'pentatonic' ? [0, 2, 4, 7, 9].map((k) => 2 ** (k / 12)) : [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];
  let best = hz, bd = Infinity; for (const r of [...steps, 2]) { const f = base * r, d = Math.abs(Math.log(f / hz)); if (d < bd) { bd = d; best = f; } }
  return best;
}
