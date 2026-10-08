// composer.js — the radio's composer: endless music for piano and guitar, steered while it plays by
// eight dials of what the music should feel like rather than what notes it should play. Pure: node,
// browser, worker. It grew from the colour cycle's Duende (../cycle/compose.js) and keeps its
// grammar: the 12/8 bar (four beats of three ticks), the four-bar phrase as question and answer,
// motifs that are stated, developed and remembered, sections that turn by modal colour.
//
// What the dials do, each read afresh every bar (harmony at the next bar too, when it moves enough):
//   light         the mode, on a ladder from dark to bright over one root: Phrygian, Aeolian, Dorian,
//                 Mixolydian, Ionian, Lydian. Flamenco's light is Phrygian below, alegrías' major above.
//   energy        the rhythmic cells (long notes to running ones), how many notes the hands play, how
//                 hard they strike, and which textures suit (the lake and the stars; the falls, strums).
//   pace          the tempo, gliding from 44 to 120 beats a minute (a third of the way a bar).
//   tension       the chord: triads, sevenths, ninths, the flat nine on a dominant; suspensions held
//                 over cadences, deceptive ones, half cadences that delay going home; ornaments.
//   journey       how far it travels: the harmonic rhythm (two bars a chord to two chords a bar), the
//                 section's length (32 bars to 8), and modulation (up a fifth, a fourth, to the
//                 relative, a tone either way, by its dominant) and the return home.
//   duende        the style, jazz at one end and flamenco at the other: swing cells, walking bass,
//                 shell voicings and ii–V–I; or the soleá's twelve (accents on 3 6 8 10 12, the bar
//                 being exactly that compás), rasgueado, picado falsetas, the Andalusian descent. In
//                 between, the colour cycle's landscapes.
//   conversation  who plays: one voice alone, a soloist and an accompanist, phrases traded, a duel.
//   air           space: the register, how wide the voicings, how many rests, and the hall's reverb.
//
// new Radio({ seed }).next(knobs) → { t, sec, notes, info } for the next bar: notes as compose.js's
//   { at, dur, midi, vel, inst: 0 piano | 1 guitar, string, art, ap } with `at` in seconds from the
//   first bar, and `info` what the bar is (tempo, key, mode, chord, texture, who leads, how tense).

const LADDER = [
  ['Phrygian', [0, 1, 3, 5, 7, 8, 10]], ['Aeolian', [0, 2, 3, 5, 7, 8, 10]], ['Dorian', [0, 2, 3, 5, 7, 9, 10]],
  ['Mixolydian', [0, 2, 4, 5, 7, 9, 10]], ['Ionian', [0, 2, 4, 5, 7, 9, 11]], ['Lydian', [0, 2, 4, 6, 7, 9, 11]],
];
const OPEN = [64, 59, 55, 50, 45, 40];
export const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const KNOBS = ['light', 'energy', 'pace', 'tension', 'journey', 'duende', 'conversation', 'air'];
export const TEXTURES = ['lake', 'stars', 'sea', 'river', 'falls', 'mountains', 'swing', 'ballad', 'buleria', 'falseta'];
// the stations: settings worth tuning to (light, energy, pace, tension, journey, duende, conversation, air)
export const STATIONS = [
  ['3 am', [0.25, 0.15, 0.2, 0.45, 0.3, 0.45, 0.3, 0.8]],
  ['rain on glass', [0.4, 0.3, 0.3, 0.35, 0.25, 0.4, 0.5, 0.7]],
  ['first light', [0.85, 0.35, 0.35, 0.2, 0.3, 0.5, 0.4, 0.75]],
  ['lullaby', [0.6, 0.1, 0.1, 0.1, 0.1, 0.4, 0.2, 0.6]],
  ['blue note', [0.45, 0.55, 0.5, 0.75, 0.6, 0.05, 0.6, 0.4]],
  ['soleá', [0.15, 0.4, 0.25, 0.6, 0.4, 1, 0.5, 0.5]],
  ['feria', [0.7, 0.9, 0.7, 0.5, 0.5, 0.95, 0.9, 0.3]],
  ['duel', [0.5, 0.85, 0.65, 0.65, 0.7, 0.7, 1, 0.35]],
];
export const DEFAULT = Object.fromEntries(KNOBS.map((k, i) => [k, STATIONS[0][1][i]]));

// 12/8 rhythmic cells (ticks, 12 to the bar), by how much is going on
const CELLS = {
  slow: [[12], [6, 6], [9, 3], [6, 3, 3], [3, 3, 6], [3, 9]],
  mid: [[3, 3, 3, 3], [2, 1, 3, 2, 1, 3], [1, 1, 1, 3, 3, 3], [6, 3, 3], [3, 1, 1, 1, 6], [2, 1, 2, 1, 6], [3, 3, 6], [1, 2, 3, 6]],
  fast: [[1, 1, 1, 1, 1, 1, 3, 3], [1, 1, 1, 3, 1, 1, 1, 3], [2, 1, 2, 1, 1, 1, 1, 3], [1, 1, 1, 1, 1, 1, 1, 1, 1, 3], [1, 1, 1, 2, 1, 1, 1, 1, 3]],
  swing: [[2, 1, 2, 1, 3, 3], [3, 2, 1, 2, 1, 3], [2, 1, 2, 1, 2, 1, 3], [1, 2, 2, 1, 3, 3], [3, 3, 2, 1, 3], [2, 1, 3, 2, 1, 3]],
  compas: [[2, 1, 2, 1, 1, 1, 1, 1, 2], [3, 3, 2, 2, 2], [1, 1, 1, 2, 1, 2, 1, 3], [2, 1, 3, 2, 2, 2], [1, 1, 1, 3, 2, 2, 2]],
};
// the soleá's accents, the bar read as its twelve: 3 6 8 10 12
const COMPAS = [2, 5, 7, 9, 11];

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function weighted(r, pairs) {
  let s = 0; for (const [, w] of pairs) s += Math.max(0, w);
  let x = r() * s; for (const [v, w] of pairs) { x -= Math.max(0, w); if (x <= 0) return v; }
  return pairs[pairs.length - 1][0];
}
/** Jazz and flamenco, as weights from the duende dial (the middle is neither). */
export const styleOf = (d) => ({ jw: smooth(0.42, 0.1, d), fw: smooth(0.58, 0.9, d) });
/** The conversation dial as a manner of playing. */
export const manner = (c) => (c < 0.15 ? 'solo' : c < 0.45 ? 'accompany' : c < 0.8 ? 'trade' : 'duel');

