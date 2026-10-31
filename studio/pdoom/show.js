// show.js — the music video as DATA: the song's map, the cast, the dance, the shots.
// Pure data, no imports: the page plays it, and studio/tools/build-pdoom.mjs compiles the
// dance for each dancer's body (dance.json) and checks it frame by frame (report.json).
//
// The song is "I'm Upping My P(Doom)" by Claude-Pop (deckard, @slimer48484), played from
// YouTube (never rehosted here). Its map was measured from deckard's original upload:
// 132.00 BPM, the first downbeat at 0.171 s, 86 bars of 4. The lyric cues are the
// sections' moments, in bars, not the lyrics.

export const SONG = {
  title: "I'm Upping My P(Doom)",
  artist: 'Claude-Pop',
  by: 'deckard',
  credit: 'https://x.com/slimer48484/status/2097752569212756134',
  youtube: 'XkhdyhQzYN4',                // a re-upload by Drought Bee, credited to deckard
  duration: 156.65,                      // deckard's original, in seconds
  bpm: 132,
  t0: 0.171,                             // the first downbeat
  bars: 86,
};

// sections: [first bar, name, palette, P(doom) on the wall at its start]
export const SECTIONS = [
  [0, 'intro', 'night', 3],
  [1, 'verse 1', 'night', 8],
  [12, 'chorus 1', 'hot', 22],
  [20, 'break', 'night', 30],
  [21, 'verse 2', 'dusk', 33],
  [33, 'chorus 2', 'hot', 51],
  [43, 'verse 3', 'dusk', 62],
  [53, 'half-time', 'deep', 70],
  [60, 'final chorus', 'fever', 81],
  [76, 'the stop', 'blackout', 97],
  [77, 'outro', 'fever', 98],
  [84, 'bow', 'night', 99.9],
];

// ---- the cast -----------------------------------------------------------------------
// Mino, the idol, and her crew. Specs are packages/figure's (heads, build, face, hair, outfit).
const CREW = { top: 'jacket', bottom: 'pants', shoes: 'sneakers', colors: { top: 'white', bottom: 'navy', shoes: 'white' } };
export const CAST = [
  {
    name: 'Mino', lead: true, home: [0, 1.2],
    spec: {
      heads: 6.6, femme: 1, build: 0.3, cup: 0.45, lift: 0.65, set: 0.45, waist: 0.5, hips: 0.45, mass: 0.4, legs: 0.8, headWidth: 0.82, neck: 0.6,
      face: { eyes: 'round', brows: 'arched', lashes: 'heavy', irisColor: 'violet', extras: ['blush'] },
      hair: { length: 'long', bangs: 'blunt', tails: 'twintails', color: 'silver' },
      outfit: { top: 'crop', bottom: 'pleated', legwear: 'thigh-highs', shoes: 'sneakers', accent: 'ribbon', colors: { top: 'pink', bottom: 'black', legwear: 'black', shoes: 'pink', accent: 'pink' } },
    },
  },
  { name: 'Aya', home: [-3.4, -0.8], spec: { heads: 7.3, femme: 0.8, build: 0.5, cup: 0.35, lift: 0.7, set: 0.45, waist: 0.4, hips: 0.45, mass: 0.62, legs: 0.6, face: { eyes: 'tsurime', brows: 'straight', irisColor: 'green', mouth: 'fang' }, hair: { length: 'shoulder', bangs: 'parted', tails: 'ponytail', color: 'brown' }, outfit: { ...CREW, bottom: 'shorts', legwear: 'tights', colors: { ...CREW.colors, legwear: 'navy' } } } },
  { name: 'Ren', home: [3.4, -0.8], mirror: true, spec: { heads: 5.8, build: 0.25, legs: 0.7, mass: 0.3, headWidth: 0.82, face: { eyes: 'tareme', brows: 'arched', irisColor: 'green', extras: ['blush'] }, hair: { length: 'short', bangs: 'spiky', color: 'blonde' }, outfit: CREW } },
  { name: 'Hana', home: [-6.6, -2.2], spec: { heads: 6, femme: 1, build: 0.2, cup: 0.3, lift: 0.6, set: 0.35, waist: 0.5, hips: 0.45, mass: 0.35, legs: 0.5, headWidth: 0.82, face: { eyes: 'round', brows: 'thin', irisColor: 'blue', extras: ['blush'] }, hair: { length: 'bob', bangs: 'blunt', color: 'black', extras: ['ahoge'] }, outfit: { ...CREW, bottom: 'pleated', legwear: 'knee-socks', colors: { ...CREW.colors, legwear: 'white' } } } },
  { name: 'Kai', home: [6.6, -2.2], mirror: true, spec: { heads: 8.5, build: 0.1, legs: 1, mass: 0.2, headWidth: 0.76, neck: 0.9, face: { eyes: 'tsurime', brows: 'thin', lashes: 'heavy', irisColor: 'red', extras: ['mole'] }, hair: { length: 'bob', bangs: 'swept', color: 'purple' }, outfit: CREW } },
];

