// compose.js — a Duende for every landscape: endless music for piano and guitar, composed as it
// plays. Pure: node, browser, worker.
//
// The landscape supplies the material and the moment supplies the mood:
//   - the biome is the home (alpine D, canyon A Phrygian dominant as Duende's, autumn E, alien F#)
//     and the seed grows three motifs: a call, an answer, and a figure for the bass;
//   - the light is the mode's brightness, read on a ladder from dark to bright (Phrygian, Aeolian,
//     Dorian, Mixolydian, Ionian, Lydian) over the same root, so the music turns by modal colour,
//     never by a lurch of key; night darkens it, noon brightens it;
//   - the texture is a place in the scene: LAKE (the piano's pedalled arpeggios, guitar harmonics),
//     FALLS (guitar tremolo over held piano chords), RIVER (a guitar ostinato under the piano's
//     song), MOUNTAINS (rolled chords and strums on the accents), STARS (sparse, high, harmonics).
//     In the painting the time of day chooses; in the flight, where the camera is.
//
// Time runs at four scales so that it never wanders and never loops: the 12/8 bar (the palette's
// beat, three ticks to it); the four-bar phrase, paired as question and answer and traded between
// the instruments; the 32-bar section, which picks a texture and a harmonic plan; and the day.
// The motifs are remembered: each phrase states, varies (sequence, inversion, fragment,
// augmentation) or returns one, and a section opens by bringing back what an earlier one sang.
// Nothing ends. A section's last bar thins out, and the next begins on a pedal.
//
// new Composer({ seed, biome, bpm }).bar(n, cond) → the notes of bar n (seconds from bar 0):
//   { at, dur, midi, vel, inst: 0 piano | 1 guitar, string, art, ap }
// cond = { el, rising, night, cover, moon, place?, density }, all 0..1 but el (−1..1).

const LADDER = [
  ['phrygian', [0, 1, 3, 5, 7, 8, 10]], ['aeolian', [0, 2, 3, 5, 7, 8, 10]], ['dorian', [0, 2, 3, 5, 7, 9, 10]],
  ['mixolydian', [0, 2, 4, 5, 7, 9, 10]], ['ionian', [0, 2, 4, 5, 7, 9, 11]], ['lydian', [0, 2, 4, 6, 7, 9, 11]],
];
const PHRYG_DOM = [0, 1, 4, 5, 7, 8, 10];
const HOME = {
  alpine: { root: 50, base: 4, flamenco: false },
  canyon: { root: 45, base: 0, flamenco: true },
  autumn: { root: 52, base: 2, flamenco: false },
  alien: { root: 54, base: 3, flamenco: false },
};
const OPEN = [64, 59, 55, 50, 45, 40];
export const TEXTURES = ['lake', 'falls', 'river', 'mountains', 'stars'];
// 12/8 rhythmic cells: ticks (a tick is a third of a beat), 12 to the bar
const CELLS = [[3, 3, 3, 3], [2, 1, 3, 2, 1, 3], [1, 1, 1, 3, 3, 3], [6, 3, 3], [3, 1, 1, 1, 6], [2, 1, 2, 1, 6], [3, 3, 6], [1, 2, 3, 6]];

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function weighted(r, pairs) {
  let s = 0; for (const [, w] of pairs) s += w;
  let x = r() * s; for (const [v, w] of pairs) { x -= w; if (x <= 0) return v; }
  return pairs[pairs.length - 1][0];
}

