// script.js — The Bommie: the show bible and episode 1, as data. The only clock in the piece.
//
// A bommie is a coral head standing alone on the sand: here, an apartment block. The cast
// lives in and around it. Nobody in it is human, so nobody can be judged against a person:
// they are toys under water, lit like a tank on a shelf.
//
// Everything that happens is here, in seconds: where each resident goes, what it says, what
// the camera looks at, what the light does. world.js turns it into poses at any t; sound.js
// into the soundtrack; render.js into pictures. Change a line here and all three follow.
//
// Units: 1 = 10 cm, toy scale. y is up; the sand is y = 0; the camera looks down −z.

// ---- the cast -------------------------------------------------------------------------
// voice: the creature's gibberish. pitch in Hz, rate in syllables a second, and a timbre
// (sound.js): 'gravel' (a clicky rasp), 'chirp', 'bubble', 'breath', 'mumble'.
export const CAST = {
  gus: { name: 'Gus', what: 'a hermit crab, the super. His whelk shell is too small; he is shopping', voice: { pitch: 92, rate: 5.2, timbre: 'gravel', spread: 0.25 }, color: '#e0663a' },
  nell: { name: 'Nell', what: 'a cleaner wrasse. Runs the cleaning station on the left shoulder; hears everything', voice: { pitch: 330, rate: 8.5, timbre: 'chirp', spread: 0.45 }, color: '#5aa8ff' },
  dot: { name: 'Dot', what: 'a clownfish, the sensible half of the couple in the anemone', voice: { pitch: 230, rate: 6.8, timbre: 'bubble', spread: 0.3 }, color: '#ff8a2a' },
  dash: { name: 'Dash', what: 'a clownfish, the other half: all enthusiasm', voice: { pitch: 280, rate: 8.0, timbre: 'bubble', spread: 0.6 }, color: '#ff9d3d' },
  pip: { name: 'Pip', what: 'an anemone. Cannot leave, so everyone comes to her; speaks rarely, slowly', voice: { pitch: 150, rate: 3.2, timbre: 'breath', spread: 0.2 }, color: '#c77dff' },
  barry: { name: 'Barry', what: 'a parrotfish. Eats the building; what he eats comes out as sand', voice: { pitch: 110, rate: 4.0, timbre: 'mumble', spread: 0.15 }, color: '#3fc9a4' },
};
// the studio audience are the reef's snapping shrimp: a reef's real background is their
// crackle, and when something is funny it swells (sound.js `laughs`)

// ---- the set --------------------------------------------------------------------------
export const SET = {
  bommie: { c: [0.3, 0, -1.3], r: [1.9, 2.5, 1.5] },     // the coral head: a lumpy mound
  station: [-1.15, 1.62, 0.28],                         // Nell's cleaning station, a ledge on the left shoulder
  pip: [-2.25, 0.32, 0.35],                              // the anemone, on its rock
  props: {
    whelk: { at: [1.42, 0, 1.08], yaw: -0.4 },          // Gus's shell, where he leaves it to try the can
    can: { at: [2.15, 0, 1.25], yaw: Math.PI, r: 0.3, len: 0.72 },   // a tin can on its side, open end to Gus: litter, and a bad idea
    conch: { at: [-0.95, 0, 1.55], yaw: 0.7 },          // a conch: a palace, and far too heavy
  },
};

// ---- the episode ----------------------------------------------------------------------
export const TITLE = { show: 'The Bommie', episode: 'Episode 1 · The Shell Game' };
export const DURATION = 104;

// the light through the day: [t, phase] with phase 0 night, 1 dawn, 2 day, 3 dusk (world.js blends)
export const LIGHT = [[0, 1], [7, 2], [84, 2], [92, 3], [98, 0]];

// what everyone says. at: seconds; the syllables and their timing come from sayings() below,
// so the mouths and the voices are timed from the same numbers
export const LINES = [
  { at: 15.0, who: 'gus', text: 'Too small. Everything on this reef is too small.' },
  { at: 21.4, who: 'nell', text: 'He is house hunting again.' },
  { at: 23.6, who: 'dot', text: 'Again? He has had that whelk since spring.' },
  { at: 26.4, who: 'dash', text: 'Tell him about the can!' },
  { at: 28.2, who: 'nell', text: 'Oh, he knows about the can.' },
  { at: 34.2, who: 'gus', text: 'Roomy.' },
  { at: 45.4, who: 'gus', text: 'Nope.' },
  { at: 50.4, who: 'gus', text: 'Now this. This is a home.' },
  { at: 58.6, who: 'gus', text: 'It has... a lot of home.' },
  { at: 62.6, who: 'barry', text: 'Mmf. Morning.' },
  { at: 70.8, who: 'gus', text: 'Barry!' },
  { at: 74.2, who: 'pip', text: 'A shell is a shell, Gus.' },
  { at: 79.0, who: 'gus', text: 'It is a good shell.' },
  { at: 81.4, who: 'nell', text: 'I am telling everyone.' },
];

