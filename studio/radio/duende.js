// duende.js — a body that listens. One of the attractor bodies (../avatar/), moved by what the radio
// actually plays rather than by where its dials are set: every note struck reaches it, as it sounds.
//
//   the piano is its right side, the guitar its left: a note lifts and lights that arm, more as it is
//     struck harder; the head turns to whoever spoke last; the low notes light the legs, the high ones
//     the head; so when the two trade bars, the two sides answer each other;
//   loudness is how far its points run out into their orbits (the attractors' "thought"), and how high
//     its arms are carried;
//   the tension of the chord sounding contorts it: the spine arches and twists, the orbits widen;
//   the light of the mode sounding is its colour, from violet in Phrygian to gold in Lydian;
//   the style sounding is its manner: in flamenco the arms are carried high and curved (braceo) and the
//     heel strikes the accents; in jazz the shoulders bounce on the swung off-beat.
import { makeRig, solve } from '../vendor/figure/lib/rig.js';
import { POSES } from '../vendor/figure/lib/poses.js';
import { character, build, frames } from '../vendor/attractor/lib/avatar.js';
import { makeLight, drawAvatar } from '../vendor/attractor/lib/draw.js';

// dark to bright: the colours the mode's light runs through (body, head)
const RAMP = [
  [[0.55, 0.3, 1], [0.95, 0.7, 1]], [[0.2, 0.62, 1], [0.7, 0.92, 1]], [[0.25, 0.95, 0.75], [0.8, 1, 0.85]],
  [[1, 0.45, 0.35], [1, 0.75, 0.62]], [[1, 0.55, 0.2], [1, 0.8, 0.5]], [[1, 0.8, 0.3], [1, 0.96, 0.72]],
];
const ARM_R = [3, 5, 7], ARM_L = [2, 4, 6], LEGS = [8, 9, 10, 11, 12, 13];
const FLAM = new Set(['buleria', 'falseta']), JAZZ = new Set(['swing', 'ballad']);