export class Radio {
  constructor({ seed = 1 } = {}) {
    this.seed = seed; this.r = rng(seed * 7919 + 29);
    this.home = pick(this.r, [43, 45, 48, 50, 52]);      // G, A, C, D, E: the guitar's keys
    this.motifs = [this.#motif(), this.#motif(), this.#motif()];
    this.sung = []; this.prevVoicing = null; this.lastMel = null;
    this.n = 0; this.t = 0; this.bpm = null; this.sec = null; this.phrase = null; this.secs = 0;
    this.key = 0; this.k = { ...DEFAULT }; this.mode = null;
  }

  // a motif: a contour of scale steps (long enough for any cell) and a preference among the cells
  #motif() {
    const r = this.r;
    let s = 0;
    const contour = Array.from({ length: 12 }, (_, i) => {
      if (i === 0) return 0;
      const d = r() < 0.22 ? pick(r, [3, 4, -3, -2, 5]) : pick(r, [1, -1, 1, -1, 2, -2, 0]);
      s += d; if (Math.abs(s) > 6) s -= 2 * d;
      return s;
    });
    return { contour, ci: Math.floor(r() * 64) };
  }

  /** The mode the light asks for (flamenco keeps its own: Phrygian below, the alegrías' major above). */
  #modeFor(k) {
    const { fw } = styleOf(k.duende);
    if (fw > 0.5) return k.light < 0.6 ? { name: 'Phrygian', scale: LADDER[0][1], idx: 0, flam: true, bright: 0.1 + 0.2 * k.light } : { name: 'Ionian', scale: LADDER[4][1], idx: 4, flam: true, bright: 0.75 };
    const idx = clamp(Math.round(k.light * 5), 0, 5);
    return { name: LADDER[idx][0], scale: LADDER[idx][1], idx, flam: false, bright: idx / 5 };
  }
  get root() { return 43 + ((((this.home + this.key - 43) % 12) + 12) % 12); }
  /** Scale degree d (any integer) → MIDI, in the bar's mode, from `root`. */
  #deg(d, root = this.root) { const sc = this.mode.scale, k = ((d % 7) + 7) % 7; return root + sc[k] + 12 * Math.floor(d / 7); }
  /** A chord's tones as semitones above its root: root, third, fifth, seventh, ninth. */
  #tones(ch) {
    const b = this.#deg(ch.d);
    let t = [0, 2, 4, 6, 8].map((j) => this.#deg(ch.d + j) - b);
    if (ch.dom) t = [0, 4, 7, 10, ch.b9 || this.k.tension > 0.72 ? 13 : 14];
    else if (!ch.maj && t[4] === 13) t[4] = 12 + this.#deg(ch.d + 3) - b;      // no flat nine but on a dominant: the eleventh
    if (ch.maj) { t[1] = 4; t[2] = 7; }
    if (ch.sus) t[1] = 5;
    return t;
  }
  /** How many of those tones sound: a triad, a seventh, a ninth (jazz never under a seventh). */
  #nt() { const { jw } = styleOf(this.k.duende), t = this.k.tension; return Math.max(t < 0.25 ? 3 : t < 0.55 ? 4 : 5, jw > 0.5 ? 4 : 3); }
  #ct(ch, j) { return this.#deg(ch.d) + this.#tones(ch)[j]; }
  /** A melody note bent to the chord: an altered third (a dominant in a minor mode, flamenco's home). */
  #fit(m, ch) {
    const b = this.#deg(ch.d), dia = this.#deg(ch.d + 2) - b, alt = this.#tones(ch)[1];
    return alt !== dia && (((m - b - dia) % 12) + 12) % 12 === 0 ? m + alt - dia : m;
  }
  symbol(ch) {
    const t = this.#tones(ch), nt = this.#nt(), rootPc = this.#deg(ch.d) % 12;
    let q = ch.sus ? '' : t[1] === 3 ? (t[2] === 6 ? (nt >= 4 && t[3] === 10 ? 'ø' : '°') : 'm') : t[2] === 8 ? '+' : '';
    if (nt >= 4 && !(q === 'ø')) q += t[3] === 10 ? '7' : t[3] === 11 ? 'maj7' : t[3] === 9 ? '6' : '';
    if (nt >= 5) q += t[4] === 13 ? '♭9' : t[4] === 14 ? '(9)' : t[4] >= 17 ? '(11)' : '';
    return NAMES[rootPc] + q + (ch.sus ? 'sus4' : '');
  }

  /** The textures the dials ask for, as weights; a solo excludes what one instrument cannot carry. */
  weights(k, solo = -1) {
    const e = k.energy, a = k.air, { fw, jw } = styleOf(k.duende), mw = Math.max(0, 1 - 1.1 * Math.max(fw, jw));
    const W = {
      lake: mw * (1 - e) * (0.4 + a),
      stars: mw * (1 - e) ** 2 * (0.15 + 1.3 * a),
      sea: mw * Math.max(0.05, 1 - 1.6 * Math.abs(e - 0.45)) * 0.9,
      river: mw * (0.3 + 0.7 * e) * (1 - 0.4 * a),
      falls: mw * e * (0.35 + 0.6 * (1 - k.light)),
      mountains: (0.7 * mw + 0.5 * fw) * e * e,
      swing: jw * (0.1 + e) * 1.3,
      ballad: jw * (1.1 - e),
      buleria: fw * (0.1 + e) * 1.2,
      falseta: fw * (0.3 + 0.7 * (1 - Math.abs(e - 0.55))),
    };
    const PIANO = ['lake', 'stars', 'sea', 'river', 'mountains', 'swing', 'ballad', 'buleria'];
    const GUITAR = ['river', 'falls', 'stars', 'mountains', 'swing', 'ballad', 'buleria', 'falseta'];
    if (solo >= 0) for (const t of TEXTURES) if (!(solo === 0 ? PIANO : GUITAR).includes(t)) W[t] = 0;
    return W;
  }

  #newSection(n, k) {
    const r = this.r, prev = this.sec;
    // the journey: away to a neighbouring key (by its dominant), and home again
    let key = this.key;
    if (prev && k.journey > 0.2 && r() < k.journey * 0.8) key = this.key !== 0 && r() < 0.6 ? 0 : pick(r, [7, 5, -3, 2, -2].filter((x) => x !== this.key));
    if (prev && k.journey <= 0.2) key = 0;                        // a still dial comes home
    const turned = key !== this.key;
    this.key = key;
    const idx = this.secs++;
    this.sec = { start: n, idx, texture: null, lead: r() < 0.5 ? 0 : 1, solo: (idx + (this.seed & 1)) % 2, turned };
  }

  /** Four bars of chords (each bar one chord or two), planned from the dials as they stand. */
  #planPhrase(i, k) {
    const r = this.r, ph = Math.floor(i / 4), answer = ph % 2 === 1, { fw, jw } = styleOf(k.duende);
    const T = k.tension, J = k.journey, mode = this.mode;
    const C = (d, o = {}) => ({ d: ((d % 7) + 7) % 7, ...o });
    let bars;
    if (mode.flam && mode.idx === 0 && (answer || r() < 0.5)) {
      // the Andalusian descent, iv III II I, the home chord major (and with a flat nine if tense)
      bars = [[C(3)], [C(2)], [C(1)], [C(0, { maj: true, b9: T > 0.45 })]];
      if (J > 0.6) bars = [[C(3), C(2)], [C(1), C(0, { maj: true })], [C(3)], [C(1), C(0, { maj: true, b9: T > 0.45 })]];
    } else if (mode.flam && mode.idx === 0) {
      // por medio: the home chord and the one above it, rocking
      bars = [[C(0, { maj: true })], [C(1)], [C(1)], [C(0, { maj: true, b9: T > 0.45 })]];
    } else if (jw > 0.5) {
      const V = C(4, { dom: true, b9: T > 0.6 });
      const forms = answer
        ? [[[C(1)], [V], [C(0)], [C(0)]], [[C(2)], [C(5, { dom: T > 0.45 })], [C(1)], [V]].map((b, j) => (j === 3 ? [C(1), V] : b)), [[C(3)], [C(3)], [C(0)], [C(1), V]]]
        : [[[C(0)], [C(5, { dom: T > 0.45 })], [C(1)], [V]], [[C(0)], [C(0)], [C(1)], [V]], [[C(2)], [C(5, { dom: T > 0.5 })], [C(1)], [V]]];
      bars = pick(r, forms).map((b) => [...b]);
      if (answer && !bars[3].some((c) => c.dom) && r() < T * 0.5) bars[3] = [C(5, { dom: true })];   // deceptive
      if (J > 0.6) bars = bars.map((b, j) => (b.length === 1 && j < 3 && r() < J ? [b[0], j % 2 ? C(4, { dom: true }) : C(b[0].d + 3)] : b));
    } else {
      // the landscapes' plan (compose.js): a walk among the degrees, home at the start, a cadence at the end
      const pairs = J < 0.3 ? [[0, 6], [3, 1.5], [-3, 1], [1, 1]] : [[3, 3], [-1, 3], [1, 2], [-2, 2], [2, 1], [-3, 1.4]];
      let d = ph === 0 || answer ? 0 : weighted(r, [[0, 3], [5, 1], [3, 1.4]]);
      const ds = [];
      for (let b = 0; b < 4; b++) {
        if (b > 0) {
          if (b === 3) {
            // the question ends away (more often on a dominant as tension rises); the answer ends home,
            // unless tension wants it deceived
            if (answer) d = r() < T * 0.4 ? 5 : weighted(r, [[0, 3], [5, 0.6 + T], [3, 0.8 * (1 - T)]]);
            else d = weighted(r, [[4, 1 + 2 * T], [3, 1.6], [6, 0.4 + T], [1, 0.6]]);
          } else d = ((d + weighted(r, pairs)) % 7 + 7) % 7;
        }
        ds.push(d);
      }
      // a slow journey changes chord every two bars
      if (J < 0.25) { ds[1] = ds[0]; ds[3] = ds[3] === 0 ? 0 : ds[2] = ds[3]; }
      bars = ds.map((x, b) => {
        const dom = x === 4 && (T > 0.35 || mode.idx <= 2) && b === 3 && !answer;
        const ch = C(x, { dom, b9: dom && T > 0.65 });
        // a dim chord on a cadence is a dominant instead
        if (b === 3 && !dom && this.#tones(ch)[2] === 6) return [C(4, { dom: true })];
        return [ch];
      });
      // a suspension over the cadence, resolved halfway through the bar
      if (T > 0.35 && r() < T) bars[3] = [{ ...bars[3][0], sus: true }, bars[3][0]];
      // a quick journey: passing chords on the half-bar
      if (J > 0.65) for (const b of [1, 2]) if (bars[b].length === 1 && r() < J) bars[b] = [bars[b][0], C(bars[b + 1][0].d + 3)];
    }
    // a turned key arrives by its dominant
    if (i < 4 && this.sec.turned) bars[0] = [C(4, { dom: true })];
    return { ph, bars, sig: [T, J, k.duende, k.light] };
  }

  // ---- voicings --------------------------------------------------------------------------------------

  /** A piano voicing: a low root, then the colour tones near the last voicing, between lo and hi. */
  #voicing(ch, lo, hi) {
    const nt = this.#nt(), air = this.k.air;
    let bass = this.#ct(ch, 0) - 12;
    while (bass > 50) bass -= 12; while (bass < 33) bass += 12;
    if (air > 0.65 && bass - 12 >= 28) bass -= 12;                    // air: the bass lower, the hands apart
    const tones = [1, 2, 3, 4].slice(0, nt - 1).map((j) => this.#ct(ch, j));
    const prev = this.prevVoicing;
    let up = tones.map((m, i) => {
      let best = null;
      for (let o = -36; o <= 36; o += 12) { const v = m + o; if (v < lo || v > hi) continue; if (best === null || (prev && Math.abs(v - (prev[i] ?? v)) < Math.abs(best - (prev[i] ?? best)))) best = v; }
      return best ?? m;
    }).sort((a, b) => a - b);
    if (air > 0.5 && up.length >= 3 && up[up.length - 2] - 12 >= lo - 5) { up[up.length - 2] -= 12; up.sort((a, b) => a - b); }   // drop-2: open
    this.prevVoicing = up;
    return { bass, up };
  }

  /** A guitar shape in one hand position: each string a chord tone, the root (or fifth) in the bass. */
  #shape(ch) {
    const t = this.#tones(ch), b = this.#deg(ch.d), nt = Math.min(4, this.#nt());
    const pcs = new Set(t.slice(0, nt).map((x) => (b + x) % 12)), rootPc = b % 12, fifthPc = (b + t[2]) % 12;
    for (const need of [4, 3]) for (const pos of [0, 2, 3, 5, 7, 9]) {
      const s = [];
      for (let k = 0; k < 6; k++) {
        let found = -1;
        for (let f = pos; f <= pos + 4; f++) if (pcs.has((OPEN[k] + f) % 12)) { found = f; break; }
        if (found < 0 && pcs.has(OPEN[k] % 12)) found = 0;
        s.push(found);
      }
      let bassK = -1;
      for (const want of [rootPc, fifthPc]) { for (const k of [5, 4, 3]) if (s[k] >= 0 && (OPEN[k] + s[k]) % 12 === want) { bassK = k; break; } if (bassK >= 0) break; }
      if (bassK < 0) continue;
      for (let k = 5; k > bassK; k--) s[k] = -1;
      if (s.filter((f) => f >= 0).length >= need) return s.map((f, k) => (f >= 0 ? { string: k + 1, midi: OPEN[k] + f } : null));
    }
    return null;
  }
  /** A melody note onto the strings it may use: lowest fret within reach, an octave moved if need be. */
  #onString(midi, strings = [1, 2, 3]) {
    for (const reach of [12, 17]) for (const oct of [0, -12, 12]) {
      let best = null;
      for (const s of strings) { const f = midi + oct - OPEN[s - 1]; if (f >= 0 && f <= reach && (!best || f < best.f)) best = { s, f }; }
      if (best) return { string: best.s, midi: midi + oct };
    }
    return { string: strings[0], midi: OPEN[strings[0] - 1] };
  }
  /** A bass note onto strings 6–4 (frets 0–12). */
  #bassString(midi) {
    for (const oct of [0, -12, 12, -24, 24]) for (const s of [6, 5, 4]) { const f = midi + oct - OPEN[s - 1]; if (f >= 0 && f <= 9) return { string: s, midi: midi + oct }; }
    return { string: 6, midi: OPEN[5] };
  }

  // ---- the melody --------------------------------------------------------------------------------------

  #cell(mo, i) {
    const e = this.k.energy, { fw, jw } = styleOf(this.k.duende), r = this.r;
    const pool = jw > 0.5 ? (e < 0.3 ? 'slow' : 'swing') : fw > 0.5 ? (e < 0.25 ? 'slow' : 'compas') : e < 0.3 ? 'slow' : e < 0.68 ? 'mid' : 'fast';
    const P = CELLS[pool];
    return P[(mo.ci + (r() < 0.25 ? i : 0)) % P.length];
  }
  /** One bar of the tune, for the bar's place in its phrase (as compose.js), between low and high. */
  #melody(i, ch, ch2, low, high) {
    const r = this.r, ph = Math.floor(i / 4), inP = i % 4, answer = ph % 2 === 1, k = this.k;
    const mo = this.motifs[answer ? 1 : 0];
    let contour = mo.contour;
    if (answer && r() < 0.35) contour = this.motifs[0].contour.map((x) => -x);
    let cell = this.#cell(mo, i);
    if (ph >= 2 && this.sung.length && r() < 0.35) { const s = pick(r, this.sung); contour = s.contour; }
    let steps = contour.slice(0, cell.length);
    if (inP === 2) {                                                 // the third bar develops
      const op = pick(r, ['sequence', 'fragment', 'augment', 'invert', 'retrograde']);
      if (op === 'sequence') steps = steps.map((x) => x + (answer ? -1 : 1));
      if (op === 'fragment' && cell.length >= 3) { const h = cell.slice(0, 2), s2 = steps.slice(0, 2); const rest = 12 - 2 * (h[0] + h[1]); cell = rest > 0 ? [...h, ...h, rest] : [...h, ...h]; steps = [...s2, ...s2.map((x) => x + 1), s2[1] + 2].slice(0, cell.length); }
      if (op === 'augment') { cell = [6, 6]; steps = [steps[0], steps[Math.min(2, steps.length - 1)]]; }
      if (op === 'invert') steps = steps.map((x) => -x);
      if (op === 'retrograde') steps = [...steps].reverse().map((x) => x - steps[steps.length - 1]);
    }
    if (inP === 3) {                                                 // the cadence: a turn, then a held note
      if (k.energy > 0.7) { cell = [1, 1, 1, 9]; steps = [2, 1, -1, 0]; }
      else { cell = answer ? [3, 9] : [2, 1, 9]; steps = answer ? [1, 0] : [-1, 1, 0]; }
    }
    // where it starts: the chord tone nearest the last note sung
    const tones = [ch.d, ch.d + 2, ch.d + 4], prev = this.lastMel ?? (low + high) / 2;
    let start = null, bd = Infinity;
    for (const t of tones) for (let o = -21; o <= 21; o += 7) {
      const m = this.#deg(t + o);
      if (m < low - 2 || m > high + 2) continue;
      if (Math.abs(m - prev) < bd) { bd = Math.abs(m - prev); start = t + o; }
    }
    if (start === null) start = tones[0] + 7;
    const degs = steps.map((x) => start + x);
    // where it lands: on a tone of the chord sounding then
    if (inP === 3 || r() < 0.5) {
      const end = degs[degs.length - 1], lt = [ch2.d, ch2.d + 2, ch2.d + 4];
      let land = end, b2 = Infinity;
      for (const t of lt) for (let o = -14; o <= 14; o += 7) if (Math.abs(t + o - end) < b2) { b2 = Math.abs(t + o - end); land = t + o; }
      degs[degs.length - 1] = land;
    }
    let midis = degs.map((d) => this.#deg(d));
    const lo = Math.min(...midis), hi = Math.max(...midis);
    if (hi > high) midis = midis.map((x) => x - 12 * Math.ceil((hi - high) / 12));
    else if (lo < low) midis = midis.map((x) => x + 12 * Math.ceil((low - lo) / 12));
    const notes = [];
    let t = 0;
    cell.forEach((len, j) => {
      if (j >= midis.length) return;
      const last = j === cell.length - 1 || j === midis.length - 1;
      const c = t < 6 ? ch : ch2;
      // air: rests in the line (never its first note, never the cadence's)
      if (j > 0 && !last && r() < Math.max(0, k.air - 0.45) * 0.5) { t += len; return; }
      notes.push({ tick: t, len: last && inP === 3 ? len + 6 : len, midi: this.#fit(midis[j], c) });
      t += len;
    });
    if (notes.length) this.lastMel = notes[notes.length - 1].midi;
    if (inP === 0) this.sung = [...this.sung.slice(-5), { contour: steps.concat(contour.slice(steps.length)) }];
    return notes;
  }

  // ---- a bar -------------------------------------------------------------------------------------------

  /** Compose the next bar under the dials `knobs` (each 0..1; missing ones keep their last value). */
  next(knobs = {}) {
    const k = (this.k = { ...this.k, ...knobs }), r = this.r;
    const target = 44 + 76 * k.pace;
    this.bpm = this.bpm == null ? target : this.bpm + (target - this.bpm) * 0.35;
    const beat = 60 / this.bpm, T = beat / 3, barSec = 4 * beat, t0 = this.t, n = this.n;
    const { fw, jw } = styleOf(k.duende);
    const targetLen = Math.max(8, 4 * Math.round((32 - 24 * k.journey) / 4));
    let i = this.sec ? n - this.sec.start : 0;
    if (!this.sec || (i % 4 === 0 && i >= targetLen)) { this.#newSection(n, k); i = 0; }
    const sec = this.sec, ph = Math.floor(i / 4), inP = i % 4;
    this.mode = this.#modeFor(k);
    const how = manner(k.conversation), solo = how === 'solo' ? sec.solo : -1;
    // the texture: kept while the dials still suit it; re-chosen at a section, sometimes at a phrase
    const W = this.weights(k, solo), mx = Math.max(...Object.values(W));
    if (!sec.texture || !(W[sec.texture] > 0.3 * mx) || (inP === 0 && i > 0 && r() < 0.08 + 0.3 * k.journey)) sec.texture = weighted(r, Object.entries(W));
    // the harmony: this phrase's plan, re-made if the dials that shape it have moved
    const moved = this.phrase && this.phrase.sig.some((v, j) => Math.abs(v - [k.tension, k.journey, k.duende, k.light][j]) > (j === 3 ? 0.2 : 0.12));
    if (!this.phrase || this.phrase.sec !== sec || this.phrase.ph !== ph || moved) this.phrase = { ...this.#planPhrase(i, k), sec };
    const half = this.phrase.bars[inP], ch = half[0], ch2 = half[1] || half[0];
    const nextCh = inP < 3 ? this.phrase.bars[inP + 1][0] : { d: 0 };
    const last = inP === 3 && i + 1 >= targetLen;                   // the section's seam: thin out
    // who plays
    let lead, comp;
    if (how === 'solo') lead = comp = sec.solo;
    else if (how === 'accompany') { lead = sec.lead; comp = 1 - lead; }
    else if (how === 'trade') { lead = (ph + sec.lead) % 2; comp = 1 - lead; }
    else { lead = (i + sec.lead) % 2; comp = 1 - lead; }
    const tex = sec.texture, e = k.energy, air = k.air;

    const out = [], ev = 0.5 + 0.65 * e;
    const arc = (0.78 + 0.22 * Math.sin(Math.PI * (inP + 0.5) / 4)) * (0.85 + 0.15 * Math.sin(Math.PI * Math.min(1, i / targetLen)));
    const hum = () => (r() - 0.5) * 0.014;
    let win = [0, 12];
    const P = (tick, len, midi, vel) => {
      if (tick < win[0] - 1e-6 || tick >= win[1] || midi < 21 || midi > 105) return;
      out.push({ at: t0 + Math.max(0, tick * T + hum()), dur: Math.max(0.3, len) * T, midi, vel: clamp(vel * ev * arc * (0.92 + 0.16 * r()), 0.04, 1), inst: 0 });
    };
    const thin = k.thin ?? 1;
    const G = (tick, len, s, midi, vel, art = 0, ap = 0) => {
      if (tick < win[0] - 1e-6 || tick >= win[1]) return;
      if (thin < 1 && vel < 100 && r() > thin) return;
      out.push({ at: t0 + Math.max(0, tick * T + hum()), dur: Math.max(0.3, len) * T, midi, vel: clamp(vel * ev * arc * (0.9 + 0.2 * r()), 20, 220), inst: 1, string: s, art, ap });
    };

    // the bar, half by half when the chord changes in the middle
    const halves = half.length > 1 ? [[ch, 0, 6], [ch2, 6, 12]] : [[ch, 0, 12]];
    const pianoSings = lead === 0, guitarSings = lead === 1;
    const lowM = lead === 0 ? 66 + 9 * air : 62 + 6 * air, highM = lowM + 15;
    const line = this.#melody(i, ch, ch2, Math.round(lowM), Math.round(highM));
    for (const [c, a, b] of halves) {
      win = [a, b];
      const x = { ch: c, next: b === 12 ? nextCh : ch2, i, inP, last, e, air, fw, jw, T, line, solo: how === 'solo', duel: how === 'duel' };
      for (const inst of new Set([comp])) {
        if (inst === 0) this.#pianoComp(tex, P, { ...x, v: this.#voicing(c, pianoSings ? 45 : 55, pianoSings ? Math.round(lowM) - 2 : 76 + Math.round(6 * air)) });
        else this.#guitarComp(tex, G, { ...x, shape: this.#shape(c), sings: guitarSings });
      }
    }
    win = [0, 12];
    this.#sing(tex, lead, line, P, G, { ch, ch2, i, inP, e, fw, jw, last, T, sing: !(last && r() < 0.5) });
    // the duel: the other answers in the gap the line leaves at its end
    if (how === 'duel' && line.length) {
      const endT = line[line.length - 1].tick;
      if (endT <= 8) {
        const echo = line.slice(0, 3).map((m, j) => ({ tick: Math.max(endT + 2, 9) + j, midi: m.midi - (comp === 0 ? 0 : 12) - 3 }));
        for (const m of echo) if (m.tick < 12) {
          if (comp === 0) P(m.tick, 1.5, this.#fit(this.#snap(m.midi), ch2) + 12, 0.42);
          else { const p = this.#onString(this.#fit(this.#snap(m.midi + 12), ch2)); G(m.tick, 1.5, p.string, p.midi, 125); }
        }
      }
    }
    out.sort((a, b) => a.at - b.at);
    this.t += barSec; this.n++;
    const tense = clamp(0.12 * (this.#nt() - 3) + (ch.dom || ch2.dom ? 0.2 : 0) + (ch.b9 || ch2.b9 ? 0.2 : 0) + (ch.sus ? 0.2 : 0) + (inP === 3 && ch.d !== 0 ? 0.15 : 0) + 0.15 * (this.key !== 0), 0, 1);
    const info = {
      bar: n, bpm: Math.round(this.bpm), key: NAMES[this.root % 12], mode: this.mode.name, chord: half.map((c) => this.symbol(c)).join(' '),
      texture: tex, lead: lead === 0 ? 'piano' : 'guitar', manner: how, tense, bright: this.mode.bright, section: sec.idx, inPhrase: inP, home: this.key === 0,
    };
    return { t: t0, sec: barSec, notes: out, info };
  }
  /** A MIDI note pulled onto the scale. */
  #snap(m) { const sc = this.mode.scale, rel = (((m - this.root) % 12) + 12) % 12; let best = 0; for (const s of sc) if (Math.abs(s - rel) < Math.abs(best - rel)) best = s; return m - rel + best; }

  // ---- the accompanist ---------------------------------------------------------------------------------

  #pianoComp(tex, P, x) {
    const { v, e, inP, i, last, fw, line } = x, step = e > 0.62 ? 1 : e > 0.3 ? 2 : 3, r = this.r;
    switch (tex) {
      case 'lake': {
        P(0, 15, v.bass, 0.4);
        const wave = [...v.up, ...v.up.map((m) => m + 12)].filter((m) => m < 92), seq = [...wave, ...wave.slice(1, -1).reverse()];
        for (let k = step === 1 ? 1 : 0; k < 12; k += step) if (!(last && k > 6)) P(k, 9, seq[(k + i * 3) % seq.length], 0.25 + 0.08 * (k % 3 === 0));
        break;
      }
      case 'stars':
        if (inP % 2 === 0 || this.k.journey > 0.5) P(0, 24, v.bass, 0.3);
        P(6, 12, v.up[v.up.length - 1] + 12, 0.17);
        if (e > 0.3) P(9, 6, v.up[0] + 12, 0.14);
        break;
      case 'sea': {
        const lo = v.bass, rock = [[0, lo], [2, lo + 7], [3, lo + 12], [5, v.up[0]], [6, lo + 7], [8, v.up[1] ?? lo + 16], [9, lo + 12], [11, v.up[0]]];
        rock.forEach(([k, m], j) => { if ((step === 1 || j % step === 0) && !(last && k > 6)) P(k, j === 0 ? 12 : 4, m, j === 0 ? 0.4 : 0.24); });
        break;
      }
      case 'river': {
        const lo = v.bass;
        [[0, lo], [3, lo + 7], [6, lo + 12], [9, lo + 7]].forEach(([k, m]) => P(k, 3, m, k === 0 ? 0.4 : 0.26));
        if (e > 0.45) for (const k of [1, 4, 7, 10]) if (step === 1 || k % 2 === 1) P(k, 2, v.up[(k >> 1) % v.up.length], 0.2);
        break;
      }
      case 'falls':
        P(0, 12, v.bass, 0.38); v.up.forEach((m, j) => P(0.15 * j, 12, m, 0.24));
        if (e > 0.6) v.up.forEach((m) => P(6, 6, m, 0.2));
        break;
      case 'mountains': {
        const acc = fw > 0.3 ? [0, 3, 6, 8, 10] : [0, 6];
        acc.forEach((k, j) => {
          if (last && j > 1) return;
          P(k, j === 0 ? 12 : 3, v.bass, 0.5);
          v.up.forEach((m, q) => P(k + 0.12 * q, j === 0 ? 10 : 3, m + (j === 0 ? 0 : 12), 0.42 + (j === 0 ? 0.1 : 0)));
        });
        break;
      }
      case 'swing': {
        // a walking bass on the beats, shells (third and seventh) comped off them
        this.#walk(x.ch, x.next).forEach((m, b) => P(b * 3, 2.6, m, b === 0 ? 0.42 : 0.34));
        const shell = [this.#ct(x.ch, 1), this.#ct(x.ch, 3)].map((m) => { while (m < 55) m += 12; while (m > 70) m -= 12; return m; });
        if (this.#nt() >= 5) shell.push(Math.min(76, this.#ct(x.ch, 4) + 12 * (this.#ct(x.ch, 4) < 60)));
        const hits = pick(r, e > 0.6 ? [[2, 5, 8, 11], [2, 8, 9], [0, 5, 8]] : [[2, 8], [5, 11], [8]]);
        for (const k of hits) shell.forEach((m) => P(k, 1.6, m, 0.3 + 0.06 * (k % 3 === 2)));
        break;
      }
      case 'ballad':
        P(0, 12, v.bass, 0.34);
        v.up.forEach((m, q) => P(0.2 + 0.18 * q, 11, m, 0.22));
        if (e > 0.3 && !last) v.up.slice(-2).forEach((m) => P(8, 4, m, 0.17));
        break;
      case 'buleria':
        P(0, 3, v.bass, 0.42); P(6, 3, v.bass, 0.32);
        for (const k of COMPAS) v.up.forEach((m, q) => P(k + 0.03 * q, 1.4, m, k === 2 || k === 9 ? 0.44 : 0.32));
        break;
      default: // falseta: the piano holds the ground
        P(0, 12, v.bass, 0.3); P(0.1, 12, v.bass + 7, 0.18);
        if (e > 0.4) v.up.slice(0, 2).forEach((m) => P(6, 5, m, 0.16));
    }
  }

  /** A walking bass for a bar: root, a chord tone, a passing note, a step into the next chord. */
  #walk(ch, next) {
    const into = (m) => { while (m > 52) m -= 12; while (m < 36) m += 12; return m; };
    const a = into(this.#ct(ch, 0)), n = into(this.#deg(next.d)), r = this.r;
    const b = into(this.#ct(ch, r() < 0.5 ? 1 : 2)), c = into(this.#snap(b + (n > b ? 2 : -2)));
    return [a, b, c, n + (r() < 0.5 ? 1 : -1)];
  }

  #guitarComp(tex, G, x) {
    const { shape, e, inP, last, sings, fw, solo } = x, r = this.r, k = this.k;
    const step = e > 0.62 ? 1 : e > 0.3 ? 2 : 3;
    // the strings: low to high; a guitar that also sings keeps strings 1 and 2 for the tune
    let ss = shape ? shape.filter(Boolean).reverse() : [this.#bassString(this.#ct(x.ch, 0))];
    if (sings && solo) ss = ss.filter((s) => s.string >= 3);
    if (!ss.length) ss = [this.#bassString(this.#ct(x.ch, 0))];
    const bass = ss[0], top = ss.slice(1);
    const strum = (tick, len, vel, up = false, n = 6, spread = 0.05) => {
      const use = (up ? [...ss].reverse() : ss).slice(0, n);
      use.forEach((s, q) => G(tick + q * spread, len, s.string, s.midi, vel - q * 3));
    };
    const harmonics = (n) => {
      const pcs = new Set([0, 1, 2, 3].slice(0, this.#nt()).map((j) => this.#ct(x.ch, j) % 12)), hs = [];
      for (let s = 1; s <= 6; s++) for (const [fret, up] of [[12, 12], [7, 19], [5, 24]]) if (pcs.has((OPEN[s - 1] + up) % 12) && !(sings && solo && s <= 2)) hs.push({ s, midi: OPEN[s - 1] + up, fret });
      return hs.slice(0, n);
    };
    switch (tex) {
      case 'lake':
        G(0, 12, bass.string, bass.midi, 100);
        if (inP >= 2 && !last) harmonics(3).forEach((h, j) => G(6 + j * 2, 18, h.s, h.midi, 120, 4, h.fret));
        else top.slice(0, 3).forEach((s, j) => G(3 + j * 3, 9, s.string, s.midi, 80));
        break;
      case 'stars':
        if (inP % 2 === 1 || solo) harmonics(2 + (e > 0.3)).forEach((h, j) => G(2 + j * 3, 24, h.s, h.midi, 125, 4, h.fret));
        if (inP === 0) G(0, 24, bass.string, bass.midi, 95);
        break;
      case 'river': {
        const t = top.length ? top : [bass];
        const pat = [bass, t[2] || t[0], t[1] || t[0], t[0], t[1] || t[0], t[2] || t[0], bass, t[2] || t[0], t[1] || t[0], t[0], t[1] || t[0], t[3] || t[2] || t[0]];
        pat.forEach((s, j) => { if (!(last && j > 6) && (step === 1 || j % step === 0)) G(j, j % 6 === 0 ? 12 : 6, s.string, s.midi, j % 6 === 0 ? 116 : 84); });
        break;
      }
      case 'sea':
        for (const kk of e > 0.4 ? [0, 6] : [0]) ss.forEach((s, q) => G(kk + q * 0.12, 9, s.string, s.midi, 98 - q * 3));
        break;
      case 'falls': {
        // the tremolo: the thumb on the beat, the top tone picked three times after it
        const tt = sings ? null : (top[top.length - 1] || bass);
        for (let b = 0; b < 4; b++) {
          G(b * 3, 3, bass.string, bass.midi, 108);
          if (tt && !(last && b > 1)) for (let q = 1; q <= 3; q++) G(b * 3 + q * 0.75, 0.75, tt.string, tt.midi, 88 + (q === 1 ? 10 : 0));
        }
        break;
      }
      case 'mountains': {
        const acc = fw > 0.3 ? COMPAS : [3, 9];
        acc.forEach((kk, j) => { if (!(last && j > 1)) strum(kk, 3, 128 - j * 4, j % 2 === 1); });
        if (fw <= 0.3) G(0, 12, bass.string, bass.midi, 110);
        break;
      }
      case 'swing': {
        // without a piano under it the guitar walks the bass itself and chops a shell between
        const w = this.#walk(x.ch, x.next);
        w.forEach((m, b) => { const p = this.#bassString(m); G(b * 3, 2.5, p.string, p.midi, b === 0 ? 120 : 104); });
        const sh = ss.filter((s) => s.string >= 2 && s.string <= 4).slice(0, 3);
        for (const kk of pick(r, e > 0.6 ? [[2, 8], [2, 5, 8, 11]] : [[2, 8], [5, 11]])) sh.forEach((s, q) => G(kk + q * 0.02, 1.2, s.string, s.midi, 92));
        break;
      }
      case 'ballad':
        ss.forEach((s, q) => { if (q * 2 < 12 && !(last && q > 2)) G(q * 2, 12 - q * 2, s.string, s.midi, q === 0 ? 108 : 86); });
        if (inP === 3 && !sings) harmonics(1).forEach((h) => G(9, 12, h.s, h.midi, 120, 4, h.fret));
        break;
      case 'buleria':
        G(0, 3, bass.string, bass.midi, 120);
        for (const a of COMPAS) {
          if (last && a > 6) break;
          // rasgueado: a roll of the fingers into the accent (when the energy is up), the stroke on it
          if (e > 0.5 && r() < e) [0.75, 0.5, 0.25].forEach((d, q) => ss.slice(-4).forEach((s, z) => G(a - d + z * 0.02, 0.5, s.string, s.midi, 60 + q * 8)));
          strum(a, 1.5, a === 2 || a === 9 ? 150 : 126, false, 6, 0.03);
          if (e > 0.7 && a < 11) strum(a + 0.5, 0.6, 70, true, 4, 0.02);
        }
        break;
      default: // falseta (under the piano's tune): the thumb on the beats, a pinch on the one
        for (let b = 0; b < 4; b++) G(b * 3, 3, bass.string, bass.midi, b === 0 ? 120 : 96);
        top.slice(-2).forEach((s) => G(0, 6, s.string, s.midi, 92));
        if (e > 0.5) strum(7, 1.5, 112, false, 6, 0.03);
    }
  }

  // ---- the soloist ------------------------------------------------------------------------------------

  #sing(tex, lead, line, P, G, x) {
    if (!x.sing || !line.length) return;
    const r = this.r, k = this.k, ornament = k.tension * 0.25 + x.fw * 0.35, approach = k.tension * 0.35 + x.jw * 0.25;
    const sparse = tex === 'stars';
    if (lead === 0) {
      line.forEach((m, j) => {
        if (sparse && j % 2 === 1 && k.energy < 0.5) return;
        const v = (sparse ? 0.34 : 0.52) * (m.tick % 3 === 0 ? 1 : 0.9);
        if (m.len >= 3 && m.tick >= 1 && r() < approach) P(m.tick - 0.33, 0.33, m.midi - 1, v * 0.7);   // a chromatic approach
        P(m.tick, m.len + (sparse ? 6 : 1), m.midi, v);
        // thirds or sixths under it, when the room is close and the music is calm
        if (tex === 'sea' || (k.air < 0.4 && k.energy < 0.6 && j % 2 === 0)) P(m.tick + 0.05, m.len, this.#fit(this.#deg(this.#below(m.midi, tex === 'sea' ? 5 : 2)), m.tick < 6 ? x.ch : x.ch2), v * 0.6);
        if (m.len >= 6 && r() < ornament) [1, 0, -1].forEach((d, q) => P(m.tick + 0.5 + q * 0.25, 0.25, this.#snap(m.midi + d * 2), v * 0.6));
      });
      return;
    }
    // the guitar: tremolo in the falls, picado in a falseta, otherwise plucked on the treble strings
    const strings = x.solo ? [1, 2] : [1, 2, 3];
    if (tex === 'falls') {
      for (let b = 0; b < 4; b++) {
        const m = line.filter((n) => n.tick <= b * 3).pop() || line[0], p = this.#onString(m.midi, [1, 2]);
        for (let q = 1; q <= 3; q++) G(b * 3 + q * 0.75, 0.75, p.string, p.midi, 100 + (q === 1 ? 12 : 0));
      }
      return;
    }
    line.forEach((m, j) => {
      const p = this.#onString(m.midi, strings), nx = line[j + 1];
      if (sparse && j % 2 === 1 && k.energy < 0.5) return;
      if (m.len >= 3 && m.tick >= 1 && r() < approach) { const a = this.#onString(m.midi - 1, strings); G(m.tick - 0.33, 0.33, a.string, a.midi, 110); }
      G(m.tick + 0.04, m.len + 2, p.string, p.midi, sparse ? 125 : 142);
      // picado: a run up or down the scale into the next note, two to a tick
      if (tex === 'falseta' && nx && m.len >= 2 && r() < 0.4 + 0.5 * k.energy) {
        const n = Math.min(Math.floor((m.len - 1) * 2), 6), dir = Math.sign(nx.midi - m.midi) || 1;
        let q = m.midi;
        for (let z = 1; z <= n; z++) { q = this.#snap(q + dir * 2); const s = this.#onString(q, strings); G(m.tick + 1 + (z - 1) * 0.5, 0.5, s.string, s.midi, 120); }
      } else if (m.len >= 6 && r() < ornament) {
        [2, 0].forEach((d, q) => { const s = this.#onString(this.#snap(m.midi + d), strings); G(m.tick + 0.5 + q * 0.3, 0.3, s.string, s.midi, 105); });   // a hammer and pull
      }
    });
  }
  /** The scale degree `k` steps below MIDI note `m` (a line in thirds or sixths under the tune). */
  #below(m, k) {
    let best = 0, bd = Infinity;
    for (let d = -21; d <= 35; d++) { const x = this.#deg(d); if (Math.abs(x - m) < bd) { bd = Math.abs(x - m); best = d; } }
    return best - k;
  }
}