// the laughs: [t, strength 0..1, seconds]. The shrimp swell a beat after the gag lands
export const LAUGHS = [[30.2, 0.35, 2.2], [41.8, 0.8, 3.4], [46.0, 0.5, 2.4], [59.8, 0.7, 3.0], [67.4, 1.0, 4.2], [82.8, 0.9, 3.8]];

// sound effects on the script's clock (sound.js draws each; world.js animates the same moments)
export const FOLEY = [
  ...[7.4, 8.3, 9.1, 10.2, 11.0].map((at) => ({ at, fx: 'crunch' })),          // Barry breakfasts on the roof
  ...[63.4, 64.2, 65.0].map((at) => ({ at, fx: 'crunch' })),
  { at: 12.6, fx: 'pop' },                                                       // Gus out of his shell's door
  { at: 38.4, fx: 'clonk' }, { at: 40.2, fx: 'roll', dur: 3.6 }, { at: 43.8, fx: 'clonk' },
  { at: 55.2, fx: 'scrape', dur: 4.2 }, { at: 56.4, fx: 'thud' }, { at: 57.6, fx: 'thud' }, { at: 58.2, fx: 'thud' },
  { at: 66.0, fx: 'poof' },                                                      // what Barry's breakfast becomes
  { at: 69.4, fx: 'shake' },
  { at: 77.2, fx: 'pop' },                                                       // home again
  { at: 3.0, fx: 'bubbles' }, { at: 25.0, fx: 'bubbles' }, { at: 52.0, fx: 'bubbles' }, { at: 88.0, fx: 'bubbles' },
];

// where each resident is, as keyframes: [t, [x, y, z], ease?]. Holds are implicit between keys.
// Fish positions are their centres; Gus's are on the sand (y ignored).
export const PATHS = {
  gus: [[0, [0.9, 0, 0.7]], [29.0, [0.9, 0, 0.7]], [33.6, [1.65, 0, 1.2]], [35.4, [1.72, 0, 1.24]],
    // into the can (36–38), the roll (40.2–43.8) carries him; out at its end (44.2)
    [44.2, [3.1, 0, 1.25]], [46.8, [3.0, 0, 1.25]], [53.6, [-0.35, 0, 1.45]], [55.0, [-0.62, 0, 1.5]],
    [60.4, [-0.62, 0, 1.5]], [72.6, [-0.62, 0, 1.5]], [76.6, [1.3, 0, 1.02]]],
  nell: [[0, SET.station], [60, SET.station], [61.5, [-0.8, 1.6, 0.2]], [67.8, [-0.8, 1.6, 0.2]], [69.5, SET.station]],
  dot: [[0, [-2.05, 0.78, 0.45]], [22.8, [-2.0, 0.82, 0.5]], [23.4, [-1.75, 0.9, 0.55]], [30, [-1.8, 0.88, 0.55]], [31.5, [-2.05, 0.78, 0.45]]],
  dash: [[0, [-2.4, 0.72, 0.3]], [25.8, [-2.4, 0.72, 0.3]], [26.3, [-1.9, 1.05, 0.65]], [28.0, [-1.95, 1.0, 0.62]], [29.5, [-2.4, 0.72, 0.3]],
    [41.8, [-2.4, 0.72, 0.3]], [42.3, [-2.2, 1.1, 0.5]], [45.0, [-2.4, 0.72, 0.3]]],
  barry: [[0, [9, 2.6, -1.0]], [6.2, [9, 2.6, -1.0]], [7.2, [0.6, 3.12, -0.9]], [11.6, [0.4, 3.12, -1.0]], [15.5, [-9, 2.4, -0.5]],
    [59.5, [-9, 1.8, 0.4]], [61.8, [-0.2, 2.3, -0.1]], [65.4, [0.1, 2.25, 0.0]], [66.0, [-0.55, 0.95, 1.4]], [67.2, [-0.2, 1.0, 1.4]], [72.0, [9, 1.6, 1.0]]],
};
// who each fish faces while hovering (a name or a point); moving, a fish faces where it goes
export const LOOKS = {
  nell: [[0, 'camera'], [20.8, 'dot'], [27.6, 'camera'], [33, 'gus'], [72, 'pip'], [80.6, 'camera']],
  dot: [[0, 'nell'], [30, 'gus'], [72, 'pip'], [84, 'camera']],
  dash: [[0, 'nell'], [30, 'gus'], [84, 'camera']],
  gus: [[0, 'camera'], [16.5, 'can'], [44.4, 'camera'], [47.2, 'conch'], [58, 'camera'], [70.4, 'barry'], [72.8, 'pip'], [78.2, 'camera']],
};
// Gus's shell through the episode: whelk on his back, then in the can, out, the conch attempt, home
export const SHELL = [[0, 'whelk'], [36.4, 'can'], [44.2, 'none'], [55.0, 'conch'], [60.4, 'none'], [77.2, 'whelk']];

