// score-kit.js — the arithmetic a studio score needs: note names, a tempo map,
// the sustain pedal, and a seeded human touch. Pure; node and browser alike.
//
// (Anthesis predates this and carries its own copy inline; leave it be.)

const STEPS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'D5' -> 74. Sharps '#', flats 'b'. */
export function m(name) {
  const r = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!r) throw new Error(`bad note ${name}`);
  return 12 * (Number(r[3]) + 1) + STEPS[r[1]] + (r[2] === '#' ? 1 : r[2] === 'b' ? -1 : 0);
}

/** Bar (1-based) and beat (0-based) in 4/4 to an absolute beat. */
export const B = (bar, beat = 0) => (bar - 1) * 4 + beat;

/**
 * Beat -> seconds, from [beat, bpm] keyframes (bpm linear between keys),
 * integrated once into a table.
 */
export function tempoMap(keys, maxBeat = 240) {
  const bpmAt = (b) => {
    if (b <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [b1, v1] = keys[i];
      const [b0, v0] = keys[i - 1];
      if (b <= b1) return v0 + (v1 - v0) * ((b - b0) / (b1 - b0));
    }
    return keys[keys.length - 1][1];
  };
  const STEP = 1 / 64;
  const n = Math.ceil(maxBeat / STEP) + 1;
  const T = new Float64Array(n);
  for (let i = 1; i < n; i++) T[i] = T[i - 1] + (60 / bpmAt((i - 0.5) * STEP)) * STEP;
  return (beat) => {
    const x = Math.max(0, beat) / STEP;
    const i = Math.min(n - 2, Math.floor(x));
    return T[i] + (T[i + 1] - T[i]) * (x - i);
  };
}

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Turn written notes into a performance.
 *
 * raw:   [{ beat, dur, midi, vel, tag?, i? }]
 * pedal: [[downBeat, upBeat), ...] — a note struck inside a region rings until
 *        the pedal lifts. It changes a hair after the beat, so a note on the
 *        downbeat is caught by the new pedal, not cut off by the old one.
 */
export function perform(raw, sec, pedal, seed = 1, { jitter = 0.018, spread = 0.08 } = {}) {
  const up = (beat) => {
    for (const [d, u] of pedal) if (beat >= d - 0.05 && beat < u - 0.05) return u;
    return null;
  };
  const rnd = mulberry32(seed);
  return raw
    .map((e) => {
      const endBeat = Math.max(e.beat + e.dur, up(e.beat) ?? 0);
      const at = Math.max(0, sec(e.beat) + (rnd() - 0.5) * jitter);
      const end = sec(endBeat) - 0.01;
      return {
        at,
        dur: Math.max(0.05, end - at),
        midi: e.midi,
        velocity: Math.min(0.95, Math.max(0.05, e.vel * (1 + (rnd() - 0.5) * spread))),
        tag: e.tag,
        i: e.i,
        beat: e.beat,
      };
    })
    .sort((a, b) => a.at - b.at);
}