// ---- the dance ----------------------------------------------------------------------
// Moves on bars (packages/figure/lib/choreo.js MOVES). The lead follows the words; the
// crew holds the groove under the verses and dances the choruses with her.
const m = (bar, move, bars = 1, extra = {}) => ({ bar, bars, move, ...extra });

export const LEAD = [
  m(0, 'idle'),
  // verse 1
  m(1, 'idol', 2, { side: 'r' }),           // the first look
  m(3, 'sway', 2),                          // nerves
  m(5, 'groove', 2),                        // the drop
  m(7, 'point', 2, { side: 'r' }),          // devotion
  m(9, 'sway'),
  m(10, 'reach', 2, { side: 'l' }),         // a plea
  // chorus 1
  m(12, 'pump', 2, { side: 'r' }),          // upping
  m(14, 'jump'),                            // FOOM
  m(15, 'robot'),                           // the Chinese room
  m(16, 'wave'),                            // the trip
  m(17, 'point', 2, { side: 'l' }),         // the shoggoth
  m(19, 'idol', 1, { side: 'l' }),          // the eyes
  m(20, 'turn'),
  // verse 2
  m(21, 'sway', 2),                         // calm before
  m(23, 'pump', 1, { side: 'l' }),          // the singularity
  m(24, 'robot', 2),                        // acceleration
  m(26, 'groove'),
  m(27, 'wave', 2),                         // dissolving
  m(29, 'groove'),
  m(30, 'reach', 2, { side: 'r' }),         // a plea
  m(32, 'stepTouch'),
  // chorus 2
  m(33, 'pump', 1, { side: 'r' }),          // upping
  m(34, 'jump'),                            // the basilisk
  m(35, 'point', 1, { side: 'r' }),         // up
  m(36, 'wave'),                            // the Omega Point
  m(37, 'pump', 2, { side: 'l' }),          // the big number
  m(39, 'shrug', 2),                        // hubris
  m(41, 'robot', 2),                        // training steps
  // verse 3
  m(43, 'sway', 2),                         // the old machine
  m(45, 'turn', 1, { dir: 1 }),             // a sharp left turn
  m(46, 'groove'),
  m(47, 'shrug'),                           // no review
  m(48, 'groove'),
  m(49, 'reach', 3, { side: 'l' }),         // a plea
  m(52, 'stepTouch'),
  // half-time chorus
  m(53, 'pump', 1, { side: 'r' }),          // upping
  m(54, 'wave'),                            // paperclips
  m(55, 'shrug'),                           // nobody minding the switch
  m(56, 'reach', 1, { side: 'r' }),         // cornered
  m(57, 'jump'),                            // the fuse
  m(58, 'sway', 2),                         // the blues
  // final chorus
  m(60, 'robot', 2),                        // the robot
  m(62, 'point', 1, { side: 'l' }),         // defiance
  m(63, 'groove'),                          // density
  m(64, 'stepTouch'),                       // breakout
  m(65, 'pump', 1, { side: 'r' }),          // scale
  m(66, 'shrug', 1),                        // askew
  m(67, 'pump', 2, { side: 'l' }),          // upping
  m(69, 'wave'),                            // foretold
  m(70, 'groove'),
  m(71, 'turn', 1, { dir: -1 }),            // recursive self-upgrade
  m(72, 'reach', 2, { side: 'r' }),         // the question
  m(74, 'stepTouch', 2),
  m(76, 'shrug'),                           // the stop
  // outro
  m(77, 'stepTouch', 2),
  m(79, 'jump'),
  m(80, 'wave', 2),
  m(82, 'turn'),
  m(83, 'idol', 1, { side: 'r' }),
  m(84, 'bow', 2),
];

export const CREW_DANCE = [
  m(0, 'idle', 12),
  m(12, 'groove', 2), m(14, 'jump'), m(15, 'robot'), m(16, 'wave'), m(17, 'stepTouch', 3), m(20, 'turn'),
  m(21, 'sway', 12),
  m(33, 'pump', 1, { side: 'r' }), m(34, 'jump'), m(35, 'point', 1, { side: 'r' }), m(36, 'wave'), m(37, 'pump', 2, { side: 'r' }), m(39, 'groove', 2), m(41, 'robot', 2),
  m(43, 'groove', 2), m(45, 'turn', 1, { dir: 1 }), m(46, 'stepTouch', 7),
  m(53, 'sway', 4), m(57, 'jump'), m(58, 'sway', 2),
  m(60, 'robot', 2), m(62, 'stepTouch', 3), m(65, 'pump', 1, { side: 'r' }), m(66, 'groove'), m(67, 'pump', 2, { side: 'r' }), m(69, 'wave'), m(70, 'groove'), m(71, 'turn', 1, { dir: -1 }), m(72, 'stepTouch', 4),
  m(76, 'freeze'),
  m(77, 'stepTouch', 2), m(79, 'jump'), m(80, 'wave', 2), m(82, 'turn'), m(83, 'point', 1, { side: 'r' }),
  m(84, 'bow', 2),
];

