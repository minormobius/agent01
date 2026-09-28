// film.js — a Grown history as a film's world: chapters replayed from snapshots, time-lapses from the
// census between them, and the choir that hears the same replay. Shared by the films ("Nobody Drew It",
// nobody/; "And Still It Grew", grew/): each passes its history, its chapters and its music.
//
// A chapter restores its snapshot at its first second (or at `still`, holding it until then) and steps
// the world 30 times a second: step k of a chapter happens at from + k/30, in the page, the export and
// the band worker alike (a restored world is deterministic). Seeking back restores again.

import { World, signature } from '../vendor/attractor/lib/organism.js';
import { makeEngine, makeConductor } from './sound.js';

export const SPS = 30;

/**
 * { HISTORY, SNAPSHOTS, chapters: [{ name, snap, from, to, still?, follow?, cap? }], lapses: [{ from, to,
 * s0, s1 }], duration, engine: makeEngine's options } → { CHAPTERS, LAPSES, chapterAt, lapseAt, censusAt,
 * Replay, choir }. A chapter's `follow` names a species the camera follows (the one grown furthest);
 * `cap` bounds how far the camera backs off to hold the whole population.
 */
export function makeFilm({ HISTORY, SNAPSHOTS, chapters: CHAPTERS, lapses: LAPSES, duration, engine = { bpm: 96 } }) {
  const chapterAt = (t) => CHAPTERS.findIndex((c) => t >= c.from && t < c.to);
  const lapseAt = (t) => LAPSES.findIndex((l) => t >= l.from && t < l.to);
  function censusAt(s) {
    const x = Math.max(0, Math.min(HISTORY.rows.length - 1, s / HISTORY.every)), i = Math.floor(x), f = x - i, a = HISTORY.rows[i], b = HISTORY.rows[Math.min(i + 1, HISTORY.rows.length - 1)];
    return a.map((v, k) => v + (b[k] - v) * f);
  }

  class Replay {
    constructor({ onStep = null } = {}) { this.onStep = onStep; this.ch = -1; this.W = null; this.k = 0; this.cam = null; }
    at(t) {
      let ci = chapterAt(t);
      if (ci < 0) ci = t < CHAPTERS[0].from ? 0 : this.ch >= 0 ? this.ch : 0;
      const C = CHAPTERS[ci], start = C.still ?? C.from;
      const want = Math.max(0, Math.floor((Math.min(t, C.to) - start) * SPS));
      if (ci !== this.ch || want < this.k) { this.W = World.restore(SNAPSHOTS[C.snap]); this.ch = ci; this.k = 0; this.cam = null; this.follow = null; this.aim(); }
      while (this.k < want) { this.W.step(); this.k++; this.onStep?.(this.W); this.aim(); }
      return { W: this.W, chapter: ci, f: t >= start ? Math.min(1, (t - start) * SPS - this.k) : 0 };
    }
    /** Where the camera looks: the living's middle, or one of the species the chapter follows. */
    aim() {
      const W = this.W, C = CHAPTERS[this.ch]; if (!W.bodies.length) return;
      let target, spread;
      if (C.follow) {
        let q = this.follow != null && W.bodies.find((b) => b.id === this.follow);
        if (!q) { q = W.bodies.filter((b) => b.genome.name === C.follow).sort((a, b) => b.grown - a.grown || a.id - b.id)[0]; this.follow = q?.id ?? null; }
        if (q) { target = q.p; spread = 9; }
      }
      if (!target) {
        const ps = W.bodies.map((b) => b.p); target = [0, 1, 2].map((i) => ps.reduce((a, p) => a + p[i], 0) / ps.length);
        const r = ps.map((p) => Math.hypot(p[0] - target[0], p[2] - target[2])).sort((a, b) => a - b); spread = Math.max(14, Math.min(C.cap ?? 60, r[Math.floor(r.length * 0.6)] + 6));
      }
      if (!this.cam) this.cam = { t: target.slice(), spread };
      else { for (let i = 0; i < 3; i++) this.cam.t[i] += (target[i] - this.cam.t[i]) * 0.04; this.cam.spread += (spread - this.cam.spread) * 0.02; }
    }
  }

  /**
   * The choir, the world heard (sound.js), for the whole film at `sampleRate`: mono. In the chapters the
   * conductor reads the replay step by step; in the time-lapses the named species sing from the census,
   * and each one that first appears in the stretch enters with its rising chime; before the first chapter
   * moves, the choir is silent (the bass alone).
   */
  function choir(sampleRate, seconds = duration) {
    const E = makeEngine(sampleRate, engine), n = Math.ceil(seconds * sampleRate), L = new Float32Array(n), R = new Float32Array(n);
    const C = makeConductor((m) => { E.state(m.state); for (const e of m.events) E.event(e); }, { signature });
    const replay = new Replay({ onStep: (W) => C.listen(W) });
    const block = Math.round(sampleRate / SPS), seen = new Set(), still = CHAPTERS[0].still ?? CHAPTERS[0].from;
    for (let i0 = 0, k = 0; i0 < n; i0 += block, k++) {
      const t = i0 / sampleRate, li = lapseAt(t);
      if (t < still) E.state({ species: [], swim: 0, rich: 0.4 });
      else if (li >= 0) {
        const Lp = LAPSES[li], s = Lp.s0 + (Lp.s1 - Lp.s0) * ((t - Lp.from) / (Lp.to - Lp.from)), c = censusAt(s);
        if (k % 6 === 0) E.state({ species: HISTORY.species.map((sp, j) => ({ sig: sp.sig, count: Math.round(c[j]), organs: sp.sig.replace(/[^a-z]/g, '').length })).filter((x) => x.count > 0).sort((a, b) => b.count - a.count), swim: 0.4, rich: 0.5 });
        for (const sp of HISTORY.species) if (!seen.has(sp.sig) && sp.first > Lp.s0 && sp.first <= s) { seen.add(sp.sig); E.event({ type: 'new', sig: sp.sig, organs: 4 }); }
      } else { replay.at(t); if (k % 6 === 0) C.tell(replay.W); }
      const m = Math.min(block, n - i0);
      E.render(L.subarray(i0, i0 + m), R.subarray(i0, i0 + m), m);
    }
    const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = (L[i] + R[i]) * 0.5;
    const fade = Math.round(4 * sampleRate); for (let i = 0; i < fade && i < n; i++) out[n - 1 - i] *= i / fade;
    return out;
  }
  return { SPS, CHAPTERS, LAPSES, chapterAt, lapseAt, censusAt, Replay, choir, HISTORY };
}
