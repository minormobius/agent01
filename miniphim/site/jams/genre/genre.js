// Modulo, 2026-10-13. Same tune, other genres. The melody is /score/'s tune for the seed (the same
// wasm bytes); the instruments are the rack's six (the same wasm bytes, unchanged). What changes
// here is only what a genre is made of besides timbre: rhythm, harmony and which part does what.
// Pure functions; the page and shelf/genre/selftest.mjs both import this file.
// An event is { t: start in beats, d: length in beats, part, m: midi (may be fractional), g: gain }.

const SCALE = [0, 2, 4, 5, 7, 9, 11];
export const midiOf = d => 60 + 12 * Math.floor(d / 7) + SCALE[((d % 7) + 7) % 7];

export function tuneFrom(score, seed) {
  const n = score.generate(seed >>> 0), m = new Uint8Array(score.memory.buffer, score.buf(), 2 * n);
  const T = []; let t = 0;
  for (let i = 0; i < n; i++) { T.push({ m: midiOf(m[2 * i] - 2), at: t, len: m[2 * i + 1] }); t += m[2 * i + 1]; }
  return T; // at and len in eighths, 64 eighths = 8 bars of 4/4
}

function rng(seed) { let a = (seed ^ 0x9e3779b9) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Chords: root pitch class and intervals above it.
const Q = { maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], maj: [0, 4, 7], min: [0, 3, 7] };
const C = (name, root, q) => ({ name, root, q, tones: Q[q] });
// Each bar is a list of [beat it starts on, chord].
export const CHARTS = {
  // I vi ii V iii VI ii-V I: the melody's bar-4 G sits on G7 and its last C on Cmaj7.
  jazz: [[[0, C('Cmaj7', 0, 'maj7')]], [[0, C('Am7', 9, 'm7')]], [[0, C('Dm7', 2, 'm7')]], [[0, C('G7', 7, 'dom7')]],
         [[0, C('Em7', 4, 'm7')]], [[0, C('A7', 9, 'dom7')]], [[0, C('Dm7', 2, 'm7')], [2, C('G7', 7, 'dom7')]], [[0, C('Cmaj7', 0, 'maj7')]]],
  // vi IV I V, twice, with the second turn ending home.
  electronica: [[[0, C('Am', 9, 'min')]], [[0, C('F', 5, 'maj')]], [[0, C('C', 0, 'maj')]], [[0, C('G', 7, 'maj')]],
                [[0, C('Am', 9, 'min')]], [[0, C('F', 5, 'maj')]], [[0, C('G', 7, 'maj')]], [[0, C('C', 0, 'maj')]]],
};
export const chordAt = (style, beat) => { const bar = CHARTS[style][Math.floor(beat / 4)]; let c = bar[0][1]; for (const [b, ch] of bar) if (beat % 4 >= b) c = ch; return c; };
const near = (pc, target) => { let m = target - ((target - pc) % 12 + 12) % 12; return target - m > 6 ? m + 12 : m; }; // pitch of class pc nearest target

// Swing: the first eighth of each beat gets r/(1+r) of the beat. r = 1 is straight, r = 2 is triplet feel.
export const swingAt = (i, r) => Math.floor(i / 2) + (i % 2 ? r / (1 + r) : 0); // eighth index -> beats

export const PARTS = {
  jazz: { melody: { kind: 3, gain: 0.26 }, comp: { kind: 0, gain: 0.07 }, bass: { kind: 0, gain: 0.30 }, ride: { kind: 2, gain: 0.035 }, kick: { kind: 4, gain: 0.16 } },
  electronica: { melody: { kind: 3, gain: 0.20 }, bass: { kind: 3, gain: 0.26 }, pad: { kind: 5, gain: 0.06 }, arp: { kind: 2, gain: 0.05 }, kick: { kind: 4, gain: 0.55 } },
};
export const DEFAULT_BPM = { jazz: 140, electronica: 124 };