export class Duende {
  constructor(canvas, seed = 1) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.setSeed(seed);
    // what it has heard, as envelopes (each decays toward rest)
    this.env = { piano: 0, guitar: 0, low: 0, high: 0, loud: 0, accent: 0 };
    this.slow = { tense: 0.2, bright: 0.5, flam: 0, jazz: 0, loud: 0, side: 0 };
    this.bar = null; this.lastSide = 0; this.last = 0;
  }
  setSeed(seed) {
    // the threads style reads best at speed: a character of the seed, made a little leaner
    const ch = character(seed, { style: 'threads', points: 900, streak: 26, lagStep: 0.018 });
    this.A = build(ch); this.rig = makeRig(ch.body); this.base = POSES.stand(this.rig);
    this.reach0 = ch.reach; this.colours = this.A.colours.map((c) => [...c]);
    this.light = null; this.size();
  }
  size() {
    const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(this.cv.clientWidth * dpr), h = Math.round(this.cv.clientHeight * dpr);
    if (w && h && (w !== this.cv.width || h !== this.cv.height || !this.light)) { this.cv.width = w; this.cv.height = h; this.light = makeLight(w, h); }
  }
  /** A note, as it sounds: { midi, inst, v, dur }. */
  hear(n) {
    const v = Math.min(1, n.v * (n.inst ? 1.1 : 1.4)), E = this.env;
    if (n.inst === 0) E.piano = Math.min(1.6, E.piano + 0.55 * v); else E.guitar = Math.min(1.6, E.guitar + 0.55 * v);
    if (n.midi < 52) E.low = Math.min(1.5, E.low + 0.6 * v);
    if (n.midi > 74) E.high = Math.min(1.5, E.high + 0.5 * v);
    E.loud = Math.min(2, E.loud + 0.22 * v);
    if (v > 0.6) E.accent = 1;
    this.lastSide = n.inst === 0 ? 1 : -1;
  }
  /** A bar, as it begins: its info from the composer. */
  barBegins(info, now) { this.bar = { ...info, at: now }; }

  #pose(now) {
    const b = this.base, S = this.slow, E = this.env, bar = this.bar;
    const beatLen = bar ? bar.sec / 4 : 0.75, ph = bar ? (now - bar.at) / beatLen : now / 0.75;
    const beat = ph - Math.floor(ph), sway = Math.sin(Math.PI * ph) * 0.06 * (0.4 + S.loud);
    const bounce = S.jazz * Math.max(0, Math.cos(2 * Math.PI * (beat - 0.67))) * 0.05;   // the swung off-beat
    const carry = 0.25 + 0.9 * S.loud + 0.9 * S.flam;                                    // arms carried higher as it plays out
    const curve = 0.25 + 1.1 * S.flam + 0.3 * S.tense;
    const wrist = Math.sin(now * 2.1) * 0.25 * S.flam;
    const tw = S.side * 0.35 + (S.tense - 0.3) * 0.25 * Math.sin(now * 0.7);
    const pos = b.root.pos;
    return {
      ...b,
      root: { pos: [pos[0] + sway, pos[1] - bounce - 0.04 * E.accent * S.flam, pos[2]], roll: sway * 0.8, yaw: tw * 0.4 },
      spine: { bend: -0.32 * S.tense + 0.08 * (1 - S.loud), side: 0.18 * (E.piano - E.guitar) * 0.5 + sway * 0.6, twist: tw },
      head: { pitch: -0.35 * Math.min(1, E.high) + 0.12 * (1 - S.bright), yaw: 0.45 * S.side, roll: 0.12 * Math.sin(Math.PI * ph * 0.5) },
      arms: {
        r: { raise: 0.2 + carry * 0.9 + 1.1 * Math.min(1.2, E.piano), out: 1.3 + 0.25 * E.piano + wrist, elbow: curve + 0.2 * Math.sin(now * 1.3), gesture: S.flam > 0.5 ? 'open' : 'relaxed' },
        l: { raise: 0.2 + carry * 0.9 + 1.1 * Math.min(1.2, E.guitar), out: 1.3 + 0.25 * E.guitar - wrist, elbow: curve + 0.2 * Math.sin(now * 1.1 + 1), gesture: S.flam > 0.5 ? 'open' : 'relaxed' },
      },
      legs: { l: { ...b.legs.l }, r: { ...b.legs.r, pivot: 'ball', pitch: -0.45 * E.accent * S.flam - 0.15 * bounce * 8 } },
    };
  }

  /** Draw it at audio time `now` (seconds); `dt` since the last frame. */
  frame(now, dt) {
    this.size();
    const S = this.slow, E = this.env, bar = this.bar, A = this.A, cv = this.cv, ctx = this.ctx;
    // the envelopes fall back; the slow readings ease toward the bar that is sounding
    const fall = (x, rate) => x * Math.exp(-rate * dt);
    E.piano = fall(E.piano, 2.2); E.guitar = fall(E.guitar, 2.2); E.low = fall(E.low, 2.5); E.high = fall(E.high, 2); E.loud = fall(E.loud, 1.4); E.accent = fall(E.accent, 7);
    const ease = (a, b, rate) => a + (b - a) * (1 - Math.exp(-rate * dt));
    if (bar) {
      S.tense = ease(S.tense, bar.tense, 1.5); S.bright = ease(S.bright, bar.bright, 0.8);
      S.flam = ease(S.flam, FLAM.has(bar.texture) ? 1 : 0, 0.7); S.jazz = ease(S.jazz, JAZZ.has(bar.texture) ? 1 : 0, 0.7);
    }
    S.loud = ease(S.loud, Math.min(1, E.loud / 1.2), 2.5); S.side = ease(S.side, this.lastSide, 1.6);
    // the light of the mode, as colour
    const f = Math.min(4.999, Math.max(0, S.bright * 5)), i0 = Math.floor(f), u = f - i0;
    this.A.colours.forEach((c, i) => { const w = i === 1 ? 1 : 0; for (let j = 0; j < 3; j++) c[j] = RAMP[i0][w][j] * (1 - u) + RAMP[i0 + 1][w][j] * u; });
    A.ch.reach = this.reach0 * (0.85 + 0.5 * S.tense + 0.25 * S.loud);

    const Sol = solve(this.rig, this.#pose(now)), F = frames(Sol.J, Sol.F.pelvis.z);
    const w = cv.width, h = cv.height, heads = A.ch.body.heads;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.7);
    g.addColorStop(0, '#120e18'); g.addColorStop(1, '#040306');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(w * 0.3, h * 0.94, w * 0.4, Math.max(1, h / 500));
    // an orthographic view, turning slowly about the front
    const yaw = 0.35 * Math.sin(now * 0.05) + 0.12, pitch = 0.1, scale = (h * 0.9) / (heads + 1.6);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), root = Sol.J.pelvis;
    const proj = (p) => { const x = p[0] - root[0], z = p[2] - root[2], X = x * cy + z * sy, Z = -x * sy + z * cy; return [w / 2 + X * scale, h * 0.94 - (p[1] * cp - Z * sp) * scale]; };
    const gain = Math.min(1.6, (900 / Math.sqrt(w * h)) * 1.25);
    const part = (k) => {
      let v = 0.65 + 0.3 * S.loud;
      if (ARM_R.includes(k)) v += 0.9 * E.piano; else if (ARM_L.includes(k)) v += 0.9 * E.guitar;
      else if (LEGS.includes(k)) v += 0.8 * E.low + 0.4 * E.accent * S.flam; else if (k === 1) v += 0.8 * E.high; else v += 0.3 * E.loud;
      return v;
    };
    drawAvatar(this.light, A, F, now, proj, { gain, m: 0.22 + 0.62 * S.loud + 0.1 * S.tense, partGain: part });
    this.light.flush(ctx);
  }
}
