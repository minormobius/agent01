/* FALL LINE's levels, hand made, each teaching one thing, getting harder (the selftest holds them to rising, every
   route to the oracle getting down it, and the stored par and difficulty to the oracle's). A level is a tree of trails
   (trails.js): the first from the top, the others forking off one already made ({ from, at }); a segment is
   { len, r, dir (0 right, 90 ana, 180 left, 270 kata), twist, grade }. R is the trails' radius, grade the default drop
   per metre. par (s) and score (/10) are the oracle's (descent.js solve), stored so the menu needn't ride every level on
   load, and held to the oracle by the selftest. */
export const LEVELS = [
  { name: "Drop in", par: 29.8, score: 1.72, R: 3, grade: 0.06, lesson: "Downhill: the slope sets your speed, the stick still sets your lean. Follow the trail to the bottom.",
    trails: [{ segs: [{ len: 25 }, { len: 40, r: 40, dir: 0 }, { len: 35 }] }] },
  { name: "Faster", par: 23.2, score: 3.95, R: 3, grade: 0.12, lesson: "Steeper, so faster, and a bend at speed needs more lean: v² more. Look ahead.",
    trails: [{ segs: [{ len: 20 }, { len: 30, r: 28, dir: 0 }, { len: 10 }, { len: 30, r: 28, dir: 180 }, { len: 25 }] }] },
  { name: "Into w", par: 27.7, score: 4.47, R: 3, grade: 0.09, lesson: "The trail falls away ana, out of the space you can see. Teal kerbs, stick up.",
    trails: [{ segs: [{ len: 25 }, { len: 30, r: 30, dir: 90 }, { len: 12 }, { len: 26, r: 30, dir: 270 }, { len: 25 }] }] },
  { name: "Fork", par: 19.8, score: 5.74, R: 3, grade: 0.08, lesson: "Two ways down. Carry straight on and bend right, gentle and long; or peel off ana where it's steeper and shorter. Par is the quicker one.",
    trails: [{ segs: [{ len: 30 }, { len: 40, r: 40, dir: 0 }, { len: 30 }] }, { from: 0, at: 26, segs: [{ len: 14, r: 14, dir: 90, grade: 0.14 }, { len: 12, r: 14, dir: 270, grade: 0.14 }, { len: 40, grade: 0.14 }] }] },
  { name: "Switchbacks", par: 16.7, score: 5.98, R: 3, grade: 0.07, lesson: "Back and forth across the hill, the slow way; or the chute kata, straight down.",
    trails: [{ segs: [{ len: 15 }, { len: 22, r: 14, dir: 0 }, { len: 6 }, { len: 22, r: 14, dir: 180 }, { len: 6 }, { len: 22, r: 14, dir: 0 }, { len: 6 }, { len: 22, r: 14, dir: 180 }, { len: 15 }] },
      { from: 0, at: 12, segs: [{ len: 14, r: 14, dir: 270, grade: 0.16 }, { len: 12, r: 14, dir: 90, grade: 0.16 }, { len: 45, grade: 0.16 }] }] },
  { name: "Three ways", par: 14, score: 6.3, R: 3, grade: 0.1, lesson: "Two forks: kata early, right later, or stay on. Three ways down, three different hills.",
    trails: [{ segs: [{ len: 20 }, { len: 24, r: 30, dir: 45 }, { len: 30 }] }, { from: 0, at: 16, segs: [{ len: 12, r: 12, dir: 270, grade: 0.17 }, { len: 10, r: 12, dir: 90 }, { len: 30, grade: 0.17 }] },
      { from: 0, at: 40, segs: [{ len: 12, r: 12, dir: 0, grade: 0.15 }, { len: 10, r: 12, dir: 180 }, { len: 24, grade: 0.15 }] }] },
  { name: "Corkscrew run", par: 17.4, score: 6.88, R: 2.6, grade: 0.1, lesson: "A twisting descent, the bend's direction turning as you fall, and a steep way out of it kata.",
    trails: [{ segs: [{ len: 15 }, { len: 45, r: 22, dir: 0, twist: 3 }, { len: 20 }] }, { from: 0, at: 34, segs: [{ len: 12, r: 11, dir: 270, grade: 0.15 }, { len: 10, r: 11, dir: 90 }, { len: 26, grade: 0.15 }] }] },
  { name: "The mountain", par: 12.2, score: 7.33, R: 2.5, grade: 0.12, lesson: "All of it: a long, twisting, steep run with ways off it kata and ana. Find the quick one.",
    trails: [{ segs: [{ len: 12 }, { len: 24, r: 22, dir: 315 }, { len: 6 }, { len: 26, r: 20, dir: 135, twist: -3 }, { len: 14 }] },
      { from: 0, at: 18, segs: [{ len: 12, r: 11, dir: 270, grade: 0.19 }, { len: 10, r: 11, dir: 90 }, { len: 22, grade: 0.19 }] },
      { from: 0, at: 48, segs: [{ len: 12, r: 11, dir: 240, grade: 0.18 }, { len: 10, r: 11, dir: 60 }, { len: 16, grade: 0.18 }] }] },
];