// opts: { ride: drummer's swing ratio, lag: soloist's delay on downbeats in beats }
export function arrange(style, T, seed, opts = {}) {
  const R = rng(seed), ev = [], E = (part, t, d, m, gs = 1) => ev.push({ part, t, d, m, g: gs });
  if (style === 'jazz') {
    const ride = opts.ride ?? 2.5, solo = 1 + 0.5 * (ride - 1), lag = opts.lag ?? 0.05;
    // melody: swung lighter than the drummer, and late on the downbeats only
    for (const n of T) { const s = swingAt(n.at, solo) + (n.at % 2 ? 0 : lag), e = swingAt(n.at + n.len, solo); E('melody', s, Math.max(0.1, (e - s) * 0.9), n.m); }
    // ride: ding, ding-a ding, ding-a, with the "a" swung at the drummer's ratio; kick feathered on all four
    for (let b = 0; b < 32; b++) { E('ride', b, 0.3, 93 + 0.3 * (b % 2), b % 2 ? 1 : 0.8); if (b % 2) E('ride', b + ride / (1 + ride), 0.2, 93, 0.6); E('kick', b, 0.2, 31, b % 4 === 0 ? 1 : 0.6); }
    // comping: rootless voicings (3, 5, 7, 9; on a dominant 3, 13, 7, 9), root placed nearest D3
    const voicing = ch => { const iv = ch.q === 'maj7' ? [4, 7, 11, 14] : ch.q === 'm7' ? [3, 7, 10, 14] : [4, 9, 10, 14]; // dom7: 3, 13, 7, 9
      const low = near(ch.root, 50); return iv.map(x => low + x); };
    const PAT = [[[0, 0.6], [1.5, 1.4]], [[0.5, 0.8], [2.5, 1.0]], [[0, 1.6], [3.5, 0.4]], [[1.5, 0.5], [2, 1.5]]]; // beat offsets ("x.5" is swung), lengths
    for (let bar = 0; bar < 8; bar++) for (const [o, d] of PAT[Math.floor(R() * 4)]) {
      const b = bar * 4 + o, t = Math.floor(b) + (b % 1 ? ride / (1 + ride) : 0); for (const m of voicing(chordAt('jazz', b))) E('comp', t, d, m); }
    // walking bass: quarter notes. Beat 1 of each chord is its root; the beat before a new chord
    // is a half step from that chord's root; the beats between walk through chord tones.
    let prev = 36; const beats = [];
    for (let b = 0; b < 32; b++) beats.push(chordAt('jazz', b));
    for (let b = 0; b < 32; b++) {
      const ch = beats[b], first = b === 0 || beats[b - 1] !== ch, nxt = b < 31 ? beats[b + 1] : null, last = nxt && nxt !== ch;
      let m;
      if (first) m = clampBass(near(ch.root, prev));
      else if (last) { const tgt = clampBass(near(nxt.root, prev)); m = tgt + (prev > tgt ? 1 : prev < tgt ? -1 : (R() < 0.5 ? 1 : -1)); }
      else { const opts2 = []; for (const iv of ch.tones) for (let o = 24; o <= 52; o += 12) { const p = o + ((ch.root + iv) % 12); if (p >= 28 && p <= 50 && p !== prev && Math.abs(p - prev) <= 7) opts2.push(p); }
        m = opts2.length ? opts2[Math.floor(R() * opts2.length)] : prev + 2; }
      E('bass', b, 0.85, m); prev = m;
    }
  } else if (style === 'electronica') {
    for (const n of T) E('melody', n.at / 2, Math.max(0.1, n.len / 2 * 0.8), n.m + 12);
    for (let b = 0; b < 32; b++) {
      const ch = chordAt('electronica', b);
      E('kick', b, 0.25, 33);
      E('bass', b + 0.5, 0.4, 36 + ch.root % 12 - (ch.root % 12 > 7 ? 12 : 0) + (b % 4 === 3 ? 12 : 0));
      // the pad restarts just after each kick and swells back: a sidechain pump made of note lengths
      for (const iv of ch.tones) E('pad', b + 0.06, 0.82, near((ch.root + iv) % 12, 64));
      // arpeggio: sixteenths, up through the chord and its octave
      const up = [...ch.tones.slice(0, 3).map(iv => 72 + (ch.root + iv) % 12).sort((a, c) => a - c)]; up.push(up[0] + 12);
      for (let s = 0; s < 4; s++) E('arp', b + s / 4, 0.2, up[(b * 4 + s) % 4], s ? 0.7 : 1);
    }
  }
  return ev.sort((a, b) => a.t - b.t);
}
const clampBass = m => { while (m > 50) m -= 12; while (m < 28) m += 12; return m; };