// ---- the shots ----------------------------------------------------------------------
// A cut on a bar. `on`: who the camera frames ('all', or a dancer's index), and how:
//   wide   the stage          full   a dancer head to toe     bust   head and shoulders
//   face   the face           hand   the right hand (it follows it)
// yaw, pitch: the camera's angle (radians; pitch > 0 looks down); `drift` turns it over the shot.
const shot = (bar, kind, extra = {}) => ({ bar, kind, on: 0, yaw: 0, pitch: 0.06, drift: 0, ...extra });
export const SHOTS = [
  shot(0, 'wide', { on: 'all', yaw: 0.35, drift: -0.3 }),
  shot(1, 'face', { yaw: 0.25 }),
  shot(3, 'full', { yaw: -0.3, drift: 0.2 }),
  shot(5, 'wide', { on: 'all', pitch: 0.18 }),
  shot(7, 'hand', { yaw: -1.0 }),
  shot(9, 'bust', { yaw: -0.2 }),
  shot(10, 'full', { yaw: 0.6, drift: -0.3 }),
  shot(12, 'wide', { on: 'all', pitch: -0.04 }),
  shot(14, 'full', { pitch: -0.12 }),
  shot(15, 'wide', { on: 'all', yaw: -0.5, drift: 0.4 }),
  shot(17, 'hand', { yaw: 1.0 }),
  shot(18, 'full', { yaw: 0.2 }),
  shot(19, 'face', { yaw: -0.2 }),
  shot(20, 'wide', { on: 'all', yaw: 0.8, drift: -1.2 }),
  shot(21, 'full', { yaw: 0.25 }),
  shot(23, 'bust', { yaw: -0.35, pitch: -0.05 }),
  shot(24, 'wide', { on: 'all', yaw: -0.25 }),
  shot(27, 'full', { yaw: 0.5, drift: -0.4 }),
  shot(29, 'face', { yaw: 0.15 }),
  shot(30, 'full', { on: 0, yaw: -0.6 }),
  shot(32, 'full', { on: 2, yaw: 0.3 }),
  shot(33, 'wide', { on: 'all', pitch: -0.05 }),
  shot(35, 'hand', { yaw: -0.9 }),
  shot(36, 'wide', { on: 'all', yaw: 0.4, drift: -0.5 }),
  shot(38, 'bust', { yaw: 0.3 }),
  shot(39, 'full', { yaw: -0.2 }),
  shot(41, 'wide', { on: 'all', yaw: -0.7, drift: 0.5 }),
  shot(43, 'full', { on: 1, yaw: 0.3 }),
  shot(45, 'wide', { on: 'all', yaw: 0.2 }),
  shot(47, 'face', { yaw: 0.3 }),
  shot(48, 'full', { on: 3, yaw: -0.3 }),
  shot(49, 'full', { yaw: 0.7, drift: -0.5 }),
  shot(51, 'bust', { yaw: 0.4 }),
  shot(52, 'wide', { on: 'all', pitch: 0.2 }),
  shot(53, 'full', { yaw: -0.25, pitch: -0.1 }),
  shot(55, 'bust', { yaw: 0.2 }),
  shot(56, 'full', { on: 4, yaw: 0.35 }),
  shot(57, 'wide', { on: 'all' }),
  shot(58, 'face', { yaw: -0.3 }),
  shot(60, 'wide', { on: 'all', yaw: 0.9, drift: -1.8 }),
  shot(62, 'hand', { yaw: 0.9 }),
  shot(63, 'full', { yaw: 0.2, pitch: -0.1 }),
  shot(65, 'wide', { on: 'all', pitch: -0.06 }),
  shot(67, 'bust', { yaw: -0.25 }),
  shot(69, 'wide', { on: 'all', yaw: -0.4, drift: 0.8 }),
  shot(71, 'full', { yaw: 0.3 }),
  shot(72, 'full', { yaw: -0.5, drift: 0.3 }),
  shot(74, 'wide', { on: 'all', pitch: 0.14 }),
  shot(76, 'face', { yaw: 0 }),
  shot(77, 'wide', { on: 'all', yaw: 0.5, drift: -1.0 }),
  shot(80, 'full', { yaw: 0.2 }),
  shot(82, 'wide', { on: 'all', yaw: -0.3, drift: 0.6 }),
  shot(83, 'bust', { yaw: 0.15 }),
  shot(84, 'wide', { on: 'all', pitch: 0.1 }),
];