// the cameras: a multi-camera sitcom. [t, shot]; a shot names a target, a distance, a yaw and
// a lens (vertical field in degrees). Cuts are hard, as on a sitcom floor; each shot drifts a little.
export const SHOTS = [
  [0, { name: 'master', target: [0, 1.25, 0], dist: 9.2, yaw: 0, pitch: 0.06, fov: 34 }],
  [12.2, { name: 'gus', follow: 'gus', off: [0, 0.35, 0], dist: 3.2, yaw: 0.25, pitch: 0.12, fov: 30 }],
  [20.4, { name: 'station', target: [-1.55, 1.05, 0.2], dist: 3.6, yaw: -0.18, pitch: 0.05, fov: 32 }],
  [30.4, { name: 'master', target: [0.8, 0.9, 0.4], dist: 7.2, yaw: 0.1, pitch: 0.08, fov: 34 }],
  [36.2, { name: 'can', target: [2.3, 0.35, 1.25], dist: 3.0, yaw: -0.1, pitch: 0.1, fov: 32 }],
  [44.6, { name: 'nell', follow: 'nell', off: [0.1, 0, 0], dist: 1.9, yaw: -0.3, pitch: 0.02, fov: 30 }],
  [46.6, { name: 'master', target: [0.6, 0.9, 0.6], dist: 8.2, yaw: 0, pitch: 0.07, fov: 34 }],
  [54.6, { name: 'conch', target: [-0.8, 0.35, 1.5], dist: 2.9, yaw: 0.2, pitch: 0.12, fov: 32 }],
  [61.0, { name: 'barry', target: [-0.3, 1.3, 0.4], dist: 6.0, yaw: -0.05, pitch: 0.06, fov: 34 }],
  [66.2, { name: 'dust', target: [-0.62, 0.35, 1.5], dist: 2.6, yaw: 0.1, pitch: 0.1, fov: 32 }],
  [72.4, { name: 'pip', target: [-2.1, 0.75, 0.4], dist: 2.4, yaw: -0.35, pitch: 0.06, fov: 32 }],
  [76.0, { name: 'gus', follow: 'gus', off: [0, 0.35, 0], dist: 2.8, yaw: 0.3, pitch: 0.12, fov: 30 }],
  [80.8, { name: 'nell', follow: 'nell', off: [0.1, 0, 0], dist: 1.9, yaw: -0.25, pitch: 0.02, fov: 30 }],
  [83.4, { name: 'master', target: [0, 1.25, 0], dist: 9.2, yaw: 0, pitch: 0.06, fov: 34, pullBack: 2.4 }],
];

export const CREDITS = { at: 90, lines: [TITLE.show, ...Object.values(CAST).map((c) => `${c.name} · ${c.what.split('.')[0]}`), 'the snapping shrimp · the audience'] };

// ---- speech: syllables, shared by the voices and the mouths --------------------------------
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/**
 * Every line's syllables: { at, dur, pitch (a multiple of the voice's), open (0..1) }. The
 * number of syllables comes from the text's vowel groups; timing from the voice's rate, with
 * a pause at each comma or full stop; pitch falls through a statement and rises at a question.
 */
export function sayings() {
  return LINES.map((L, li) => {
    const v = CAST[L.who].voice;
    const words = L.text.split(/\s+/);
    const syl = [];
    let t = L.at;
    words.forEach((w, wi) => {
      const n = Math.max(1, (w.toLowerCase().match(/[aeiouy]+/g) || []).length);
      for (let k = 0; k < n; k++) {
        const h = hash(li * 97 + syl.length * 13);
        const dur = (1 / v.rate) * (0.75 + 0.5 * h);
        syl.push({ at: t, dur: dur * 0.82, pitch: 1 + v.spread * (h - 0.5), open: 0.55 + 0.45 * hash(li * 31 + syl.length) });
        t += dur;
      }
      if (/[.,!?…]$/.test(w)) t += /\.\.\.|…/.test(w) ? 0.55 : /[,]$/.test(w) ? 0.16 : 0.26;
      else t += 0.03;
    });
    // intonation: a statement falls to its end; a question rises on its last two syllables
    const q = /\?\s*$/.test(L.text), ex = /!\s*$/.test(L.text);
    syl.forEach((s, i) => {
      const f = i / Math.max(1, syl.length - 1);
      s.pitch *= (1.08 - 0.16 * f) * (q && i >= syl.length - 2 ? 1.3 : 1) * (ex ? 1.12 : 1);
    });
    return { ...L, syl, end: t };
  });
}
