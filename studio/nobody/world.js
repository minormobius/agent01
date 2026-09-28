// world.js — the history the film shows and sings: chapters replayed from snapshots, time-lapses from
// the census between them. The picture (render.js) and the choir (choir(), for score.js's vocal) read
// the same replay, so what you hear is who is alive in the frame.
//
// A chapter restores its snapshot (history.js) at its first second and steps the world 30 times a
// second: step k of a chapter happens at from + k/30, in the page, in the export and in the band worker
// alike (a restored world is deterministic). Seeking back restores again.

import { World, signature } from '../vendor/attractor/lib/organism.js';
import { makeEngine, makeConductor } from '../grown/sound.js';
import { HISTORY, SNAPSHOTS } from './history.js';
import { sec, B, duration } from './score.js';

export const SPS = 30;
/** The chapters: which snapshot, from when to when (seconds), and the step it shows. */
export const CHAPTERS = [
  { name: 'the founders', snap: 0, from: sec(B(1)), to: sec(B(17)), still: sec(B(5)) },
  { name: 'the biters', snap: 1, from: sec(B(21)), to: sec(B(33)) },
  { name: 'Quul', snap: 2, from: sec(B(37)), to: duration + 1 },
];
/** The time-lapses: which stretch of the history, from when to when. */
export const LAPSES = [
  { from: sec(B(17)), to: sec(B(21)), s0: HISTORY.snaps[0], s1: HISTORY.snaps[1] },
  { from: sec(B(33)), to: sec(B(37)), s0: HISTORY.snaps[1], s1: HISTORY.snaps[2] },
];
export const chapterAt = (t) => CHAPTERS.findIndex((c) => t >= c.from && t < c.to);
export const lapseAt = (t) => LAPSES.findIndex((l) => t >= l.from && t < l.to);

/** The census at history step s (fractional rows, interpolated): counts of the named species, and the rest. */
export function censusAt(s) {
  const x = Math.max(0, Math.min(HISTORY.rows.length - 1, s / HISTORY.every)), i = Math.floor(x), f = x - i, a = HISTORY.rows[i], b = HISTORY.rows[Math.min(i + 1, HISTORY.rows.length - 1)];
  return a.map((v, k) => v + (b[k] - v) * f);
}

/**
 * A replay: `at(t)` returns { W, chapter, f } with the world stepped to second t (f: the fraction past
 * its last step). `onStep(W)` is called after every step (the choir listens there). The camera's
 * target is smoothed per step, so it is the same at any frame rate.
 */
export class Replay {
  constructor({ onStep = null } = {}) { this.onStep = onStep; this.ch = -1; this.W = null; this.k = 0; this.cam = null; }
  at(t) {
    let ci = chapterAt(t);
    if (ci < 0) ci = t < CHAPTERS[0].from ? 0 : this.ch >= 0 ? this.ch : 0;
    const C = CHAPTERS[ci], start = C.still ?? C.from;
    const want = Math.max(0, Math.floor((Math.min(t, C.to) - start) * SPS));
    if (ci !== this.ch || want < this.k) {                    // a new chapter, or seeking back: restore
      this.W = World.restore(SNAPSHOTS[C.snap]); this.ch = ci; this.k = 0; this.cam = null; this.follow = null; this.onRestore?.(this.W, ci);
      this.aim();
    }
    while (this.k < want) { this.W.step(); this.k++; this.onStep?.(this.W); this.aim(); }
    return { W: this.W, chapter: ci, f: t >= start ? Math.min(1, (t - start) * SPS - this.k) : 0 };
  }
  /** Where the camera looks: the living's middle (in Quul's chapter, one Quul, until the coda). */
  aim() {
    const W = this.W; if (!W.bodies.length) return;
    let target, spread;
    if (this.ch === 2) {
      let q = this.follow != null && W.bodies.find((b) => b.id === this.follow);
      if (!q) { q = W.bodies.filter((b) => b.genome.name === 'Quul').sort((a, b) => b.grown - a.grown || a.id - b.id)[0]; this.follow = q?.id ?? null; }
      if (q) { target = q.p; spread = 9; }
    }
    if (!target) {
      const ps = W.bodies.map((b) => b.p); target = [0, 1, 2].map((i) => ps.reduce((a, p) => a + p[i], 0) / ps.length);
      const r = ps.map((p) => Math.hypot(p[0] - target[0], p[2] - target[2])).sort((a, b) => a - b); spread = Math.max(14, Math.min(this.ch === 0 ? 34 : 60, r[Math.floor(r.length * 0.6)] + 6));
    }
    if (!this.cam) this.cam = { t: target.slice(), spread };
    else { for (let i = 0; i < 3; i++) this.cam.t[i] += (target[i] - this.cam.t[i]) * 0.04; this.cam.spread += (spread - this.cam.spread) * 0.02; }
  }
}

/**
 * The choir, the world heard (grown/sound.js), for the whole film at `sampleRate`: mono. In the chapters
 * the conductor reads the replay step by step; in the time-lapses the named species sing from the
 * census, and each one that first appears in the stretch enters with its rising chime; the title is
 * the bass alone.
 */
export function choir(sampleRate, seconds = duration) {
  const E = makeEngine(sampleRate, { bpm: 96 }), n = Math.ceil(seconds * sampleRate), L = new Float32Array(n), R = new Float32Array(n);
  const C = makeConductor((m) => { E.state(m.state); for (const e of m.events) E.event(e); }, { signature });
  const replay = new Replay({ onStep: (W) => C.listen(W) });
  const block = Math.round(sampleRate / SPS), seen = new Set();
  for (let i0 = 0, k = 0; i0 < n; i0 += block, k++) {
    const t = i0 / sampleRate, li = lapseAt(t);
    if (t < CHAPTERS[0].still) E.state({ species: [], swim: 0, rich: 0.4 });
    else if (li >= 0) {
      const Lp = LAPSES[li], s = Lp.s0 + (Lp.s1 - Lp.s0) * ((t - Lp.from) / (Lp.to - Lp.from)), c = censusAt(s);
      if (k % 6 === 0) E.state({ species: HISTORY.species.map((sp, j) => ({ sig: sp.sig, count: Math.round(c[j]), organs: sp.sig.replace(/[^a-z]/g, '').length })).filter((x) => x.count > 0).sort((a, b) => b.count - a.count), swim: 0.4, rich: 0.5 });
      for (const sp of HISTORY.species) if (!seen.has(sp.sig) && sp.first > Lp.s0 && sp.first <= s) { seen.add(sp.sig); E.event({ type: 'new', sig: sp.sig, organs: 4 }); }
    } else {
      replay.at(t);
      if (k % 6 === 0) C.tell(replay.W);
    }
    const m = Math.min(block, n - i0);
    E.render(L.subarray(i0, i0 + m), R.subarray(i0, i0 + m), m);
  }
  const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = (L[i] + R[i]) * 0.5;
  // the last seconds: a fade, under the piano's last chord
  const fade = Math.round(4 * sampleRate); for (let i = 0; i < fade && i < n; i++) out[n - 1 - i] *= i / fade;
  return out;
}
