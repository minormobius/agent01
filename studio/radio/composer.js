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
  still: [[6, 6], [9, 3], [3, 9], [6, 3, 3], [12]],
  slow: [[6, 2, 1, 3], [3, 2, 1, 6], [4, 2, 6], [6, 3, 3], [9, 2, 1], [5, 1, 6], [3, 3, 4, 2]],
  mid: [[3, 3, 3, 3], [2, 1, 3, 2, 1, 3], [1, 1, 1, 3, 3, 3], [6, 3, 3], [3, 1, 1, 1, 6], [2, 1, 2, 1, 6], [3, 3, 6], [1, 2, 3, 6]],
  fast: [[1, 1, 1, 1, 1, 1, 3, 3], [1, 1, 1, 3, 1, 1, 1, 3], [2, 1, 2, 1, 1, 1, 1, 3], [1, 1, 1, 1, 1, 1, 1, 1, 1, 3], [1, 1, 1, 2, 1, 1, 1, 1, 3]],
  swing: [[2, 1, 2, 1, 3, 3], [3, 2, 1, 2, 1, 3], [2, 1, 2, 1, 2, 1, 3], [1, 2, 2, 1, 3, 3], [3, 3, 2, 1, 3], [2, 1, 3, 2, 1, 3]],
  compas: [[2, 1, 2, 1, 1, 1, 1, 1, 2], [3, 3, 2, 2, 2], [1, 1, 1, 2, 1, 2, 1, 3], [2, 1, 3, 2, 2, 2], [1, 1, 1, 3, 2, 2, 2]],
};
// the soleá's accents, the bar read as its twelve: 3 6 8 10 12
const COMPAS = [2, 5, 7, 9, 11];