export class Composer {
  constructor({ seed = 1, biome = 'alpine', bpm = 56 } = {}) {
    this.seed = seed; this.home = HOME[biome] || HOME.alpine; this.biome = biome;
    this.beat = 60 / bpm; this.barSec = 4 * this.beat; this.tick = this.beat / 3;
    this.r = rng(seed * 7919 + 13);
    // the motifs: a call and an answer (rhythm cell + steps), a bass figure
    this.motifs = [this.#motif(), this.#motif(), this.#motif(true)];
    this.sung = [];                  // motifs as they were last sung (for returns)
    this.section = null; this.prevVoicing = null; this.gpos = 0;
  }

  #motif(bass = false) {
    const r = this.r, cell = pick(r, CELLS);
    let s = 0;
    const steps = cell.map((_, i) => {
      if (i === 0) return 0;
      const leap = r() < (bass ? 0.4 : 0.22);
      const d = leap ? pick(r, [3, 4, -3, -2, 5]) : pick(r, [1, -1, 1, -1, 2, -2, 0]);
      s += d; if (Math.abs(s) > 6) s -= 2 * d;
      return s;
    });
    return { cell, steps };
  }

  /** Which texture the moment asks for. */
  #texture(cond) {
    if (cond.place) return cond.place;
    const r = this.r;
    // the weather first: a storm is the mountains, fog the lake, snow the stars, rain the river or the fall
    if ((cond.storm || 0) > 0.35) return 'mountains';
    if ((cond.snow || 0) > 0.3) return weighted(r, [['stars', 3], ['lake', 1]]);
    if ((cond.fog || 0) > 0.5) return weighted(r, [['lake', 3], ['stars', 1]]);
    if ((cond.rain || 0) > 0.3) return weighted(r, [['river', 2], ['falls', 1.6], ['lake', 0.6]]);
    if (cond.night > 0.6) return weighted(r, [['stars', 3], ['lake', 2], ['falls', 0.6]]);
    if (cond.el < 0.15) return weighted(r, [['falls', 2], ['lake', 2], ['river', 1]]);       // dawn and dusk
    return weighted(r, [['river', 2.2], ['lake', 1.4], ['mountains', 1.2 * (1 - cond.cover)], ['falls', 0.8]]);
  }

  /** The mode for the light: the biome's place on the ladder, moved by the sun. */
  #mode(cond) {
    if (this.home.flamenco) return { name: cond.el > 0.25 ? 'phrygian dominant' : 'phrygian', scale: cond.el > 0.25 || cond.night < 0.3 ? PHRYG_DOM : LADDER[0][1] };
    const k = clamp(this.home.base + Math.round(cond.el * 1.6 + (cond.night > 0.7 ? -0.6 : 0)), 0, LADDER.length - 1);
    return { name: LADDER[k][0], scale: LADDER[k][1] };
  }

  /** A section: texture, mode, harmonic plan (one chord per bar or per two), the motif to open with. */
  #plan(n, cond) {
    const r = this.r, texture = this.#texture(cond), mode = this.#mode(cond);
    const slow = texture === 'stars' || texture === 'lake' || cond.night > 0.5;
    const chords = [];
    for (let p = 0; p < 8; p++) {                                  // eight phrases of four bars
      const answer = p % 2 === 1, phrase = [];
      let d = p === 0 ? 0 : answer ? weighted(r, [[0, 2], [5, 1], [3, 1]]) : weighted(r, [[0, 3], [5, 1], [3, 1.4]]);
      for (let b = 0; b < 4; b++) {
        if (b > 0 && !(slow && b % 2 === 1)) {
          if (b === 3) d = answer ? weighted(r, [[0, 3], [5, 1.2], [3, 0.8]]) : weighted(r, [[4, 1.6], [3, 1.6], [6, 1], [1, 0.6]]);
          else d = ((d + weighted(r, [[3, 3], [-1, 3], [1, 2], [-2, 2], [2, 1], [-3, 1.4]])) % 7 + 7) % 7;
        }
        phrase.push(d);
      }
      chords.push(...phrase);
    }
    if (this.home.flamenco) {                                       // the Andalusian descent, as in Duende
      for (let p = 1; p < 8; p += 3) chords.splice(p * 4, 4, 3, 2, 1, 0);
    }
    return { start: n, texture, mode, chords, slow, lead: r() < 0.5 ? 0 : 1, density: 0 };
  }

  /** Scale degree d (any integer) → MIDI, in the section's mode, from `root`. */
  #deg(d, root = this.home.root) {
    // flamenco: the major third belongs to the home chord alone (A major against Bb, C, D minor)
    const sc = this.home.flamenco && this.chordNow !== 0 ? LADDER[0][1] : this.section.mode.scale, k = ((d % 7) + 7) % 7;
    return root + sc[k] + 12 * Math.floor(d / 7);
  }
  /** Chord tones of degree `c` as degrees: root, third, fifth, seventh, ninth. */
  #chord(c) { return [c, c + 2, c + 4, c + 6, c + 8]; }

  /** A piano voicing: a low root, then colour tones near the last voicing (smooth voice leading). */
  #voicing(c) {
    const bass = this.#deg(c, this.home.root - 12);
    const tones = [2, 4, 6, 8].map((k) => this.#deg(c + k));
    const prev = this.prevVoicing;
    const up = tones.map((m, i) => {
      let best = m;
      for (const o of [-12, 0, 12]) { const v = m + o; if (v < 55 || v > 79) continue; if (!prev || Math.abs(v - prev[i]) < Math.abs(best - prev[i]) || best < 55 || best > 79) best = v; }
      return best;
    }).sort((a, b) => a - b);
    this.prevVoicing = up;
    return { bass: bass < 33 ? bass + 12 : bass, up };
  }

  /** A guitar voicing in one hand position: each string a chord tone (open strings welcome). */
  #guitarShape(c) {
    const pcs = new Set(this.#chord(c).slice(0, 4).map((d) => this.#deg(d) % 12));
    const rootPc = this.#deg(c) % 12;
    const shape = [];
    for (const pos of [0, 2, 3, 5, 7]) {
      const s = [];
      for (let k = 0; k < 6; k++) {
        let found = -1;
        for (let f = pos === 0 ? 0 : pos; f <= pos + 4; f++) if (pcs.has((OPEN[k] + f) % 12)) { found = f; break; }
        if (found < 0 && pcs.has(OPEN[k] % 12)) found = 0;
        s.push(found);
      }
      // the bass must be the root (or the fifth) on string 6, 5 or 4
      let bassK = -1;
      for (const k of [5, 4, 3]) if (s[k] >= 0 && (OPEN[k] + s[k]) % 12 === rootPc) { bassK = k; break; }
      if (bassK < 0) continue;
      for (let k = 5; k > bassK; k--) s[k] = -1;
      if (s.filter((f) => f >= 0).length >= 4) { shape.push(s); break; }
    }
    if (!shape.length) return null;
    return shape[0].map((f, k) => (f >= 0 ? { string: k + 1, midi: OPEN[k] + f } : null));
  }

  /**
   * The melody of one bar of a phrase: the motif, worked for the bar's place in the phrase. The
   * motif keeps its shape (passing tones and all); only where it starts and where it lands are
   * pulled onto the chord, it starts near where the last bar left off, and the whole line is
   * moved by octaves to sit in its register.
   */
  #melody(bar, chord, low, high) {
    const r = this.r, sec = this.section, phrase = Math.floor((bar - sec.start) / 4), inPhrase = (bar - sec.start) % 4;
    const answer = phrase % 2 === 1;
    let m = this.motifs[answer ? 1 : 0];
    if (answer && r() < 0.35) m = { cell: m.cell, steps: this.motifs[0].steps.map((x) => -x) };
    if (phrase >= 4 && this.sung.length && r() < 0.4) m = pick(r, this.sung);
    let cell = m.cell, steps = m.steps;
    if (inPhrase === 2) {                                          // the third bar develops
      const op = pick(r, ['sequence', 'fragment', 'augment', 'invert', 'retrograde']);
      if (op === 'sequence') steps = steps.map((x) => x + (answer ? -1 : 1));
      if (op === 'fragment') { const head = cell.slice(0, 2); cell = [...head, ...head, 12 - 2 * head.reduce((a, b) => a + b, 0)].filter((x) => x > 0); steps = [...steps.slice(0, 2), ...steps.slice(0, 2).map((x) => x + 1), steps[1] + 2]; }
      if (op === 'augment') { cell = [6, 6]; steps = [steps[0], steps[Math.min(2, steps.length - 1)]]; }
      if (op === 'invert') steps = steps.map((x) => -x);
      if (op === 'retrograde') steps = [...steps].reverse().map((x) => x - steps[steps.length - 1]);
    }
    if (inPhrase === 3) {                                          // the cadence: a turn, then a held note
      cell = answer ? [3, 9] : [2, 1, 9]; steps = answer ? [1, 0] : [-1, 1, 0];
    }
    // where the line starts: the chord tone (as a degree) nearest the last note sung
    const tones = this.#chord(chord).slice(0, 3);
    const prev = this.lastMel ?? (low + high) / 2;
    let start = null, bestD = Infinity;
    for (const t of tones) for (let o = -21; o <= 21; o += 7) {
      const midi = this.#deg(t + o);
      if (midi < low - 2 || midi > high + 2) continue;
      if (Math.abs(midi - prev) < bestD) { bestD = Math.abs(midi - prev); start = t + o; }
    }
    if (start === null) start = tones[0] + 7;
    // the cadence lands on the chord: the last step chosen so the line ends on a chord tone
    let degs = steps.map((x) => start + x);
    if (inPhrase === 3 || r() < 0.5) {
      const end = degs[degs.length - 1];
      let land = end, bd = Infinity;
      for (const t of tones) for (let o = -14; o <= 14; o += 7) if (Math.abs(t + o - end) < bd) { bd = Math.abs(t + o - end); land = t + o; }
      degs[degs.length - 1] = land;
    }
    // the whole line into its register, by octaves
    let midis = degs.map((d) => this.#deg(d));
    const lo = Math.min(...midis), hi = Math.max(...midis);
    if (hi > high) midis = midis.map((x) => x - 12 * Math.ceil((hi - high) / 12));
    else if (lo < low) midis = midis.map((x) => x + 12 * Math.ceil((low - lo) / 12));
    const notes = [];
    let t = 0;
    cell.forEach((len, i) => {
      if (i >= midis.length) return;
      const last = i === cell.length - 1 || i === midis.length - 1;
      if (!(last && answer && inPhrase === 3 && r() < 0.3)) notes.push({ tick: t, len: last && inPhrase === 3 ? len + 6 : len, midi: midis[i] });
      t += len;
    });
    if (notes.length) this.lastMel = notes[notes.length - 1].midi;
    if (inPhrase === 0) this.sung = [...this.sung.slice(-5), { cell, steps }];
    return notes;
  }

  /** A melody note onto the treble strings: the string where it sits lowest in reach (frets 0–14
   * first, then to 19), moved by an octave only if no string can play it. → { string, midi } */
  #onString(midi, strings = [1, 2, 3]) {
    for (const reach of [14, 19]) for (const oct of [0, -12, 12]) {
      let best = null;
      for (const s of strings) { const f = midi + oct - OPEN[s - 1]; if (f >= 0 && f <= reach && (!best || f < best.f)) best = { s, f }; }
      if (best) return { string: best.s, midi: midi + oct };
    }
    return { string: 1, midi: OPEN[0] };
  }

  /** The notes of bar `n` given the moment. */
  bar(n, cond) {
    if (!this.section || n - this.section.start >= 32) this.section = this.#plan(n, cond);
    const sec = this.section, r = this.r, out = [];
    const i = n - sec.start, phrase = Math.floor(i / 4), inPhrase = i % 4;
    const c = sec.chords[i];
    this.chordNow = c;
    const v = this.#voicing(c), shape = this.#guitarShape(c);
    const t0 = n * this.barSec, T = this.tick, dens = clamp(cond.density ?? 1, 0.25, 1);
    const soft = 1 - 0.3 * cond.cover - 0.25 * cond.night;
    // a phrase's dynamic arc, and the section's: up to the middle, down at the end
    const arc = (0.75 + 0.25 * Math.sin(Math.PI * (inPhrase + 0.5) / 4)) * (0.8 + 0.2 * Math.sin(Math.PI * i / 32));
    const last = i === 31;                                          // the seam: thin out
    const hum = () => (r() - 0.5) * 0.016;
    const P = (tick, len, midi, vel) => out.push({ at: t0 + tick * T + hum(), dur: len * T, midi, vel: clamp(vel * soft * arc * (0.92 + 0.16 * r()), 0.05, 1), inst: 0 });
    const G = (tick, len, s, midi, vel, art = 0, ap = 0) => out.push({ at: t0 + tick * T + hum(), dur: len * T, midi, vel: clamp(vel * soft * arc * (0.9 + 0.2 * r()), 20, 220), inst: 1, string: s, art, ap });
    const chordLen = sec.slow && inPhrase % 2 === 0 ? 24 : 12;      // a chord rings to the next change
    const leadIs = (phrase + sec.lead) % 2;                         // who sings this phrase: 0 piano, 1 guitar
    const harmonics = (k) => {                                       // natural harmonics among the chord tones
      const pcs = new Set(this.#chord(c).slice(0, 4).map((d) => this.#deg(d) % 12)), hs = [];
      for (let s = 1; s <= 6; s++) for (const [fret, up] of [[12, 12], [7, 19], [5, 24]]) if (pcs.has((OPEN[s - 1] + up) % 12)) hs.push({ s, midi: OPEN[s - 1] + up, fret });
      return hs.slice(0, k);
    };

    switch (sec.texture) {
      case 'lake': {
        // the piano: a pedalled arpeggio in a wave over two octaves; the bass held to the change
        if (!(sec.slow && inPhrase % 2 === 1)) P(0, chordLen + 3, v.bass, 0.42);
        const wave = [...v.up, ...v.up.map((m) => m + 12)].filter((m) => m < 90);
        const seq = [...wave, ...wave.slice(1, -1).reverse()];
        const step = dens > 0.6 ? 1 : 2;
        for (let k = step === 1 ? 1 : 0; k < 12; k += step) P(k, 9, seq[(k + i * 3) % seq.length], 0.26 + 0.08 * (k % 3 === 0));
        // the guitar: harmonics, answering at the phrase's ends
        if (inPhrase >= 2 && !last) harmonics(3).forEach((h, j) => G(6 + j * 2, 18, h.s, h.midi, 120, 4, h.fret));
        if (leadIs === 1 && inPhrase < 2 && shape) this.#melody(n, c, 64, 79).forEach((m) => { const p = this.#onString(m.midi); G(m.tick, m.len + 2, p.string, p.midi, 135); });
        break;
      }
      case 'falls': {
        // the guitar's tremolo: bass on the beat, the melody note picked three times after it (4 against 3)
        const mel = this.#melody(n, c, 64, 76);
        if (shape) {
          const bassS = shape.find((x) => x)?.string ? [...shape].reverse().find((x) => x) : null;
          for (let b = 0; b < 4; b++) {
            const m = mel.filter((x) => x.tick <= b * 3).pop() || mel[0];
            if (bassS) G(b * 3, 3, bassS.string, bassS.midi, 110);
            if (m && !(last && b > 1)) { const p = this.#onString(m.midi, [1, 2]); for (let q = 1; q <= 3; q++) G(b * 3 + q * 0.75, 0.75, p.string, p.midi, 92 + (q === 1 ? 10 : 0)); }
          }
        }
        // the piano: held chords, and a low octave on the change
        if (!(sec.slow && inPhrase % 2 === 1)) { P(0, chordLen, v.bass, 0.38); v.up.forEach((m, j) => P(0.15 * j, chordLen, m, 0.24)); }
        if (leadIs === 0 && inPhrase === 3) mel.forEach((m) => P(m.tick, m.len, m.midi + 12, 0.3));
        break;
      }
      case 'river': {
        // the guitar's ostinato: p-i-m-a over the shape, the open strings ringing
        if (shape) {
          const ss = shape.filter(Boolean), bass = ss[ss.length - 1], top = ss.slice(0, Math.min(4, ss.length - 1));
          const pat = [bass, top[2], top[1], top[0], top[1], top[2], bass, top[2], top[1], top[0], top[1], top[3] || top[2]];
          pat.forEach((x, k) => { if (x && !(last && k > 6) && (dens > 0.5 || k % 2 === 0)) G(k, k === 0 || k === 6 ? 12 : 6, x.string, x.midi, k % 6 === 0 ? 118 : 86); });
        }
        // the piano sings (or answers in the left hand while the guitar sings its own line)
        const mel = this.#melody(n, c, 67, 86);
        if (leadIs === 0) mel.forEach((m) => P(m.tick, m.len + 1, m.midi, 0.52));
        else { mel.forEach((m) => { const p = this.#onString(m.midi); G(m.tick + 0.05, m.len + 2, p.string, p.midi, 140); }); if (!(sec.slow && inPhrase % 2 === 1)) v.up.slice(0, 3).forEach((m, j) => P(3 + j * 0.1, 8, m, 0.2)); }
        if (inPhrase === 0) P(0, 24, v.bass, 0.34);
        break;
      }
      case 'mountains': {
        // rolled chords on the accents (3+3+2+2+2, the bulería's grouping, Duende's), guitar strums between
        const acc = this.home.flamenco ? [0, 3, 6, 8, 10] : [0, 6];
        acc.forEach((k, j) => {
          if (last && j > 1) return;
          P(k, j === 0 ? 12 : 4, v.bass, 0.5);
          v.up.forEach((m, q) => P(k + 0.12 * q, j === 0 ? 10 : 3, m + (j === 0 ? 0 : 12), 0.42 + (j === 0 ? 0.1 : 0)));
        });
        if (shape) for (const k of [3, 9]) {
          const ss = shape.filter(Boolean).reverse();
          ss.forEach((x, q) => G(k + q * 0.04, 3, x.string, x.midi, 120 - q * 4));
        }
        if (inPhrase % 2 === 1) this.#melody(n, c, 72, 88).forEach((m) => P(m.tick, m.len, m.midi, 0.55));
        break;
      }
      default: {                                                    // stars
        if (inPhrase === 0) P(0, 30, v.bass, 0.3);
        const mel = this.#melody(n, c, 74, 93);
        mel.forEach((m, k) => { if (k % 2 === 0 || dens > 0.7) P(m.tick, m.len + 6, m.midi, 0.3 + (cond.moon || 0) * 0.12); });
        if (inPhrase % 2 === 1) harmonics(2 + Math.round((cond.moon || 0) * 2)).forEach((h, j) => G(2 + j * 3, 24, h.s, h.midi, 125, 4, h.fret));
        break;
      }
    }
    // thunder: the roll arrives as a low cluster (root, minor second, fifth, two octaves down),
    // louder the nearer the strike
    for (const th of cond.thunder || []) {
      const root = this.home.root - 24, v0 = 0.3 + 0.45 * (1 - th.dist);
      for (const [d, k] of [[0, 1], [1, 0.8], [7, 0.7]]) out.push({ at: th.t + d * 0.012, dur: 30 * T, midi: root + d, vel: clamp(v0 * k, 0.05, 1), inst: 0 });
    }
    return out.sort((a, b) => a.at - b.at);
  }

  /** What is playing, for the page. */
  describe() {
    const s = this.section;
    return s ? `${s.texture} · ${s.mode.name}` : '';
  }
}