// functional harmony, by scale degree (0 the home chord): where each chord tends to go, and how strongly
const FLOW = {
  0: [[3, 2], [4, 1.4], [5, 1.4], [1, 1], [2, 0.5]], 1: [[4, 3], [6, 0.5], [2, 0.4]], 2: [[5, 2], [3, 1.3], [1, 0.5]],
  3: [[4, 2], [1, 1.3], [0, 1.2], [6, 0.4]], 4: [[0, 3], [5, 1.2], [3, 0.3]], 5: [[1, 2], [3, 2], [4, 0.8], [2, 0.4]], 6: [[0, 2], [2, 0.7], [5, 0.4]],
};
// the chord each mode leans on to come home instead of the dominant (Phrygian's ♭II, Aeolian's and
// Mixolydian's ♭VII, Dorian's IV, Ionian's V, Lydian's II)
const MODAL = [1, 6, 3, 6, 4, 1];

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
    this.seed = seed; this.rs = (seed * 7919 + 29) | 0;
    // the generator keeps its state in a field, so the whole radio can be saved and resumed (state())
    this.r = () => { this.rs = (this.rs + 0x6d2b79f5) | 0; let t = Math.imul(this.rs ^ (this.rs >>> 15), 1 | this.rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    this.home = pick(this.r, [43, 45, 48, 50, 52]);      // G, A, C, D, E: the guitar's keys
    this.theme = this.#motif(); this.motif = { ...this.theme, head: [...this.theme.head] };
    this.prevVoicing = null; this.lastMel = null; this.mp = null; this.handAt = 2; this.hd = { mel: 0, comp: 0 };
    this.n = 0; this.t = 0; this.bpm = null; this.sec = null; this.phrase = null; this.secs = 0;
    this.key = 0; this.k = { ...DEFAULT }; this.mode = null;
  }
  /** All the radio is, as data: with the dials bar by bar it makes the same music again (a saved moment). */
  state() { const { r, mode, ...s } = this; return JSON.parse(JSON.stringify(s)); }
  static from(s) { const R = new Radio({ seed: s.seed }); Object.assign(R, JSON.parse(JSON.stringify(s))); return R; }

  // a motif: the head of a tune (scale steps from its first note; a leap is followed by a step back,
  // and it stays within a sixth) and a preference among the rhythmic cells
  #motif() {
    const r = this.r, head = [0];
    let s = 0, prev = 0;
    for (let j = 1; j < 5; j++) {
      const d = Math.abs(prev) >= 2 ? -Math.sign(prev) : r() < 0.25 ? pick(r, [2, 3, -2, -3]) : pick(r, j === 1 ? [1, -1, 1, -1, 2, -2] : [1, -1, 1, -1, 0, 1, -1, 2]);
      s = clamp(s + d, -3, 4); head.push(s); prev = d;
    }
    return { head, ci: Math.floor(r() * 64) };
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
    const r = this.r, prev = this.sec, idx = this.secs++;
    // the journey: away to a neighbouring key (by its dominant), and home again
    let key = this.key;
    if (prev && k.journey > 0.2 && r() < k.journey * 0.8) key = this.key !== 0 && r() < 0.6 ? 0 : pick(r, [7, 5, -3, 2, -2].filter((x) => x !== this.key));
    if (prev && k.journey <= 0.2) key = 0;                        // a still dial comes home
    // the tune's life: every fourth section the theme comes back, at home; between, the motif is
    // varied a little, now and then replaced
    let theme = false;
    if (idx > 0 && idx % 4 === 0) { this.motif = { ...this.theme, head: [...this.theme.head] }; theme = true; key = 0; }
    else if (idx > 0) {
      const x = r();
      if (x < 0.35) { const j = 1 + Math.floor(r() * 4); this.motif.head[j] = clamp(this.motif.head[j] + (r() < 0.5 ? 1 : -1), -3, 4); }
      else if (x < 0.5) this.motif.ci += 1 + Math.floor(r() * 3);
      else if (x < 0.65) this.motif = this.#motif();
    }
    const turned = key !== this.key;
    this.key = key;
    this.sec = { start: n, idx, texture: null, lead: r() < 0.5 ? 0 : 1, solo: (idx + (this.seed & 1)) % 2, turned, theme };
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
      // functional harmony: home, then chords that lead somewhere, then a cadence. The question ends open
      // (on the dominant, or the chord this mode leans on instead of it); the answer closes, unless
      // tension deceives it
      const pre = (x) => { const p = []; for (const [y, list] of Object.entries(FLOW)) for (const [z, w] of list) if (z === x) p.push([+y, w]); return p.length ? p : [[4, 1]]; };
      const firm = mode.idx >= 3 || T > 0.35;
      const opener = ph === 0 || answer ? 0 : weighted(r, [[0, 3], [5, 1], [3, 1.2]]);
      let cad, pen;
      if (answer) { cad = r() < T * 0.35 ? 5 : 0; pen = weighted(r, [[4, firm ? 3 : 1], [MODAL[mode.idx], 2], [3, 0.8]]); }
      else { cad = weighted(r, [[4, firm ? 2.5 : 0.8], [MODAL[mode.idx], 1.6], [3, 0.7]]); pen = weighted(r, pre(cad)); }
      const mid = weighted(r, FLOW[opener].map(([d, w]) => [d, w * (FLOW[d].some(([x]) => x === pen) ? 2.5 : 1)]));
      let ds = J < 0.25 ? (answer ? [pen, pen, cad, cad] : [opener, opener, cad, cad]) : [opener, mid, pen, cad];
      ds = ds.map((d) => (this.#tones(C(d))[2] === 6 ? (d + 5) % 7 : d));        // a diminished chord gives way to the one a third below
      bars = ds.map((x, b) => { const dom = x === 4 && b >= 2 && (T > 0.35 || mode.idx <= 2); return [C(x, { dom, b9: dom && T > 0.65 })]; });
      // a suspension over the cadence, resolved halfway through the bar
      if (T > 0.35 && r() < T) bars[3] = [{ ...bars[3][0], sus: true }, bars[3][0]];
      // a quick journey: a chord on the half-bar that leads into the next
      if (J > 0.65) for (const b of [1, 2]) if (bars[b].length === 1 && r() < J) { const x = weighted(r, pre(bars[b + 1][0].d)); if (x !== bars[b][0].d) bars[b] = [bars[b][0], C(x)]; }
    }
    // a turned key arrives by its dominant
    if (i < 4 && this.sec.turned) bars[0] = [C(4, { dom: true })];
    return { ph, bars, sig: [T, J, k.duende, k.light] };
  }

  // ---- voicings --------------------------------------------------------------------------------------

  /** A piano voicing: a low root, then the colour tones near the last voicing, between lo and hi. */
  #voicing(ch, lo, hi, avoid = null) {
    const nt = this.#nt(), air = this.k.air;
    let bass = this.#ct(ch, 0) - 12;
    while (bass > 50) bass -= 12; while (bass < 33) bass += 12;
    if (air > 0.65 && bass - 12 >= 28) bass -= 12;                    // air: the bass lower, the hands apart
    let tones = [1, 2, 3, 4].slice(0, nt - 1).map((j) => this.#ct(ch, j));
    // a colour tone a semitone from the tune is left out (if two tones remain)
    if (avoid && avoid.size) { const ok = tones.filter((m) => ![...avoid].some((q) => { const d = (((m - q) % 12) + 12) % 12; return d === 1 || d === 11; })); if (ok.length >= 2) tones = ok; }
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

  /** A guitar shape: each string a chord tone, the root (or fifth) in the bass, in the hand position
   * nearest where the hand already is (open strings welcome, stretches and high positions not). */
  #shape(ch) {
    const t = this.#tones(ch), b = this.#deg(ch.d), nt = Math.min(4, this.#nt());
    const pcs = new Set(t.slice(0, nt).map((x) => (b + x) % 12)), rootPc = b % 12, fifthPc = (b + t[2]) % 12;
    let best = null, cost0 = Infinity;
    for (const need of [4, 3]) {
      for (const pos of [0, 1, 2, 3, 4, 5, 7, 9]) {
        const s = [];
        for (let k = 0; k < 6; k++) {
          let found = -1;
          for (let f = pos; f <= pos + 3; f++) if (pcs.has((OPEN[k] + f) % 12)) { found = f; break; }
          if (found < 0 && pcs.has(OPEN[k] % 12)) found = 0;
          s.push(found);
        }
        let bassK = -1;
        for (const want of [rootPc, fifthPc]) { for (const k of [5, 4, 3]) if (s[k] >= 0 && (OPEN[k] + s[k]) % 12 === want) { bassK = k; break; } if (bassK >= 0) break; }
        if (bassK < 0) continue;
        for (let k = 5; k > bassK; k--) s[k] = -1;
        const on = s.filter((f) => f >= 0); if (on.length < need) continue;
        const fr = on.filter((f) => f > 0), at = fr.length ? fr.reduce((a, f) => a + f, 0) / fr.length : this.handAt;
        const cost = Math.abs(at - this.handAt) + 0.3 * (fr.length ? Math.max(...fr) - Math.min(...fr) : 0) - 0.3 * (on.length - fr.length) + 0.12 * at + ((OPEN[bassK] + s[bassK]) % 12 === rootPc ? 0 : 1.2);
        if (cost < cost0) { cost0 = cost; best = { s, at }; }
      }
      if (best) break;
    }
    if (!best) return null;
    this.handAt += (best.at - this.handAt) * 0.7;
    return best.s.map((f, k) => (f >= 0 ? { string: k + 1, midi: OPEN[k] + f } : null));
  }
  /** A melody note onto the strings it may use: lowest fret within reach (to 17), an octave moved only if none can. */
  #onString(midi, strings = [1, 2, 3]) {
    for (const oct of [0, -12, 12]) for (const reach of [12, 17]) {
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

  /** The motif's rhythm at this energy and style (`dense` asks for a busier cell, to develop it). */
  #cell(dense = 0) {
    const e = this.k.energy + dense, { fw, jw } = styleOf(this.k.duende);
    const pool = e < 0.15 ? 'still' : jw > 0.5 ? (e < 0.3 ? 'slow' : 'swing') : fw > 0.5 ? (e < 0.25 ? 'slow' : 'compas') : e < 0.3 ? 'slow' : e < 0.68 ? 'mid' : 'fast';
    const P = CELLS[pool];
    return P[this.motif.ci % P.length];
  }
  /** A phrase's plan for its tune: where each bar aims, as a height in the register. The question rises
   * and stays open; the answer climbs to the period's peak (its second or third bar: the sixth or seventh
   * of eight) and falls home. And how the third bar develops the motif. */
  #tunePlan(ph) {
    const r = this.r, answer = ph % 2 === 1;
    const Q = [[0.3, 0.45, 0.6, 0.45], [0.4, 0.55, 0.45, 0.5], [0.25, 0.4, 0.55, 0.55]];
    const A = [[0.5, 0.95, 0.7, 0.25], [0.45, 0.75, 0.95, 0.3], [0.6, 0.95, 0.6, 0.3]];
    return { id: `${this.sec.idx}:${ph}`, shape: pick(r, answer ? A : Q), invert: answer && r() < 0.3, dev: pick(r, ['sequence', 'fragment', 'diminish', 'invert']) };
  }
  #isCT(d, c) { const x = (((d - c.d) % 7) + 7) % 7; return x === 0 || x === 2 || x === 4 || (x === 6 && styleOf(this.k.duende).jw > 0.5); }
  /** The chord-tone degree nearest a MIDI height, within the register. */
  #nearCT(aim, c, low, high) {
    let best = null, bd = Infinity;
    for (let d = -14; d <= 42; d++) {
      if (!this.#isCT(d, c)) continue;
      const m = this.#deg(d); if (m < low || m > high + 2) continue;
      // the third over the bass rather than its root or fifth: the outer voices move in imperfect consonance
      const x = Math.abs(m - aim) + ({ 0: 1.5, 4: 0.8 }[(((d - c.d) % 7) + 7) % 7] ?? 0) + (m === this.lastMel ? 2.5 : 0);   // and not the note just sung
      if (x < bd) { bd = x; best = d; }
    }
    return best ?? c.d + 14;
  }
  /** Degree d, or the chord tone a step from it (a tie goes the way the line is going). */
  #snapCT(d, c, dir = 0) { if (this.#isCT(d, c)) return d; const up = this.#isCT(d + 1, c), dn = this.#isCT(d - 1, c); if (up && dn) return dir < 0 ? d - 1 : d + 1; return up ? d + 1 : dn ? d - 1 : d; }

  /**
   * One bar of the tune. Its first note is the chord tone nearest where the phrase's plan aims this bar;
   * then the motif (stated in the first two bars, developed in the third) or, past its head, steps toward
   * where the next bar aims. Every note on a beat is a chord tone; between beats, passing and neighbour
   * notes. A leap is answered by a step back. The fourth bar is a cadence: the question ends open, on the
   * key's fifth, second or seventh; the answer closed, on its tonic or third; each approached by step.
   */
  #melody(i, ch, ch2, low, high, nextCh) {
    const r = this.r, ph = Math.floor(i / 4), inP = i % 4, answer = ph % 2 === 1, k = this.k;
    if (!this.mp || this.mp.id !== `${this.sec.idx}:${ph}`) this.mp = this.#tunePlan(ph);
    const mp = this.mp, span = high - low, aimAt = (b) => low + span * mp.shape[b], degM = (d) => this.#deg(d);
    let head = mp.invert ? this.motif.head.map((x) => -x) : this.motif.head, cell = this.#cell();
    if (inP === 2) {
      if (mp.dev === 'fragment' && cell.length >= 3) { const h = cell.slice(0, 2), s = h[0] + h[1]; cell = 12 - 2 * s > 0 ? [...h, ...h, 12 - 2 * s] : [...h, ...h]; head = [0, head[1], 1, head[1] + 1, head[1] + 2]; }
      if (mp.dev === 'diminish') cell = this.#cell(0.35);
      if (mp.dev === 'invert') head = head.map((x) => -x);
    }
    if (inP === 3) cell = k.energy > 0.7 ? [1, 1, 1, 9] : answer ? [3, 9] : pick(r, [[2, 1, 9], [3, 3, 6]]);
    const ticks = []; { let t = 0; for (const len of cell) { ticks.push(t); t += len; } }
    const half = (t) => (t < 6 ? ch : ch2);
    const rise = inP < 3 ? 1.7 * Math.max(0, ...head.slice(0, cell.length)) : 0;      // how far the motif climbs above its first note
    const aim = (this.lastMel != null && inP > 0 ? 0.8 * aimAt(inP) + 0.2 * this.lastMel : aimAt(inP)) - rise;
    const degs = [this.#nearCT(aim, ch, low, high)];
    const goal = inP < 3 ? this.#nearCT(aimAt(inP + 1), nextCh, low, high) : null;
    for (let j = 1; j < cell.length; j++) {
      const t = ticks[j], c = half(t), strong = t % 3 === 0, prev = degs[j - 1];
      let d;
      if (inP < 3 && j < head.length) d = degs[0] + head[j];
      else { const g = goal ?? prev; d = prev === g ? prev + (r() < 0.5 ? 1 : -1) : prev + Math.sign(g - prev) * (Math.abs(g - prev) > 2 && r() < 0.3 ? 2 : 1); }
      if (strong) d = this.#snapCT(d, c, d - prev);
      if (j >= 2) {                                                  // a leap is answered by a step back
        const a = degM(prev) - degM(degs[j - 2]), b = degM(d) - degM(prev);
        if (Math.abs(a) > 4 && (Math.sign(b) === Math.sign(a) || Math.abs(b) > 4)) { d = prev - Math.sign(a); if (strong && !this.#isCT(d, c)) d = prev - 2 * Math.sign(a); }
      }
      if (Math.abs(degM(d) - degM(prev)) > 9) d = this.#snapCT(prev + Math.sign(d - prev) * 2, c);
      if (d === prev && (strong || (j >= 2 && prev === degs[j - 2]))) { const g = goal ?? prev + 1, dir = g >= prev ? 1 : -1; d = strong ? this.#snapCT(d + dir, c, dir) : d + dir; if (d === prev) d = this.#snapCT(d + 2 * dir, c, dir); }
      degs.push(d);
    }
    if (inP === 3) {
      const prefer = answer ? [0, 2] : [4, 1, 6], n = degs.length, c = half(ticks[n - 1]);
      let fin = degs[n - 1], fd = Infinity;
      for (let d = -14; d <= 42; d++) {
        const m = degM(d); if (m < low - 2 || m > high + 2) continue;
        const x = Math.abs(m - aimAt(3)) + (prefer.includes(((d % 7) + 7) % 7) && this.#isCT(d, c) ? 0 : this.#isCT(d, c) ? 6 : 99);
        if (x < fd) { fd = x; fin = d; }
      }
      degs[n - 1] = fin;
      for (let j = n - 2; j >= 1; j--) {
        const sg = answer ? 1 : -1, d = degs[j + 1] + sg, c2 = half(ticks[j]);
        let x = ticks[j] % 3 === 0 ? this.#snapCT(d, c2, sg) : d;
        if (x === degs[j + 1]) x = this.#snapCT(degs[j + 1] + 2 * sg, c2, sg);
        degs[j] = x;
      }
      if (n > 1 && Math.abs(degs[0] - degs[1]) > 3) degs[0] = this.#snapCT(degs[1] + (answer ? 2 : -2), ch);
    }
    // the bar into its register, by octaves of the whole line
    let mids = degs.map(degM);
    const lo = Math.min(...mids), hi = Math.max(...mids), off = hi > high + 3 ? -12 : lo < low - 3 ? 12 : 0;
    mids = mids.map((m) => m + off);
    const notes = [];
    cell.forEach((len, j) => {
      const t = ticks[j], lastNote = j === cell.length - 1;
      if (j > 0 && !lastNote && t % 3 !== 0 && r() < Math.max(0, k.air - 0.45) * 0.5) return;   // air: rests, off the beat
      notes.push({ tick: t, len: lastNote && inP === 3 ? len + 3 : len, midi: this.#fit(mids[j], half(t)), strong: t % 3 === 0 });
    });
    // a question may lead into its answer: two notes stepping up from where it stopped
    if (inP === 3 && !answer && k.energy > 0.35 && r() < 0.5 && notes.length) {
      const f = notes[notes.length - 1];
      if (f.tick <= 6) { f.len = 10 - f.tick; let d = degs[degs.length - 1]; for (const t of [10, 11]) { d += 1; notes.push({ tick: t, len: 1, midi: this.#fit(degM(d) + off, ch2), strong: false }); } }
    }
    if (notes.length) this.lastMel = notes[notes.length - 1].midi;
    return notes;
  }

  // ---- a bar -------------------------------------------------------------------------------------------

  /** Compose the next bar under the dials `knobs` (each 0..1; missing ones keep their last value). */
  next(knobs = {}) {
    const k = (this.k = { ...this.k, ...knobs }), r = this.r;
    const target = 44 + 76 * k.pace;
    this.bpm = this.bpm == null ? target : this.bpm + (target - this.bpm) * 0.35;
    const beat = 60 / this.bpm, T = beat / 3, t0 = this.t, n = this.n;
    const { fw, jw } = styleOf(k.duende);
    const targetLen = Math.max(8, 4 * Math.round((32 - 24 * k.journey) / 4));
    let i = this.sec ? n - this.sec.start : 0;
    if (!this.sec || (i % 4 === 0 && i >= targetLen)) { this.#newSection(n, k); i = 0; }
    const sec = this.sec, ph = Math.floor(i / 4), inP = i % 4;
    this.mode = this.#modeFor(k);
    const how = manner(k.conversation), solo = how === 'solo' ? sec.solo : -1;
    // the texture: kept while the dials still suit it, and changed at a phrase's start (at once only if
    // the dials have left it far behind); re-chosen at a section, sometimes at a phrase
    const W = this.weights(k, solo), mx = Math.max(...Object.values(W));
    const cur = W[sec.texture] ?? 0;
    if (!sec.texture || !(cur > 0.08 * mx) || (inP === 0 && (!(cur > 0.3 * mx) || (i > 0 && r() < 0.08 + 0.3 * k.journey)))) sec.texture = weighted(r, Object.entries(W));
    // the harmony: this phrase's plan, re-made if the dials that shape it have moved
    const moved = this.phrase && this.phrase.sig.some((v, j) => Math.abs(v - [k.tension, k.journey, k.duende, k.light][j]) > (j === 3 ? 0.2 : 0.12));
    if (!this.phrase || this.phrase.secIdx !== sec.idx || this.phrase.ph !== ph || moved) this.phrase = { ...this.#planPhrase(i, k), secIdx: sec.idx };
    const half = this.phrase.bars[inP], ch = half[0], ch2 = half[1] || half[0];
    const nextCh = inP < 3 ? this.phrase.bars[inP + 1][0] : { d: 0 };
    const last = inP === 3 && i + 1 >= targetLen;                   // the section's seam: thin out
    // who plays
    let lead, comp;
    if (how === 'solo') lead = comp = sec.solo;
    else if (how === 'accompany') { lead = sec.lead; comp = 1 - lead; }
    else if (how === 'trade') { lead = (ph + sec.lead) % 2; comp = 1 - lead; }
    else { lead = (i + sec.lead) % 2; comp = 1 - lead; }
    const tex = sec.texture, e = k.energy, air = k.air, answer = ph % 2 === 1;

    // ---- time. The bar's ticks into seconds: swung (in 12/8 a beat is already three: jazz flattens the
    // triplet toward straight as the tempo rises), and held back into a cadence (a ritardando over the
    // bar's second half, more when it is calm and spacious, most at a section's end)
    const rho = 2 - 0.6 * clamp((this.bpm - 70) / 60, 0, 1) * jw, p2 = (3 * rho) / (1 + rho);
    let R = inP === 3 ? (0.04 + 0.1 * (1 - e)) * (0.5 + 0.5 * air) * (answer ? 1 : 0.45) * (tex === 'buleria' || tex === 'swing' ? 0.25 : 1) : 0;
    if (last) R += 0.1;
    const warp0 = (x) => { const b = Math.floor(x / 3), f = x - 3 * b; let y = 3 * b + (f <= 2 ? (f * p2) / 2 : p2 + (f - 2) * (3 - p2)); if (R > 0 && y > 6) y += (R * (y - 6) ** 3) / 108; return y; };
    const end = warp0(12), warp = (x) => (x <= 12 ? warp0(x) : end + (x - 12) * (1 + 2 * R)), barSec = T * end;
    // the hands: the bass on the beat, the accompaniment a hair after, the tune laid back (more in jazz),
    // and each hand's lateness wandering slowly, as a player's does
    for (const h of ['mel', 'comp']) this.hd[h] = clamp(this.hd[h] + (r() - 0.5) * 0.004, -0.008, 0.008);
    const lag = { bass: 0, comp: 0.003 + this.hd.comp, echo: 0.005 + this.hd.comp, mel: 0.007 + 0.016 * jw + this.hd.mel, orn: 0.007 + 0.016 * jw + this.hd.mel };
    const when = (tick, ro) => t0 + Math.max(0, T * warp(tick) + (lag[ro] ?? 0) + (r() - 0.5) * 0.006);
    const durOf = (tick, len) => Math.max(0.3 * T, T * (warp(tick + Math.max(0.3, len)) - warp(tick)));
    // loudness: the energy, the phrase's arc, the beat's weight
    const out = [], ev = 0.5 + 0.65 * e;
    const arc = (0.78 + 0.22 * Math.sin(Math.PI * (inP + 0.5) / 4)) * (0.85 + 0.15 * Math.sin(Math.PI * Math.min(1, i / targetLen)));
    const metric = (tick) => (tick === 0 ? 1.08 : tick === 6 ? 1.03 : Math.abs(tick % 3) < 1e-6 ? 1 : 0.9);
    let win = [0, 12], role = 'comp';
    const roleOf = (midi, tick, ro) => ro ?? (role === 'comp' && midi < 52 && Math.abs(tick % 3) < 1e-6 ? 'bass' : role);
    let top = 127;                                                   // the accompaniment's ceiling: under the tune
    // the pedal changes with the chord: a held accompaniment note stops at the change unless the next
    // chord has it too (it rang on into the next bar before, and rubbed against the tune there)
    const nextPcs = (c) => new Set([0, 1, 2, 3, 4].slice(0, this.#nt()).map((j) => this.#ct(c, j) % 12));
    let held = null;
    const pedal = (tick, len, midi, ro) => {
      if (ro !== 'comp' && ro !== 'bass') return len;
      const edge = win[1] === 6 ? 6 : 12;
      if (tick + len <= edge + 0.02) return len;
      held ??= { 6: nextPcs(ch2), 12: nextPcs(nextCh) };
      return held[edge].has(((midi % 12) + 12) % 12) ? len : Math.max(0.4, edge - tick);
    };
    const P = (tick, len, midi, vel, ro) => {
      if (tick < win[0] - 1e-6 || tick >= win[1] || midi < 21 || midi > 105) return;
      ro = roleOf(midi, tick, ro);
      if (ro === 'comp') while (midi > top && midi - 12 >= 40) midi -= 12;
      len = pedal(tick, len, midi, ro);
      const at = when(tick, ro), dur = durOf(tick, len);
      // a short note never re-strikes a key that is still sounding longer: it would cut it
      if (out.some((x) => x.inst === 0 && x.midi === midi && x.at < at && x.at + x.dur > at + dur + 0.3)) return;
      out.push({ at, dur, midi, vel: clamp(vel * ev * arc * metric(tick) * (0.94 + 0.12 * r()), 0.04, 1), inst: 0, role: ro, tick, bar: n });
    };
    const thin = k.thin ?? 1;
    const G = (tick, len, s, midi, vel, art = 0, ap = 0, ro) => {
      if (tick < win[0] - 1e-6 || tick >= win[1]) return;
      if (thin < 1 && vel < 100 && r() > thin) return;
      ro = roleOf(midi, tick, ro);
      len = pedal(tick, len, midi, ro);
      out.push({ at: when(tick, ro), dur: durOf(tick, len), midi, vel: clamp(vel * ev * arc * metric(tick) * (0.92 + 0.16 * r()), 20, 220), inst: 1, string: s, art, ap, role: ro, tick, bar: n });
    };

    // the tune first (the accompaniment keeps out of its register), then the bar half by half when the
    // chord changes in the middle
    const halves = half.length > 1 ? [[ch, 0, 6], [ch2, 6, 12]] : [[ch, 0, 12]];
    const pianoSings = lead === 0, guitarSings = lead === 1;
    const lowM = Math.round(64 + 8 * air), highM = lowM + 15;                // one register for the tune, whoever sings it
    const line = this.#melody(i, ch, ch2, lowM, highM, nextCh);
    for (const [c, a, b] of halves) {
      win = [a, b]; role = 'comp'; top = lowM - 3;
      // the tune's notes in this half: the accompaniment leaves out what would rub a semitone against them
      const avoid = new Set(line.filter((m) => m.tick >= a && m.tick < b && (m.strong || m.len >= 3)).map((m) => m.midi % 12));
      const x = { ch: c, next: b === 12 ? nextCh : ch2, i, inP, last, e, air, fw, jw, T, line, solo: how === 'solo', duel: how === 'duel' };
      if (comp === 0) this.#pianoComp(tex, P, { ...x, v: this.#voicing(c, 48, lowM - 3, avoid) });
      else this.#guitarComp(tex, G, { ...x, shape: this.#shape(c), sings: guitarSings, ceil: lowM - 3, avoid });
    }
    win = [0, 12]; role = 'mel'; top = 127;
    this.#sing(tex, lead, line, P, G, { ch, ch2, i, inP, e, fw, jw, last, T, low: lowM, high: highM, answer, sing: !(last && r() < 0.5) });
    // the duel: the other answers in the gap the line leaves at its end
    role = 'echo';
    if (how === 'duel' && line.length) {
      const endT = line[line.length - 1].tick;
      if (endT <= 8) {
        const echo = line.slice(0, 3).map((m, j) => ({ tick: Math.max(endT + 2, 9) + j, midi: m.midi - (comp === 0 ? 0 : 12) - 3 }));
        for (const m of echo) if (m.tick < 12) {
          if (comp === 0) P(m.tick, 1.5, this.#fit(this.#snap(m.midi), ch2) + 12, 0.42, 'echo');
          else { const p = this.#onString(this.#fit(this.#snap(m.midi + 12), ch2)); G(m.tick, 1.5, p.string, p.midi, 125, 0, 0, 'echo'); }
        }
      }
    }
    // block chords rolled from the bottom, wider when it is slow and open (never the comping of swing or compás)
    if (tex !== 'swing' && tex !== 'buleria') {
      const roll = 0.006 + 0.018 * air * (1 - e), groups = new Map();
      for (const x of out) if (x.inst === 0 && (x.role === 'comp' || x.role === 'bass')) { const key = x.tick.toFixed(3); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(x); }
      for (const g of groups.values()) if (g.length >= 3) { g.sort((a, b) => a.midi - b.midi); const a0 = Math.min(...g.map((x) => x.at)); g.forEach((x, j) => (x.at = a0 + j * roll)); }
    }
    out.sort((a, b) => a.at - b.at);
    this.t += barSec; this.n++;
    const tense = clamp(0.12 * (this.#nt() - 3) + (ch.dom || ch2.dom ? 0.2 : 0) + (ch.b9 || ch2.b9 ? 0.2 : 0) + (ch.sus ? 0.2 : 0) + (inP === 3 && ch.d !== 0 ? 0.15 : 0) + 0.15 * (this.key !== 0), 0, 1);
    const info = {
      bar: n, bpm: Math.round(this.bpm), key: NAMES[this.root % 12], mode: this.mode.name, chord: half.map((c) => this.symbol(c)).join(' '),
      texture: tex, lead: lead === 0 ? 'piano' : 'guitar', manner: how, tense, bright: this.mode.bright, section: sec.idx, inPhrase: inP, home: this.key === 0,
      i, ph, theme: !!sec.theme, root: this.root % 12, split: half.length > 1, scale: this.mode.scale.map((x) => (this.root + x) % 12),
      pcs: half.map((c) => [0, 1, 2, 3, 4].slice(0, this.#nt()).map((j) => this.#ct(c, j) % 12)),
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
    if (ss.filter((s) => s.midi <= x.ceil).length >= 3) ss = ss.filter((s) => s.midi <= x.ceil);     // under the tune
    const rub = (m) => [...(x.avoid || [])].some((q) => { const d = (((m - q) % 12) + 12) % 12; return d === 1 || d === 11; });
    if (ss.filter((s) => !rub(s.midi)).length >= 2) ss = ss.filter((s) => !rub(s.midi));               // and off its semitones
    if (!ss.length) ss = [this.#bassString(this.#ct(x.ch, 0))];
    const bass = ss[0], top = ss.slice(1);
    const strum = (tick, len, vel, up = false, n = 6, spread = 0.05) => {
      const use = (up ? [...ss].reverse() : ss).slice(0, n);
      use.forEach((s, q) => G(tick + q * spread, len, s.string, s.midi, vel - q * 3));
    };
    const harmonics = (n) => {
      const pcs = new Set([0, 1, 2, 3].slice(0, this.#nt()).map((j) => this.#ct(x.ch, j) % 12)), hs = [];
      for (let s = 1; s <= 6; s++) for (const [fret, up] of [[12, 12], [7, 19], [5, 24]]) if (pcs.has((OPEN[s - 1] + up) % 12) && !(sings && solo && s <= 2) && (sings || OPEN[s - 1] + up <= x.ceil || OPEN[s - 1] + up >= x.ceil + 21)) hs.push({ s, midi: OPEN[s - 1] + up, fret });
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
    // a line is shaped: louder as it climbs, the beats leaning, the answer's last note let go softly
    const shape = (m, j) => (0.86 + 0.28 * clamp((m.midi - x.low) / (x.high - x.low), 0, 1)) * (m.strong ? 1.04 : 0.92) * (x.inP === 3 && x.answer && j === line.length - 1 ? 0.82 : 1);
    if (lead === 0) {
      line.forEach((m, j) => {
        if (sparse && line.length >= 4 && j % 2 === 1 && k.energy < 0.5) return;
        const v = (sparse ? 0.34 : 0.52) * shape(m, j);
        if (m.len >= 3 && m.tick >= 1 && r() < approach) P(m.tick - 0.33, 0.33, m.midi - 1, v * 0.7, 'orn');   // a chromatic approach
        P(m.tick, m.len + (sparse ? 6 : 1), m.midi, v, 'mel');
        // thirds or sixths under it, when the room is close and the music is calm
        if (tex === 'sea' || (k.air < 0.4 && k.energy < 0.6 && j % 2 === 0)) P(m.tick + 0.05, m.len, this.#fit(this.#deg(this.#below(m.midi, tex === 'sea' ? 5 : 2)), m.tick < 6 ? x.ch : x.ch2), v * 0.6, 'orn');
        if (m.len >= 6 && r() < ornament) {
          // a turn: the note above, the note below, and back to the note, held to where it would have ended
          // (a short re-strike of the same key cut the note: the owner heard "a-b-a with the last a stopped short")
          const end = m.tick + m.len + (sparse ? 6 : 1), up = this.#snap(m.midi + 2), dn = this.#snap(m.midi - 1);
          P(m.tick + 0.5, 0.25, up, v * 0.6, 'orn'); P(m.tick + 0.75, 0.25, dn, v * 0.55, 'orn'); P(m.tick + 1, end - m.tick - 1, m.midi, v * 0.75, 'orn');
        }
      });
      return;
    }
    // the guitar: tremolo in the falls, picado in a falseta, otherwise plucked on the treble strings
    const strings = x.solo ? [1, 2] : [1, 2, 3];
    if (tex === 'falls') {
      for (let b = 0; b < 4; b++) {
        const m = line.filter((n) => n.tick <= b * 3).pop() || line[0], p = this.#onString(m.midi, [1, 2]);
        for (let q = 1; q <= 3; q++) G(b * 3 + q * 0.75, 0.75, p.string, p.midi, (100 + (q === 1 ? 12 : 0)) * shape(m, 0), 0, 0, q === 1 ? 'mel' : 'orn');
      }
      return;
    }
    line.forEach((m, j) => {
      const p = this.#onString(m.midi, strings), nx = line[j + 1];
      if (sparse && line.length >= 4 && j % 2 === 1 && k.energy < 0.5) return;
      if (m.len >= 3 && m.tick >= 1 && r() < approach) { const a = this.#onString(m.midi - 1, strings); G(m.tick - 0.33, 0.33, a.string, a.midi, 110, 0, 0, 'orn'); }
      const orn = !(tex === 'falseta' && nx && m.len >= 2) && m.len >= 6 && r() < ornament;
      G(m.tick, orn ? 0.5 : m.len + 2, p.string, p.midi, (sparse ? 125 : 142) * shape(m, j), 0, 0, 'mel');
      // picado: a run up or down the scale into the next note, two to a tick
      if (tex === 'falseta' && nx && m.len >= 2 && r() < 0.4 + 0.5 * k.energy) {
        const n = Math.min(Math.floor((m.len - 1) * 2), 6), dir = Math.sign(nx.midi - m.midi) || 1;
        let q = m.midi;
        for (let z = 1; z <= n; z++) { q = this.#snap(q + dir * 2); const s = this.#onString(q, strings); G(m.tick + 1 + (z - 1) * 0.5, 0.5, s.string, s.midi, 120, 0, 0, 'orn'); }
      } else if (orn) {
        // a hammer-on to the note above and a pull-off back, on the same string (slurs: one pluck), the
        // note then ringing for the rest of its length. It was three plucks, the last only a third of a
        // tick long and owning the string, so the held note stopped short
        const up = this.#snap(m.midi + 2), upF = up - OPEN[p.string - 1];
        if (upF <= 19) { G(m.tick + 0.5, 0.3, p.string, up, 110, 1, 0, 'orn'); G(m.tick + 0.8, m.len + 1.2, p.string, p.midi, 110, 2, 0, 'orn'); }
        else G(m.tick + 0.5, m.len + 1.5, p.string, p.midi, 100, 6, 0, 'orn');           // no room above: the note just ties on
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
